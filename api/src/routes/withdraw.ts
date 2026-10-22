import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { getWithdrawalFeeSettings, calculateWithdrawalFee } from '../services/withdrawalFee';

const router = Router();

router.use(validateTelegramAuth);

// GET /api/withdraw/fee-settings — public/user endpoint to get fee tiers and user role
router.get('/fee-settings', async (req: AuthRequest, res) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const [feeSettings, { data: user }] = await Promise.all([
      getWithdrawalFeeSettings(),
      supabase.from('users').select('role').eq('telegram_id', telegramId).maybeSingle(),
    ]);
    res.json({
      settings: feeSettings,
      // Flattened properties for easy and backwards-compatible consumption
      enabled: feeSettings.is_enabled,
      is_enabled: feeSettings.is_enabled,
      tier1_max: feeSettings.tier1_max_amount,
      tier1_max_amount: feeSettings.tier1_max_amount,
      tier1_fee: feeSettings.tier1_fee_percent,
      tier1_fee_percent: feeSettings.tier1_fee_percent,
      tier2_max: feeSettings.tier2_max_amount,
      tier2_max_amount: feeSettings.tier2_max_amount,
      tier2_fee: feeSettings.tier2_fee_percent,
      tier2_fee_percent: feeSettings.tier2_fee_percent,
      tier3_fee: feeSettings.tier3_fee_percent,
      tier3_fee_percent: feeSettings.tier3_fee_percent,
      user_role: user?.role || 'user',
      is_exempt: user?.role === 'agent' || user?.role === 'promoter',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/withdraw/methods — all active withdrawal methods
router.get('/methods', async (_req, res) => {
  const { data, error } = await supabase
    .from('withdrawal_methods')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// POST /api/withdraw/request — submit a withdrawal request
router.post('/request', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const { method_id, amount, account_name, account_number } = req.body;

  if (!method_id || !amount || !account_name || !account_number) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  const cleanAccountNumber = String(account_number || '').trim().replace(/\D/g, '');
  if (!cleanAccountNumber) {
    res.status(400).json({ error: 'Account number must contain digits only' });
    return;
  }

  // 1. Check if user has a pending withdrawal
  const { data: pending } = await supabase
    .from('withdrawals')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('status', 'pending')
    .single();

  if (pending) {
    res.status(400).json({ error: 'You already have a pending withdrawal request.' });
    return;
  }

  // 2. Fetch method to check min_withdrawal
  const { data: method } = await supabase
    .from('withdrawal_methods')
    .select('min_withdrawal, type, logo_url')
    .eq('id', method_id)
    .single();

  if (!method) {
    res.status(400).json({ error: 'Invalid withdrawal method' });
    return;
  }

  if (amount < method.min_withdrawal) {
    res.status(400).json({ error: `Minimum withdrawal is ${method.min_withdrawal} ETB` });
    return;
  }

  // 3. Check user's main balance and role
  const { data: user } = await supabase
    .from('users')
    .select('main_balance, role')
    .eq('telegram_id', telegramId)
    .single();

  if (!user || user.main_balance < amount) {
    res.status(400).json({ error: 'Insufficient main balance.' });
    return;
  }

  // Calculate tiered withdrawal fee (Agents & Promoters are strictly 0% exempt)
  const feeSettings = await getWithdrawalFeeSettings();
  const { fee_percent, fee_amount, net_amount } = calculateWithdrawalFee(
    Number(amount),
    user.role,
    feeSettings
  );

  // Atomically deduct the main_balance
  const { data: updateData, error: updateErr } = await supabase
    .from('users')
    .update({ main_balance: user.main_balance - amount })
    .eq('telegram_id', telegramId)
    .gte('main_balance', amount) // Safety check
    .select()
    .single();

  if (updateErr || !updateData) {
    res.status(400).json({ error: 'Failed to process balance deduction. Please try again.' });
    return;
  }

  // 4. Insert withdrawal request with fee tracking
  const insertPayload: any = {
    telegram_id: telegramId,
    method_id,
    amount,
    fee_percent,
    fee_amount,
    net_amount,
    account_name: String(account_name).trim(),
    account_number: cleanAccountNumber,
    status: 'pending',
  };

  let { data: withdrawal, error: insertErr } = await supabase
    .from('withdrawals')
    .insert([insertPayload])
    .select()
    .single();

  // Fallback: if fee columns don't exist yet in Supabase table
  if (insertErr && (insertErr.message.includes('fee_amount') || insertErr.message.includes('net_amount'))) {
    const { fee_percent: _, fee_amount: __, net_amount: ___, ...fallbackPayload } = insertPayload;
    const resFallback = await supabase
      .from('withdrawals')
      .insert([fallbackPayload])
      .select()
      .single();
    withdrawal = resFallback.data;
    insertErr = resFallback.error;
  }

  if (insertErr) {
    // If insertion fails, refund the main_balance
    await supabase.from('users').update({ main_balance: user.main_balance }).eq('telegram_id', telegramId);
    res.status(500).json({ error: insertErr.message });
    return;
  }

  // 5. Notify workers via Telegram
  try {
    const { data: workers } = await supabase.from('users').select('telegram_id').eq('role', 'worker');

    if (workers && workers.length > 0) {
      const safeUsername = (req.telegramUser?.username || req.telegramUser?.first_name || 'User').replace(/[_*[\]]/g, '\\$&');
      const safeMethodType = (method.type).toUpperCase().replace(/[_*[\]]/g, '\\$&');
      const safeAccountName = account_name.replace(/[_*[\]]/g, '\\$&');
      const safeAccountNumber = account_number.replace(/[_*[\]]/g, '\\$&');

      const feeNotice = fee_amount > 0 
        ? `\n🏷️ Fee (${fee_percent}%): *${fee_amount.toLocaleString('en-US')} ETB*\n💵 *Payout to Send: ${net_amount.toLocaleString('en-US')} ETB*`
        : `\n💵 *Payout to Send: ${Number(amount).toLocaleString('en-US')} ETB* (No Fee)`;

      const message = `💸 *New Withdrawal Request!*\n\n` +
                      `👤 User: @${safeUsername}\n` +
                      `💰 Requested: *${Number(amount).toLocaleString('en-US')} ETB*` +
                      feeNotice + `\n` +
                      `🏦 Method: *${safeMethodType}*\n` +
                      `📝 Name: *${safeAccountName}*\n` +
                      `🔢 Account: \`${safeAccountNumber}\`\n\n` +
                      `👇 Please check the Admin Dashboard.`;

      const botToken = process.env.BOT_TOKEN;
      if (botToken) {
        for (const worker of workers) {
          if (!worker.telegram_id) continue;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: worker.telegram_id, text: message, parse_mode: 'Markdown' })
          }).catch(e => console.error('Failed to send to worker:', e));
        }
      }
    }
  } catch (notifyErr) {
    console.error('Notification error:', notifyErr);
  }

  res.json({
    success: true,
    withdrawal: {
      ...withdrawal,
      fee_percent,
      fee_amount,
      net_amount,
    },
  });
});

// GET /api/withdraw/history — user's withdrawal history
router.get('/history', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const [{ data, error }, feeSettings, { data: user }] = await Promise.all([
    supabase
      .from('withdrawals')
      .select('*, withdrawal_methods(type, logo_url)')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(20),
    getWithdrawalFeeSettings(),
    supabase.from('users').select('role').eq('telegram_id', telegramId).maybeSingle(),
  ]);

  if (error) { res.status(500).json({ error: error.message }); return; }

  const enriched = (data || []).map((w: any) => {
    let fee_percent = w.fee_percent;
    let fee_amount = w.fee_amount;
    let net_amount = w.net_amount;

    if (fee_percent === undefined || fee_percent === null || net_amount === undefined || net_amount === null) {
      const calc = calculateWithdrawalFee(Number(w.amount), user?.role, feeSettings);
      fee_percent = calc.fee_percent;
      fee_amount = calc.fee_amount;
      net_amount = calc.net_amount;
    }

    return {
      ...w,
      fee_percent: Number(fee_percent) || 0,
      fee_amount: Number(fee_amount) || 0,
      net_amount: Number(net_amount) || Number(w.amount),
    };
  });

  res.json(enriched);
});

export default router;
