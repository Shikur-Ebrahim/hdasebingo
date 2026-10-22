/**
 * Agent Withdrawals — 100% Dedicated System for Agents & Admins
 * Table: agent_withdrawals
 *
 * Agent Endpoints:
 *  - POST /api/agent-withdraw/request        (Submit withdrawal with 6-digit PIN)
 *  - GET  /api/agent-withdraw/history        (Agent's withdrawal history)
 *
 * Admin Endpoints (Admin role ONLY):
 *  - GET  /api/admin/agent-withdrawals/list          (List withdrawals with filter)
 *  - GET  /api/admin/agent-withdrawals/pending-count (Pending count for badge)
 *  - POST /api/admin/agent-withdrawals/approve       (Approve payout)
 *  - POST /api/admin/agent-withdrawals/reject        (Reject & auto-refund)
 */
import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { getAgencyWithdrawalFeeSettings, calculateAgencyWithdrawalFee } from '../services/agencyWithdrawalFee';

// ── Agent Router ──
export const agentWithdrawRouter = Router();
agentWithdrawRouter.use(validateTelegramAuth);

// ── Admin Router ──
export const adminAgentWithdrawRouter = Router();
adminAgentWithdrawRouter.use(validateTelegramAuth);

const hashPin = (pin: string, salt: string): string =>
  crypto.createHmac('sha256', salt).update(pin).digest('hex');

const verifyPin = (inputPin: string, storedHash: string, storedSalt: string): boolean =>
  hashPin(inputPin, storedSalt) === storedHash;

// Middleware: Require Agent or Promoter
const requireAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const telegramId = req.telegramUser!.id.toString();
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('telegram_id', telegramId)
    .single();
  if (!data || (data.role !== 'agent' && data.role !== 'promoter')) {
    res.status(403).json({ error: 'Agent or Promoter access only.' });
    return;
  }
  next();
};

// Middleware: Require Admin (Strictly role = 'admin')
const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const telegramId = req.telegramUser!.id.toString();
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('telegram_id', telegramId)
    .single();
  if (!data || data.role !== 'admin') {
    res.status(403).json({ error: 'Admin access only.' });
    return;
  }
  next();
};

