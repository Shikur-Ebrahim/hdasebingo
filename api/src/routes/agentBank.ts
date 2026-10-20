/**
 * Agent Bank Account — Save / retrieve bank details ONLY
 * No withdrawal, no balance deduction, nothing else.
 *
 * GET  /api/agent-bank/saved   — get agent's saved bank info
 * POST /api/agent-bank/save    — create or update bank info
 */
import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();
router.use(validateTelegramAuth);

// ── Only agents can use this ──
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

const hashPin = (pin: string, salt: string): string =>
  crypto.createHmac('sha256', salt).update(pin).digest('hex');

// ─────────────────────────────────────────────
// GET /api/agent-bank/saved
// Returns saved bank info (without pin_hash/salt)
// ─────────────────────────────────────────────
router.get('/saved', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { data, error } = await supabase
    .from('agent_bank_accounts')
    .select('id, bank_name, account_holder_name, account_number, updated_at')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? null);
});

// ─────────────────────────────────────────────
// POST /api/agent-bank/save
// Upsert bank details — no money moved
// ─────────────────────────────────────────────
router.post('/save', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { bank_name, account_holder_name, account_number, pin } = req.body;

  if (!bank_name || !account_holder_name || !account_number || !pin) {
    res.status(400).json({ error: 'All fields are required.' });
    return;
  }
  if (!/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const pin_hash = hashPin(pin, salt);

  // Check if record already exists
  const { data: existing } = await supabase
    .from('agent_bank_accounts')
    .select('id')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (existing) {
    // Update
    const { error } = await supabase
      .from('agent_bank_accounts')
      .update({
        bank_name: bank_name.trim(),
        account_holder_name: account_holder_name.trim(),
        account_number: account_number.trim(),
        pin_hash,
        pin_salt: salt,
        updated_at: new Date().toISOString(),
      })
      .eq('telegram_id', telegramId);

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true, action: 'updated' });
  } else {
    // Insert
    const { error } = await supabase
      .from('agent_bank_accounts')
      .insert([{
        telegram_id: telegramId,
        bank_name: bank_name.trim(),
        account_holder_name: account_holder_name.trim(),
        account_number: account_number.trim(),
        pin_hash,
        pin_salt: salt,
      }]);

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true, action: 'created' });
  }
});

export default router;
