/**
 * Agent Attack Bank — Independent withdrawal route for agents only
 * Table: agent_bank_withdrawals
 * POST /api/agent-bank/request
 * GET  /api/agent-bank/history
 * GET  /api/agent-bank/status/:id
 * POST /api/admin/agent-bank/approve  (admin only)
 * POST /api/admin/agent-bank/reject   (admin only)
 * GET  /api/admin/agent-bank/list     (admin only)
 */
import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

router.use(validateTelegramAuth);

// ── Helper: verify 6-digit PIN against stored hash ──
const hashPin = (pin: string, salt: string): string =>
  crypto.createHmac('sha256', salt).update(pin).digest('hex');

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

// ─────────────────────────────────────────────
// POST /api/agent-bank/request
// ─────────────────────────────────────────────
router.post('/request', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { bank_name, full_name, account_number, pin, amount } = req.body;

  // Validate required fields
  if (!bank_name || !full_name || !account_number || !pin || !amount) {
    res.status(400).json({ error: 'All fields are required.' });
    return;
  }
  if (!/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
    return;
  }
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < 1) {
    res.status(400).json({ error: 'Invalid amount.' });
    return;
  }

  // Check for existing pending request
  const { data: existing } = await supabase
    .from('agent_bank_withdrawals')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    res.status(400).json({ error: 'You already have a pending withdrawal. Wait for it to be processed.' });
    return;
  }

  // Fetch agent balance
  const { data: agentUser } = await supabase
    .from('users')
    .select('main_balance, first_name')
    .eq('telegram_id', telegramId)
    .single();

  if (!agentUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if ((agentUser.main_balance ?? 0) < numAmount) {
    res.status(400).json({ error: `Insufficient balance. Available: ${agentUser.main_balance} ETB` });
    return;
  }

  // Hash PIN with a per-request salt for security
  const salt = crypto.randomBytes(16).toString('hex');
  const pin_hash = hashPin(pin, salt);

  // Deduct balance atomically
  const { data: updated, error: balErr } = await supabase
    .from('users')
    .update({ main_balance: agentUser.main_balance - numAmount })
    .eq('telegram_id', telegramId)
    .gte('main_balance', numAmount)
    .select()
    .single();

  if (balErr || !updated) {
    res.status(400).json({ error: 'Failed to deduct balance. Please try again.' });
    return;
  }

  // Insert withdrawal record
  const { data: record, error: insertErr } = await supabase
    .from('agent_bank_withdrawals')
    .insert([{
      telegram_id: telegramId,
      bank_name: bank_name.trim(),
      full_name: full_name.trim(),
      account_number: account_number.trim(),
      amount: numAmount,
      pin_hash,
      pin_salt: salt,
      status: 'pending',
    }])
    .select()
    .single();

  if (insertErr) {
    // Refund on insert failure
    await supabase
      .from('users')
      .update({ main_balance: agentUser.main_balance })
      .eq('telegram_id', telegramId);
    res.status(500).json({ error: 'Failed to create withdrawal. Refunded.' });
    return;
  }

  // Notify admins + workers via Telegram
  try {
    const { data: admins } = await supabase
      .from('users')
      .select('telegram_id')
      .in('role', ['admin', 'worker']);

    const botToken = process.env.BOT_TOKEN;
    if (botToken && admins && admins.length > 0) {
      const safeName = (req.telegramUser?.username || req.telegramUser?.first_name || 'Agent').replace(/[_*[\]]/g, '\\$&');
      const msg =
        `🏦 *Agent Bank Withdrawal!*\n\n` +
        `👤 Agent: @${safeName}\n` +
        `💰 Amount: *${numAmount.toLocaleString()} ETB*\n` +
        `🏛 Bank: *${bank_name}*\n` +
        `📛 Name: *${full_name}*\n` +
        `🔢 Account: \`${account_number}\`\n\n` +
        `📋 Ref ID: \`${record.id}\`\n` +
        `👉 Check Admin Dashboard → Agent Bank`;

      for (const a of admins) {
        if (!a.telegram_id) continue;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: a.telegram_id, text: msg, parse_mode: 'Markdown' }),
        }).catch(() => {});
      }
    }
  } catch {}

  res.json({ success: true, id: record.id, status: record.status });
});

// ─────────────────────────────────────────────
// GET /api/agent-bank/history
// ─────────────────────────────────────────────
router.get('/history', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { data, error } = await supabase
    .from('agent_bank_withdrawals')
    .select('id, bank_name, full_name, account_number, amount, status, admin_note, created_at, processed_at')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ─────────────────────────────────────────────
// GET /api/agent-bank/status/:id
// ─────────────────────────────────────────────
router.get('/status/:id', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { id } = req.params;
  const { data, error } = await supabase
    .from('agent_bank_withdrawals')
    .select('id, status, admin_note, amount, bank_name, created_at, processed_at')
    .eq('id', id)
    .eq('telegram_id', telegramId)
    .single();

  if (error || !data) { res.status(404).json({ error: 'Not found.' }); return; }
  res.json(data);
});

export default router;