// ─────────────────────────────────────────────
// AGENT: GET /api/agent-withdraw/fee-settings
// ─────────────────────────────────────────────
agentWithdrawRouter.get('/fee-settings', requireAgent, async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await getAgencyWithdrawalFeeSettings();
    res.json({ ok: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// AGENT: POST /api/agent-withdraw/request
// ─────────────────────────────────────────────
agentWithdrawRouter.post('/request', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { amount, pin } = req.body;

  // 1. Validate inputs
  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'Please enter a valid amount to withdraw.' });
    return;
  }
  if (!pin || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
    return;
  }

  // 2. Fetch saved bank account
  const { data: bankAccount } = await supabase
    .from('agent_bank_accounts')
    .select('bank_name, account_holder_name, account_number, pin_hash, pin_salt')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (!bankAccount) {
    res.status(400).json({ error: 'No saved bank account found. Please link your bank in Attack Bank first.' });
    return;
  }

  // 3. Verify withdrawal PIN
  if (!verifyPin(pin, bankAccount.pin_hash, bankAccount.pin_salt)) {
    res.status(401).json({ error: 'Incorrect PIN! Please enter your valid 6-digit withdrawal PIN.' });
    return;
  }

  // 4. Check user's main balance & role
  const { data: user } = await supabase
    .from('users')
    .select('main_balance, first_name, username, role')
    .eq('telegram_id', telegramId)
    .single();

  if (!user || Number(user.main_balance || 0) < numAmount) {
    res.status(400).json({
      error: `Insufficient balance. Available: ${Number(user?.main_balance || 0).toLocaleString()} ETB`,
    });
    return;
  }

  // Calculate Server Fee for agency / promoter
  const feeSettings = await getAgencyWithdrawalFeeSettings();
  const feeCalc = calculateAgencyWithdrawalFee(numAmount, feeSettings);

  // 5. Atomically deduct balance
  const currentBal = Number(user.main_balance);
  const newBal = currentBal - numAmount;
  const { data: updatedUser, error: balErr } = await supabase
    .from('users')
    .update({ main_balance: newBal })
    .eq('telegram_id', telegramId)
    .gte('main_balance', numAmount)
    .select()
    .single();

  if (balErr || !updatedUser) {
    res.status(400).json({ error: 'Failed to process balance deduction. Please try again.' });
    return;
  }

  // 6. Insert into agent_withdrawals with fee breakdown (with fallback if schema doesn't have columns)
  const insertPayload: any = {
    telegram_id: telegramId,
    bank_name: bankAccount.bank_name,
    account_holder_name: bankAccount.account_holder_name,
    account_number: bankAccount.account_number,
    amount: numAmount,
    status: 'pending',
    fee_percent: feeCalc.fee_percent,
    fee_amount: feeCalc.fee_amount,
    net_amount: feeCalc.net_amount,
  };

  let { data: withdrawal, error: insertErr } = await supabase
    .from('agent_withdrawals')
    .insert([insertPayload])
    .select()
    .single();

  if (insertErr && (insertErr.message.includes('fee_') || insertErr.message.includes('net_amount'))) {
    const { fee_percent: _, fee_amount: __, net_amount: ___, ...fallbackPayload } = insertPayload;
    const fallbackRes = await supabase
      .from('agent_withdrawals')
      .insert([fallbackPayload])
      .select()
      .single();
    withdrawal = fallbackRes.data;
    insertErr = fallbackRes.error;
  }

  if (insertErr) {
    // Refund balance on insert failure
    await supabase.from('users').update({ main_balance: currentBal }).eq('telegram_id', telegramId);
    res.status(500).json({ error: 'Failed to submit withdrawal request. Balance refunded.' });
    return;
  }

  // 7. Send Telegram notification ONLY TO USERS WITH ROLE = 'admin' (NEVER WORKERS!)
  try {
    const { data: admins } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('role', 'admin');

    const botToken = process.env.BOT_TOKEN;
    if (botToken && admins && admins.length > 0) {
      const userRole = (user.role || '').toLowerCase();
      const roleTitle = userRole === 'promoter' ? 'Promoter' : 'Agent';
      const safeAgentName = (user.username ? `@${user.username}` : user.first_name || roleTitle).replace(/[_*[\]]/g, '\\$&');
      const safeBank = bankAccount.bank_name.replace(/[_*[\]]/g, '\\$&');
      const safeHolder = bankAccount.account_holder_name.replace(/[_*[\]]/g, '\\$&');
      const safeAcc = bankAccount.account_number.replace(/[_*[\]]/g, '\\$&');
      const safeId = (withdrawal?.id || '').replace(/[_*[\]]/g, '\\$&');

      const feeNotice = feeCalc.fee_amount > 0
        ? `⚙️ *Server Fee (${feeCalc.fee_percent}%):* *-${feeCalc.fee_amount.toLocaleString()} ETB*\n` +
          `💵 *Net Payout to Send:* *${feeCalc.net_amount.toLocaleString()} ETB*\n`
        : `💵 *Net Payout to Send:* *${numAmount.toLocaleString()} ETB*\n`;

      const msg =
        `⚡ *New ${roleTitle} Withdrawal Request!*\n\n` +
        `👤 *${roleTitle}:* ${safeAgentName}\n` +
        `💰 *Amount:* *${numAmount.toLocaleString()} ETB*\n` +
        feeNotice +
        `🏦 *Bank:* ${safeBank}\n` +
        `📛 *Holder:* ${safeHolder}\n` +
        `🔢 *Account:* \`${safeAcc}\`\n\n` +
        `📋 *Ref:* \`${safeId.slice(0, 8).toUpperCase()}\`\n` +
        `👉 Check *Admin Dashboard → Agent & Promoter Withdrawals*`;

      for (const a of admins) {
        if (!a.telegram_id) continue;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: a.telegram_id, text: msg, parse_mode: 'Markdown' }),
        }).catch(() => {});
      }
    }
  } catch (notifyErr) {
    console.error('Admin notification error:', notifyErr);
  }

  res.json({
    success: true,
    withdrawal: {
      ...withdrawal,
      fee_percent: feeCalc.fee_percent,
      fee_amount: feeCalc.fee_amount,
      net_amount: feeCalc.net_amount,
    },
  });
});

