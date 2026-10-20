/**
 * Admin — view saved agent bank accounts, reset PIN, update details, delete
 * Base route: /api/admin/agent-bank
 */
import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();
router.use(validateTelegramAuth);

const hashPin = (pin: string, salt: string): string =>
  crypto.createHmac('sha256', salt).update(pin).digest('hex');

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

// GET /api/admin/agent-bank/list
router.get('/list', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('agent_bank_accounts')
    .select(`
      *,
      users!agent_bank_accounts_telegram_id_fkey(first_name, username)
    `)
    .order('updated_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data || []);
});

// POST /api/admin/agent-bank/reset-pin
router.post('/reset-pin', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { telegram_id, new_pin } = req.body;
  if (!telegram_id || !new_pin || !/^\d{6}$/.test(new_pin)) {
    res.status(400).json({ error: 'Valid telegram_id and 6-digit new_pin are required.' });
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const pin_hash = hashPin(new_pin, salt);

  const updatePayload: any = {
    pin_hash,
    pin_salt: salt,
    plain_pin: new_pin,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from('agent_bank_accounts')
    .update(updatePayload)
    .eq('telegram_id', telegram_id);

  if (error && error.message && error.message.includes('plain_pin')) {
    delete updatePayload.plain_pin;
    const retry = await supabase
      .from('agent_bank_accounts')
      .update(updatePayload)
      .eq('telegram_id', telegram_id);
    error = retry.error;
  }

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true, message: 'PIN updated successfully.' });
});

// POST /api/admin/agent-bank/update-details
router.post('/update-details', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { telegram_id, bank_name, account_holder_name, account_number } = req.body;
  if (!telegram_id) {
    res.status(400).json({ error: 'telegram_id is required.' });
    return;
  }

  const updates: any = { updated_at: new Date().toISOString() };
  if (bank_name) updates.bank_name = bank_name.trim();
  if (account_holder_name) updates.account_holder_name = account_holder_name.trim();
  if (account_number) updates.account_number = account_number.trim();

  const { error } = await supabase
    .from('agent_bank_accounts')
    .update(updates)
    .eq('telegram_id', telegram_id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

// DELETE /api/admin/agent-bank/delete/:telegramId
router.delete('/delete/:telegramId', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { telegramId } = req.params;
  const { error } = await supabase
    .from('agent_bank_accounts')
    .delete()
    .eq('telegram_id', telegramId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

export default router;
