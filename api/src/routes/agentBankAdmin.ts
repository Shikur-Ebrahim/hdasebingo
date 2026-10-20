/**
 * Admin — view saved agent bank accounts (read-only)
 * GET /api/admin/agent-bank/list
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

// GET /api/admin/agent-bank/list
router.get('/list', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('agent_bank_accounts')
    .select(`
      id, telegram_id, bank_name, account_holder_name, account_number, updated_at,
      users!agent_bank_accounts_telegram_id_fkey(first_name, username)
    `)
    .order('updated_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
