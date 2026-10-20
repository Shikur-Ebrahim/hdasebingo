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

// Middleware: Require Agent
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
  if (!data || data.role !== 'agent') {
    res.status(403).json({ error: 'Agent access only.' });
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

  // 4. Check agent's main balance
  const { data: user } = await supabase
    .from('users')
    .select('main_balance, first_name, username')
    .eq('telegram_id', telegramId)
    .single();

  if (!user || Number(user.main_balance || 0) < numAmount) {
    res.status(400).json({
      error: `Insufficient balance. Available: ${Number(user?.main_balance || 0).toLocaleString()} ETB`,
    });
    return;
  }

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

  // 6. Insert into agent_withdrawals
  const { data: withdrawal, error: insertErr } = await supabase
    .from('agent_withdrawals')
    .insert([{
      telegram_id: telegramId,
      bank_name: bankAccount.bank_name,
      account_holder_name: bankAccount.account_holder_name,
      account_number: bankAccount.account_number,
      amount: numAmount,
      status: 'pending',
    }])
    .select()
    .single();

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
      const safeAgentName = (user.username ? `@${user.username}` : user.first_name || 'Agent').replace(/[_*[\]]/g, '\\$&');
      const safeBank = bankAccount.bank_name.replace(/[_*[\]]/g, '\\$&');
      const safeHolder = bankAccount.account_holder_name.replace(/[_*[\]]/g, '\\$&');
      const safeAcc = bankAccount.account_number.replace(/[_*[\]]/g, '\\$&');
      const safeId = withdrawal.id.replace(/[_*[\]]/g, '\\$&');

      const msg =
        `⚡ *New Agent Withdrawal Request!*\n\n` +
        `👤 *Agent:* ${safeAgentName}\n` +
        `💰 *Amount:* *${numAmount.toLocaleString()} ETB*\n` +
        `🏦 *Bank:* ${safeBank}\n` +
        `📛 *Holder:* ${safeHolder}\n` +
        `🔢 *Account:* \`${safeAcc}\`\n\n` +
        `📋 *Ref:* \`${safeId.slice(0, 8).toUpperCase()}\`\n` +
        `👉 Check *Admin Dashboard → Agent Withdrawals*`;

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

  res.json({ success: true, withdrawal });
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
  res.json(data || []);
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
      users!agent_withdrawals_telegram_id_fkey(first_name, username, main_balance)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
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

  // Notify agent
  try {
    const botToken = process.env.BOT_TOKEN;
    if (botToken && record.telegram_id) {
      const msg =
        `✅ *Your Agent Withdrawal is Approved!*\n\n` +
        `💰 Amount: *${Number(record.amount).toLocaleString()} ETB*\n` +
        `🏦 Bank: *${record.bank_name}*\n` +
        `📋 Ref: \`${record.id.slice(0, 8).toUpperCase()}\`\n\n` +
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

  // 1. Refund agent's balance
  const { data: agentUser } = await supabase
    .from('users')
    .select('main_balance')
    .eq('telegram_id', record.telegram_id)
    .single();

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

  // 3. Notify agent
  try {
    const botToken = process.env.BOT_TOKEN;
    if (botToken && record.telegram_id) {
      const msg =
        `❌ *Your Agent Withdrawal Was Rejected*\n\n` +
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
