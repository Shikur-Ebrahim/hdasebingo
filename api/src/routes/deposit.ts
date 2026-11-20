import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { trackBotNotification, StoredBotMessage } from '../services/botNotifications';

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
  const { method_id, amount, screenshot_url, transaction_ref, ft_number } = req.body;

  if (!method_id || !amount) {
    res.status(400).json({ error: 'method_id and amount are required' });
    return;
  }

  const cleanTxRef = (transaction_ref || ft_number || '').trim();
  const cleanScreenshotUrl = (screenshot_url || '').trim();

  // User must provide either a screenshot OR an FT / Transaction reference
  if (!cleanScreenshotUrl && !cleanTxRef) {
    res.status(400).json({ error: 'Please provide a payment screenshot or transaction FT number/SMS' });
    return;
  }

  // Check if user already has a pending deposit
  const { data: existingPending } = await supabase
    .from('deposits')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('status', 'pending')
    .maybeSingle();

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

  // Prepare payload
  const insertPayload: any = {
    telegram_id: telegramId,
    method_id,
    amount,
    screenshot_url: cleanScreenshotUrl || (cleanTxRef ? `ft:${cleanTxRef}` : null),
    status: 'pending',
  };
  if (cleanTxRef) {
    insertPayload.transaction_ref = cleanTxRef;
  }

  let { data, error } = await supabase
    .from('deposits')
    .insert([insertPayload])
    .select()
    .single();

  // Graceful fallback if transaction_ref column does not exist in DB yet
  if (error && error.message && error.message.includes('transaction_ref')) {
    delete insertPayload.transaction_ref;
    const retry = await supabase
      .from('deposits')
      .insert([insertPayload])
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify workers only (not admin)
  try {
    const { data: workers } = await supabase
      .from('users')
      .select('telegram_id, permissions')
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
                      `👤 User: @${safeUsername} (ID: \`${telegramId}\`)\n` +
                      `💰 Amount: *${Number(amount).toLocaleString('en-US')} ETB*\n` +
                      `🏦 Method: *${safeMethodName}*\n` +
                      (cleanTxRef ? `🧾 *FT / Ref:* \`${cleanTxRef}\`\n` : '') +
                      `\n👇 Choose an action below:`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '✅ Approve Deposit', callback_data: `dep_app_${data.id}` },
            { text: '❌ Reject Deposit', callback_data: `dep_rej_${data.id}` }
          ]
        ]
      };

      const botToken = process.env.BOT_TOKEN;
      if (botToken) {
        const hasPhotoUrl = cleanScreenshotUrl && cleanScreenshotUrl.startsWith('http');
        const sentMessages: StoredBotMessage[] = [];

        for (const worker of workers) {
          if (!worker.telegram_id) continue;
          if (worker.permissions && worker.permissions.deposits === false) continue;
          let sentOk = false;
          if (hasPhotoUrl) {
            try {
              const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: worker.telegram_id,
                  photo: cleanScreenshotUrl,
                  caption: message,
                  parse_mode: 'Markdown',
                  reply_markup: replyMarkup
                })
              });
              if (photoRes.ok) {
                const pData: any = await photoRes.json();
                if (pData.ok && pData.result?.message_id) {
                  sentMessages.push({ chat_id: worker.telegram_id, message_id: pData.result.message_id });
                }
                sentOk = true;
              }
            } catch (err) {
              console.warn('sendPhoto to worker failed:', err);
            }
          }

          if (!sentOk) {
            const fallbackText = hasPhotoUrl
              ? `${message}\n📸 [View Screenshot](${cleanScreenshotUrl})`
              : message;

            try {
              const msgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: worker.telegram_id,
                  text: fallbackText,
                  parse_mode: 'Markdown',
                  reply_markup: replyMarkup
                })
              });
              if (msgRes.ok) {
                const mData: any = await msgRes.json();
                if (mData.ok && mData.result?.message_id) {
                  sentMessages.push({ chat_id: worker.telegram_id, message_id: mData.result.message_id });
                }
              }
            } catch (e) {
              console.error('Failed to send to worker:', e);
            }
          }
        }

        if (sentMessages.length > 0) {
          await trackBotNotification('deposit', data.id, sentMessages);
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
