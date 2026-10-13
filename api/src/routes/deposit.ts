import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

router.use(validateTelegramAuth);

// GET /api/deposit/methods — all active deposit methods for users
router.get('/methods', async (_req, res) => {
  const { data, error } = await supabase
    .from('deposit_methods')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// POST /api/deposit/request — submit a deposit request
router.post('/request', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const { method_id, amount, screenshot_url } = req.body;

  if (!method_id || !amount) {
    res.status(400).json({ error: 'method_id and amount are required' });
    return;
  }

  // Check if user already has a pending deposit
  const { data: existingPending } = await supabase
    .from('deposits')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('status', 'pending')
    .single();

  if (existingPending) {
    res.status(400).json({ error: 'You already have a pending deposit. Please wait for approval.' });
    return;
  }

  // Check min deposit and get method details
  const { data: method } = await supabase
    .from('deposit_methods')
    .select('min_deposit, name, type')
    .eq('id', method_id)
    .single();

  if (method && amount < method.min_deposit) {
    res.status(400).json({ error: `Minimum deposit is ${method.min_deposit} ETB` });
    return;
  }

  const { data, error } = await supabase
    .from('deposits')
    .insert([{ telegram_id: telegramId, method_id, amount, screenshot_url, status: 'pending' }])
    .select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify workers
  try {
    const { data: workers } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('role', 'worker');

    if (workers && workers.length > 0) {
      const typeLabels: Record<string, string> = {
        cbe: '🏦 Commercial Bank of Ethiopia',
        boa: '🏛️ Bank of Abyssinia',
        telebirr: '📱 Telebirr',
        mpesa: '💚 M-Pesa',
      };
      
      const safeUsername = (req.telegramUser?.username || req.telegramUser?.first_name || 'User').replace(/[_*[\]]/g, '\\$&');
      const methodName = method ? (typeLabels[method.type] || method.name) : 'Unknown';
      const safeMethodName = methodName.replace(/[_*[\]]/g, '\\$&');

      const message = `🔔 *New Deposit Request!*\n\n` +
                      `👤 User: @${safeUsername}\n` +
                      `💰 Amount: *${Number(amount).toLocaleString('en-US')} ETB*\n` +
                      `🏦 Method: *${safeMethodName}*\n\n` +
                      `👇 Please check the Admin Dashboard to approve.`;

      const botToken = process.env.BOT_TOKEN;
      if (botToken) {
        for (const worker of workers) {
          if (!worker.telegram_id) continue;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: worker.telegram_id,
              text: message,
              parse_mode: 'Markdown'
            })
          }).catch(e => console.error('Failed to send to worker:', e));
        }
      }
    }
  } catch (notifyErr) {
    console.error('Notification error:', notifyErr);
  }

  res.json({ success: true, deposit: data });
});

// GET /api/deposit/history — user's deposit history
router.get('/history', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const { data, error } = await supabase
    .from('deposits')
    .select('*, deposit_methods(type, name)')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
