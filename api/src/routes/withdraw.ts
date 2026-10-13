import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

router.use(validateTelegramAuth);

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

  // 3. Check user's main balance and atomically deduct
  const { data: user } = await supabase
    .from('users')
    .select('main_balance')
    .eq('telegram_id', telegramId)
    .single();

  if (!user || user.main_balance < amount) {
    res.status(400).json({ error: 'Insufficient main balance.' });
    return;
  }

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

  // 4. Insert withdrawal request
  const { data: withdrawal, error: insertErr } = await supabase
    .from('withdrawals')
    .insert([{ 
      telegram_id: telegramId, 
      method_id, 
      amount, 
      account_name, 
      account_number, 
      status: 'pending' 
    }])
    .select()
    .single();

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

      const message = `💸 *New Withdrawal Request!*\n\n` +
                      `👤 User: @${safeUsername}\n` +
                      `💰 Amount: *${Number(amount).toLocaleString('en-US')} ETB*\n` +
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

  res.json({ success: true, withdrawal });
});

// GET /api/withdraw/history — user's withdrawal history
router.get('/history', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*, withdrawal_methods(type, logo_url)')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
