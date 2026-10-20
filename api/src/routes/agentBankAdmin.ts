/**
 * Admin routes for Agent Bank Withdrawals
 * Mounted at: /api/admin/agent-bank/...
 * 
 * GET  /api/admin/agent-bank/list
 * POST /api/admin/agent-bank/approve
 * POST /api/admin/agent-bank/reject
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

router.use(validateTelegramAuth);

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
  if (!data || (data.role !== 'admin' && data.role !== 'worker')) {
    res.status(403).json({ error: 'Admin access only.' });
    return;
  }
  next();
};

// GET /api/admin/agent-bank/list?status=pending
router.get('/list', requireAdmin, async (req: AuthRequest, res: Response) => {
  const status = (req.query.status as string) || 'all';
  let query = supabase
    .from('agent_bank_withdrawals')
    .select(`
      id, telegram_id, bank_name, full_name, account_number,
      amount, status, admin_note, created_at, processed_at,
      users!agent_bank_withdrawals_telegram_id_fkey(first_name, username, main_balance)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// POST /api/admin/agent-bank/approve
router.post('/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id, admin_note } = req.body;
  if (!id) { res.status(400).json({ error: 'id required' }); return; }

  const { data: record } = await supabase
    .from('agent_bank_withdrawals')
    .select('id, status, amount, telegram_id')
    .eq('id', id)
    .single();

  if (!record) { res.status(404).json({ error: 'Record not found.' }); return; }
  if (record.status !== 'pending') {
    res.status(400).json({ error: `Already ${record.status}.` }); return;
  }

  const { error } = await supabase
    .from('agent_bank_withdrawals')
    .update({
      status: 'approved',
      admin_note: admin_note || 'Approved',
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify agent via Telegram
  try {
    const botToken = process.env.BOT_TOKEN;
    if (botToken && record.telegram_id) {
      const msg =
        `✅ *Your Agent Bank Withdrawal is Approved!*\n\n` +
        `💰 Amount: *${Number(record.amount).toLocaleString()} ETB*\n` +
        `📋 Ref: \`${record.id}\`\n\n` +
        `${admin_note ? `📝 Note: ${admin_note}\n\n` : ''}` +
        `Your funds have been processed. Thank you!`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: record.telegram_id, text: msg, parse_mode: 'Markdown' }),
      }).catch(() => {});
    }
  } catch {}

  res.json({ success: true });
});

// POST /api/admin/agent-bank/reject
router.post('/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id, admin_note } = req.body;
  if (!id) { res.status(400).json({ error: 'id required' }); return; }

  const { data: record } = await supabase
    .from('agent_bank_withdrawals')
    .select('id, status, amount, telegram_id')
    .eq('id', id)
    .single();

  if (!record) { res.status(404).json({ error: 'Record not found.' }); return; }
  if (record.status !== 'pending') {
    res.status(400).json({ error: `Already ${record.status}.` }); return;
  }

  // Refund balance
  const { data: agentUser } = await supabase
    .from('users')
    .select('main_balance')
    .eq('telegram_id', record.telegram_id)
    .single();

  if (agentUser) {
    await supabase
      .from('users')
      .update({ main_balance: (agentUser.main_balance ?? 0) + Number(record.amount) })
      .eq('telegram_id', record.telegram_id);
  }

  const { error } = await supabase
    .from('agent_bank_withdrawals')
    .update({
      status: 'rejected',
      admin_note: admin_note || 'Rejected by admin',
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify agent
  try {
    const botToken = process.env.BOT_TOKEN;
    if (botToken && record.telegram_id) {
      const msg =
        `❌ *Your Agent Bank Withdrawal was Rejected*\n\n` +
        `💰 Amount: *${Number(record.amount).toLocaleString()} ETB* (refunded to your balance)\n` +
        `📋 Ref: \`${record.id}\`\n\n` +
        `${admin_note ? `📝 Reason: ${admin_note}\n\n` : ''}` +
        `Please contact support if you have questions.`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: record.telegram_id, text: msg, parse_mode: 'Markdown' }),
      }).catch(() => {});
    }
  } catch {}

  res.json({ success: true });
});

export default router;
