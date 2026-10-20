/**
 * Agent Bank Account — Save / retrieve bank details ONLY
 * No withdrawal, no balance deduction, nothing else.
 *
 * GET  /api/agent-bank/saved       — get agent's saved bank info
 * POST /api/agent-bank/save        — create (first time) bank info
 * POST /api/agent-bank/update      — update bank info (requires current PIN)
 * POST /api/agent-bank/change-pin  — change PIN (requires current PIN + new PIN)
 */
import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();
router.use(validateTelegramAuth);

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

const verifyPin = (inputPin: string, storedHash: string, storedSalt: string): boolean =>
  hashPin(inputPin, storedSalt) === storedHash;

// ─────────────────────────────────────────────
// GET /api/agent-bank/saved
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
// POST /api/agent-bank/save  (first-time only)
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

  // Reject if account already exists — use /update instead
  const { data: existing } = await supabase
    .from('agent_bank_accounts')
    .select('id')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (existing) {
    res.status(400).json({ error: 'Account already saved. Use update endpoint.' });
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const pin_hash = hashPin(pin, salt);

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
});

// ─────────────────────────────────────────────
// POST /api/agent-bank/update (requires current PIN)
// ─────────────────────────────────────────────
router.post('/update', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { bank_name, account_holder_name, account_number, current_pin } = req.body;

  if (!bank_name || !account_holder_name || !account_number || !current_pin) {
    res.status(400).json({ error: 'All fields including current PIN are required.' });
    return;
  }
  if (!/^\d{6}$/.test(current_pin)) {
    res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
    return;
  }

  const { data: existing } = await supabase
    .from('agent_bank_accounts')
    .select('id, pin_hash, pin_salt')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (!existing) {
    res.status(404).json({ error: 'No saved bank account found.' });
    return;
  }

  // Verify current PIN
  if (!verifyPin(current_pin, existing.pin_hash, existing.pin_salt)) {
    res.status(401).json({ error: 'Incorrect PIN. Please enter your saved PIN to update.' });
    return;
  }

  const { error } = await supabase
    .from('agent_bank_accounts')
    .update({
      bank_name: bank_name.trim(),
      account_holder_name: account_holder_name.trim(),
      account_number: account_number.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true, action: 'updated' });
});

// ─────────────────────────────────────────────
// POST /api/agent-bank/change-pin
// ─────────────────────────────────────────────
router.post('/change-pin', requireAgent, async (req: AuthRequest, res: Response) => {
  const telegramId = req.telegramUser!.id.toString();
  const { current_pin, new_pin } = req.body;

  if (!current_pin || !new_pin) {
    res.status(400).json({ error: 'Current PIN and new PIN are required.' });
    return;
  }
  if (!/^\d{6}$/.test(current_pin) || !/^\d{6}$/.test(new_pin)) {
    res.status(400).json({ error: 'PINs must be exactly 6 digits.' });
    return;
  }
  if (current_pin === new_pin) {
    res.status(400).json({ error: 'New PIN must be different from current PIN.' });
    return;
  }

  const { data: existing } = await supabase
    .from('agent_bank_accounts')
    .select('id, pin_hash, pin_salt')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (!existing) {
    res.status(404).json({ error: 'No saved bank account found.' });
    return;
  }

  if (!verifyPin(current_pin, existing.pin_hash, existing.pin_salt)) {
    res.status(401).json({ error: 'Incorrect current PIN.' });
    return;
  }

  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPin(new_pin, newSalt);

  const { error } = await supabase
    .from('agent_bank_accounts')
    .update({
      pin_hash: newHash,
      pin_salt: newSalt,
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true, action: 'pin_changed' });
});

export default router;