// ─────────────────────────────────────────────
// AGENT: GET /api/agent-withdraw/history
// ─────────────────────────────────────────────
agentWithdrawRouter.get('/history', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { data, error } = await supabase
    .from('agent_withdrawals')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) { res.status(500).json({ error: error.message }); return; }

  const feeSettings = await getAgencyWithdrawalFeeSettings();
  const enriched = (data || []).map((w: any) => {
    let fee_percent = w.fee_percent;
    let fee_amount = w.fee_amount;
    let net_amount = w.net_amount;

    if (fee_percent === undefined || fee_percent === null || net_amount === undefined || net_amount === null) {
      const calc = calculateAgencyWithdrawalFee(w.amount, feeSettings);
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

// ─────────────────────────────────────────────
// ADMIN: GET /api/admin/agent-withdrawals/list
// ─────────────────────────────────────────────
adminAgentWithdrawRouter.get('/list', requireAdmin, async (req: AuthRequest, res: Response) => {
  const status = (req.query.status as string) || 'all';

  let query = supabase
    .from('agent_withdrawals')
    .select(`
      id, telegram_id, bank_name, account_holder_name, account_number,
      amount, status, admin_note, created_at, processed_at,
      users!agent_withdrawals_telegram_id_fkey(first_name, username, role, main_balance)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  const feeSettings = await getAgencyWithdrawalFeeSettings();
  const enriched = (data || []).map((w: any) => {
    let fee_percent = w.fee_percent;
    let fee_amount = w.fee_amount;
    let net_amount = w.net_amount;

    if (fee_percent === undefined || fee_percent === null || net_amount === undefined || net_amount === null) {
      const calc = calculateAgencyWithdrawalFee(w.amount, feeSettings);
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

// ─────────────────────────────────────────────
// ADMIN: GET /api/admin/agent-withdrawals/pending-count
// ─────────────────────────────────────────────
adminAgentWithdrawRouter.get('/pending-count', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const { count, error } = await supabase
    .from('agent_withdrawals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ count: count || 0, pending: count || 0 });
});

// ─────────────────────────────────────────────
// ADMIN: POST /api/admin/agent-withdrawals/approve
// ─────────────────────────────────────────────
adminAgentWithdrawRouter.post('/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.body;
  if (!id) { res.status(400).json({ error: 'id required' }); return; }

  const { data: record } = await supabase
    .from('agent_withdrawals')
    .select('id, status, amount, bank_name, telegram_id')
    .eq('id', id)
    .single();

  if (!record) { res.status(404).json({ error: 'Withdrawal not found.' }); return; }
  if (record.status !== 'pending') {
    res.status(400).json({ error: `Withdrawal is already ${record.status}.` });
    return;
  }

  const { error } = await supabase
    .from('agent_withdrawals')
    .update({
      status: 'approved',
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify agent / promoter
  try {
    const { data: recipientUser } = await supabase
      .from('users')
      .select('role')
      .eq('telegram_id', record.telegram_id)
      .maybeSingle();

    const isPromoter = (recipientUser?.role || '').toLowerCase() === 'promoter';
    const roleTitle = isPromoter ? 'Promoter' : 'Agent';

    const feeSettings = await getAgencyWithdrawalFeeSettings();
    const feeCalc = calculateAgencyWithdrawalFee(record.amount, feeSettings);

    const botToken = process.env.BOT_TOKEN;
    if (botToken && record.telegram_id) {
      const feeLines = feeCalc.fee_amount > 0
        ? `⚙️ *Server Fee (${feeCalc.fee_percent}%):* *-${feeCalc.fee_amount.toLocaleString()} ETB*\n` +
          `💵 *Net Payout Received:* *${feeCalc.net_amount.toLocaleString()} ETB*\n`
        : `💵 *Payout Received:* *${Number(record.amount).toLocaleString()} ETB*\n`;

      const msg =
        `✅ *Your ${roleTitle} Withdrawal is Approved!*\n\n` +
        `💰 *Requested Amount:* *${Number(record.amount).toLocaleString()} ETB*\n` +
        feeLines +
        `🏦 *Bank:* *${record.bank_name}*\n` +
        `📋 *Ref:* \`${record.id.slice(0, 8).toUpperCase()}\`\n\n` +
        `Your payout has been processed successfully. Thank you for being a valued partner!`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: record.telegram_id, text: msg, parse_mode: 'Markdown' }),
      }).catch(() => {});
    }
  } catch {}

  res.json({ success: true });
});

// ─────────────────────────────────────────────
// ADMIN: POST /api/admin/agent-withdrawals/reject
// ─────────────────────────────────────────────
adminAgentWithdrawRouter.post('/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id, admin_note } = req.body;
  if (!id) { res.status(400).json({ error: 'id required' }); return; }

  const { data: record } = await supabase
    .from('agent_withdrawals')
    .select('id, status, amount, bank_name, telegram_id')
    .eq('id', id)
    .single();

  if (!record) { res.status(404).json({ error: 'Withdrawal not found.' }); return; }
  if (record.status !== 'pending') {
    res.status(400).json({ error: `Withdrawal is already ${record.status}.` });
    return;
  }

  // 1. Refund balance & get role
  const { data: agentUser } = await supabase
    .from('users')
    .select('main_balance, role')
    .eq('telegram_id', record.telegram_id)
    .single();

  const isPromoter = (agentUser?.role || '').toLowerCase() === 'promoter';
  const roleTitle = isPromoter ? 'Promoter' : 'Agent';

  if (agentUser) {
    const refundedBalance = Number(agentUser.main_balance || 0) + Number(record.amount);
    await supabase
      .from('users')
      .update({ main_balance: refundedBalance })
      .eq('telegram_id', record.telegram_id);
  }

  // 2. Mark rejected
  const { error } = await supabase
    .from('agent_withdrawals')
    .update({
      status: 'rejected',
      admin_note: admin_note || 'Rejected by administrator',
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) { res.status(500).json({ error: error.message }); return; }

  // 3. Notify agent / promoter
  try {
    const botToken = process.env.BOT_TOKEN;
    if (botToken && record.telegram_id) {
      const msg =
        `❌ *Your ${roleTitle} Withdrawal Was Rejected*\n\n` +
        `💰 Amount: *${Number(record.amount).toLocaleString()} ETB* *(Refunded to your balance)*\n` +
        `🏦 Bank: *${record.bank_name}*\n` +
        `📋 Ref: \`${record.id.slice(0, 8).toUpperCase()}\`\n` +
        `${admin_note ? `📝 Reason: ${admin_note}\n\n` : '\n'}` +
        `The amount has been fully refunded back to your balance. Contact support if you need assistance.`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: record.telegram_id, text: msg, parse_mode: 'Markdown' }),
      }).catch(() => {});
    }
  } catch {}

  res.json({ success: true });
});
