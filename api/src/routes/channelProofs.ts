import { Router, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { uploadToR2 } from '../services/r2';

const router = Router();

// Default Telegram Channel
export const DEFAULT_PROOF_CHANNEL = '@dmg_official_channel';

// ── Middleware: Admin or Worker with permissions ──────────────────────────────
const requireAdminOrWorker = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const telegramId = req.telegramUser!.id.toString();
  const { data } = await supabase.from('users').select('role, permissions').eq('telegram_id', telegramId).single();
  if (!data || (data.role !== 'admin' && data.role !== 'worker')) {
    res.status(403).json({ error: 'Admin or authorized worker only' });
    return;
  }
  next();
};

/**
 * Normalizes any channel link or username into a valid Telegram chat_id
 */
export function normalizeTelegramChannel(input?: string | null): string {
  if (!input || !input.trim()) return DEFAULT_PROOF_CHANNEL;
  let ch = input.trim();
  ch = ch.replace(/^https?:\/\//i, '');
  ch = ch.replace(/^www\./i, '');
  ch = ch.replace(/^(t\.me|telegram\.me)\//i, '');
  ch = ch.replace(/\/.*$/, '');
  ch = ch.trim();
  if (!ch) return DEFAULT_PROOF_CHANNEL;
  if (ch.startsWith('-') || /^\d+$/.test(ch)) {
    return ch.startsWith('-') ? ch : `-${ch}`;
  }
  ch = ch.replace(/^@/, '');
  return `@${ch}`;
}

/**
 * Resolves target channel from settings or custom input
 */
export async function resolveProofChannel(customChannel?: string | null): Promise<string> {
  if (customChannel && customChannel.trim()) {
    return normalizeTelegramChannel(customChannel);
  }

  try {
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['channel_post_target', 'channel_link', 'channel_id', 'telegram_channel_id']);

    if (rows && rows.length > 0) {
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
      if (map.channel_post_target?.trim()) {
        return normalizeTelegramChannel(map.channel_post_target);
      }
      if (map.channel_link?.trim()) {
        return normalizeTelegramChannel(map.channel_link);
      }
      if (map.telegram_channel_id?.trim()) {
        return normalizeTelegramChannel(map.telegram_channel_id);
      }
      if (map.channel_id?.trim()) {
        return normalizeTelegramChannel(map.channel_id);
      }
    }
  } catch (err) {
    console.error('Failed to resolve proof channel from settings:', err);
  }

  return DEFAULT_PROOF_CHANNEL;
}

// ── GET /api/channel-proofs/data ──────────────────────────────────────────────
router.get('/data', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    // 1. Fetch settings
    const { data: settingsRows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'channel_post_deposit_threshold',
        'channel_post_deposit_enabled',
        'channel_post_withdraw_threshold',
        'channel_post_withdraw_enabled',
        'channel_post_target',
        'channel_link',
        'last_channel_post_deposit_at',
        'last_channel_post_withdraw_at',
        'last_channel_post_deposit_image',
        'last_channel_post_withdraw_image'
      ]);

    const sMap = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]));
    const depositThreshold = parseInt(sMap.channel_post_deposit_threshold || '10', 10) || 10;
    const depositEnabled = sMap.channel_post_deposit_enabled !== 'false';
    const withdrawThreshold = parseInt(sMap.channel_post_withdraw_threshold || '10', 10) || 10;
    const withdrawEnabled = sMap.channel_post_withdraw_enabled !== 'false';
    const targetChannel = normalizeTelegramChannel(sMap.channel_post_target || sMap.channel_link || DEFAULT_PROOF_CHANNEL);
    const lastDepositPostAt = sMap.last_channel_post_deposit_at || null;
    const lastWithdrawPostAt = sMap.last_channel_post_withdraw_at || null;

    // 2. Fetch recent approved deposits (limit 20 for preview / selection)
    const { data: depositsRaw } = await supabase
      .from('deposits')
      .select('id, telegram_id, amount, status, created_at, updated_at, deposit_methods(id, name, type), users!deposits_telegram_id_fkey(first_name, username)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(20);

    // 3. Fetch recent approved withdrawals (limit 20 for preview / selection)
    const { data: withdrawalsRaw } = await supabase
      .from('withdrawals')
      .select('id, telegram_id, method_id, amount, net_amount, fee_amount, account_name, account_number, status, created_at, updated_at, withdrawal_methods(id, type)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(20);

    // Enrich withdrawals with user names
    let enrichedWithdrawals: any[] = withdrawalsRaw || [];
    if (enrichedWithdrawals.length > 0) {
      const tgIds = [...new Set(enrichedWithdrawals.map(w => w.telegram_id))];
      const { data: usersData } = await supabase
        .from('users')
        .select('telegram_id, first_name, username')
        .in('telegram_id', tgIds);

      const userMap = usersData ? Object.fromEntries(usersData.map(u => [u.telegram_id, u])) : {};
      enrichedWithdrawals = enrichedWithdrawals.map(w => ({
        ...w,
        users: userMap[w.telegram_id] || null
      }));
    }

    // 4. Count unposted deposits since lastDepositPostAt
    let unpostedDepositQuery = supabase
      .from('deposits')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');

    if (lastDepositPostAt) {
      unpostedDepositQuery = unpostedDepositQuery.gt('updated_at', lastDepositPostAt);
    }
    const { count: unpostedDepositsCount } = await unpostedDepositQuery;

    // 5. Count unposted withdrawals since lastWithdrawPostAt
    let unpostedWithdrawQuery = supabase
      .from('withdrawals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');

    if (lastWithdrawPostAt) {
      unpostedWithdrawQuery = unpostedWithdrawQuery.gt('updated_at', lastWithdrawPostAt);
    }
    const { count: unpostedWithdrawalsCount } = await unpostedWithdrawQuery;

    res.json({
      settings: {
        depositThreshold,
        depositEnabled,
        withdrawThreshold,
        withdrawEnabled,
        targetChannel,
        lastDepositPostAt,
        lastWithdrawPostAt,
        lastDepositImage: sMap.last_channel_post_deposit_image || null,
        lastWithdrawImage: sMap.last_channel_post_withdraw_image || null,
      },
      unpostedDepositsCount: unpostedDepositsCount ?? 0,
      unpostedWithdrawalsCount: unpostedWithdrawalsCount ?? 0,
      recentDeposits: depositsRaw || [],
      recentWithdrawals: enrichedWithdrawals || [],
    });
  } catch (err: any) {
    console.error('Error fetching channel proofs data:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/channel-proofs/sync-cache (Sync generated canvas image to R2 for auto-post) ──
router.post('/sync-cache', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type, image_base64 } = req.body;
    if (!type || !image_base64) {
      res.status(400).json({ error: 'type and image_base64 are required' });
      return;
    }

    const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `channel-proofs/${type}/cached_flyer.png`;
    const publicUrl = await uploadToR2(filename, buffer, 'image/png');

    const settingKey = type === 'deposit' ? 'last_channel_post_deposit_image' : 'last_channel_post_withdraw_image';
    await supabase.from('settings').upsert([{ key: settingKey, value: publicUrl }], { onConflict: 'key' });

    res.json({ success: true, publicUrl });
  } catch (err: any) {
    console.error('sync-cache error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/channel-proofs/post (Manual or Triggered 1-click Post to Channel) ──
router.post('/post', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type, image_base64, custom_channel, caption } = req.body;

    if (!type || (type !== 'deposit' && type !== 'withdrawal')) {
      res.status(400).json({ error: 'type must be deposit or withdrawal' });
      return;
    }

    if (!image_base64) {
      res.status(400).json({ error: 'image_base64 is required' });
      return;
    }

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'BOT_TOKEN is not configured on server' });
      return;
    }

    const botUsername = process.env.BOT_USERNAME || 'hdasebingo_bot';

    // 1. Upload high-res canvas image to R2
    const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `channel-proofs/${type}/${Date.now()}_proof.png`;
    
    let publicImageUrl = '';
    try {
      publicImageUrl = await uploadToR2(filename, buffer, 'image/png');
    } catch (uploadErr) {
      console.error('Error uploading proof image to R2:', uploadErr);
      res.status(500).json({ error: 'Failed to upload proof image to storage' });
      return;
    }

    // 2. Resolve destination channel
    const channelId = await resolveProofChannel(custom_channel);

    // 3. Prepare clean Telegram Caption (no redundant channel link)
    let finalCaption = caption;
    if (!finalCaption) {
      if (type === 'deposit') {
        finalCaption =
          `🌟 <b>OFFICIAL APPROVED DEPOSITS • HDASE BINGO</b> 🌟\n\n` +
          `✅ <b>10 Recent Deposits Successfully Credited!</b>\n` +
          `⚡ Fast, safe & automated wallet top-ups.\n` +
          `🛡️ 100% Verified player reloads.\n\n` +
          `💰 Deposit via <b>Telebirr, CBE, BOA or Awash</b> and join live 75-Ball Bingo rooms!\n\n` +
          `🎮 <b>Play Now:</b> @${botUsername}`;
      } else {
        finalCaption =
          `🏆 <b>OFFICIAL CASHOUT PROOFS • HDASE BINGO</b> 🏆\n\n` +
          `💸 <b>10 Winner Cashouts Approved & Paid Out!</b>\n` +
          `🎉 Congratulations to all our lucky winners!\n` +
          `⚡ Instant bank & Telebirr payouts guaranteed.\n\n` +
          `🎱 Win real ETB cash daily in high-stake & friendly rooms!\n\n` +
          `🎮 <b>Play & Cashout:</b> @${botUsername}`;
      }
    }

    // 4. Send EXACT canvas photo to channel via Telegram Bot API with ONLY Play button
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        photo: publicImageUrl,
        caption: finalCaption,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🎮 PLAY BINGO NOW', url: `https://t.me/${botUsername}` }
            ]
          ]
        }
      }),
    });

    const tgData = (await tgRes.json()) as any;
    if (!tgRes.ok || !tgData.ok) {
      console.error('Telegram sendPhoto error:', tgData);
      res.status(502).json({
        error: `Telegram error: ${tgData.description || 'Failed to post to channel'}`,
        channelId,
        tgData
      });
      return;
    }

    // 5. Update settings with last post timestamp and cached image URL
    const nowIso = new Date().toISOString();
    const settingsToUpdate = type === 'deposit'
      ? [
          { key: 'last_channel_post_deposit_at', value: nowIso },
          { key: 'last_channel_post_deposit_image', value: publicImageUrl }
        ]
      : [
          { key: 'last_channel_post_withdraw_at', value: nowIso },
          { key: 'last_channel_post_withdraw_image', value: publicImageUrl }
        ];

    await supabase.from('settings').upsert(settingsToUpdate, { onConflict: 'key' });

    res.json({
      success: true,
      channelId,
      publicImageUrl,
      messageId: tgData.result?.message_id,
      postedAt: nowIso,
    });
  } catch (err: any) {
    console.error('Error posting proof to channel:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/channel-proofs/send-to-me (Deliver directly to Admin's chat) ─────
router.post('/send-to-me', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const { image_base64, type } = req.body;

    if (!image_base64) {
      res.status(400).json({ error: 'image_base64 is required' });
      return;
    }

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'BOT_TOKEN is not configured' });
      return;
    }

    const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const key = `proof-previews/${telegramId}/${Date.now()}_${type || 'proof'}.png`;

    let publicUrl = '';
    try {
      publicUrl = await uploadToR2(key, buffer, 'image/png');
    } catch (upErr) {
      console.error('R2 upload error for preview:', upErr);
      res.status(500).json({ error: 'Failed to upload preview image' });
      return;
    }

    const label = type === 'deposit' ? 'Approved Deposits Proof' : 'Approved Withdrawals Proof';
    const caption =
      `🖼️ <b>Official ${label} • HDASE BINGO</b>\n\n` +
      `📥 <b>To save to your Phone Gallery:</b>\n` +
      `1️⃣ Tap this image to open full screen.\n` +
      `2️⃣ Tap the <b>⋮</b> (three dots) in top-right.\n` +
      `3️⃣ Tap <b>"Save to Gallery"</b>!\n\n` +
      `✨ <i>High-resolution flyer ready for official channel & social posting.</i>`;

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        photo: publicUrl,
        caption,
        parse_mode: 'HTML',
      }),
    });

    const tgData = (await tgRes.json()) as any;
    res.json({
      success: tgRes.ok && tgData.ok,
      publicUrl,
      tgData,
    });
  } catch (err: any) {
    console.error('send-to-me error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── PUT /api/channel-proofs/settings (Update Auto-post configurations) ──────────
router.put('/settings', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const {
      depositThreshold,
      depositEnabled,
      withdrawThreshold,
      withdrawEnabled,
      targetChannel
    } = req.body;

    const updates = [
      { key: 'channel_post_deposit_threshold', value: String(Math.max(1, parseInt(depositThreshold || '10', 10))) },
      { key: 'channel_post_deposit_enabled', value: depositEnabled ? 'true' : 'false' },
      { key: 'channel_post_withdraw_threshold', value: String(Math.max(1, parseInt(withdrawThreshold || '10', 10))) },
      { key: 'channel_post_withdraw_enabled', value: withdrawEnabled ? 'true' : 'false' },
      { key: 'channel_post_target', value: normalizeTelegramChannel(targetChannel || DEFAULT_PROOF_CHANNEL) },
    ];

    const { error } = await supabase.from('settings').upsert(updates, { onConflict: 'key' });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err: any) {
    console.error('Error saving channel proofs settings:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Helper: check and auto post in background when threshold reached ─────────
export async function checkAndAutoPostProofs(type: 'deposit' | 'withdrawal'): Promise<void> {
  try {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return;

    const botUsername = process.env.BOT_USERNAME || 'hdasebingo_bot';

    // Fetch settings
    const { data: sRows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'channel_post_deposit_threshold',
        'channel_post_deposit_enabled',
        'channel_post_withdraw_threshold',
        'channel_post_withdraw_enabled',
        'channel_post_target',
        'channel_link',
        'last_channel_post_deposit_at',
        'last_channel_post_withdraw_at',
        'last_channel_post_deposit_image',
        'last_channel_post_withdraw_image'
      ]);

    const sMap = Object.fromEntries((sRows || []).map(r => [r.key, r.value]));

    const isDeposit = type === 'deposit';
    const enabled = isDeposit
      ? sMap.channel_post_deposit_enabled !== 'false'
      : sMap.channel_post_withdraw_enabled !== 'false';

    if (!enabled) return;

    const threshold = parseInt(
      (isDeposit ? sMap.channel_post_deposit_threshold : sMap.channel_post_withdraw_threshold) || '10',
      10
    ) || 10;

    const lastPostAt = isDeposit ? sMap.last_channel_post_deposit_at : sMap.last_channel_post_withdraw_at;
    const table = isDeposit ? 'deposits' : 'withdrawals';

    // Count unposted approved records
    let q = supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');

    if (lastPostAt) {
      q = q.gt('updated_at', lastPostAt);
    }

    const { count } = await q;
    const unposted = count ?? 0;

    if (unposted < threshold) {
      // Threshold not yet reached
      return;
    }

    const channelId = normalizeTelegramChannel(sMap.channel_post_target || sMap.channel_link || DEFAULT_PROOF_CHANNEL);
    const cachedImage = isDeposit ? sMap.last_channel_post_deposit_image : sMap.last_channel_post_withdraw_image;

    // CRITICAL: ONLY post if the exact canvas image is cached on R2!
    // NEVER send a plain text message to the channel!
    if (!cachedImage) {
      console.log(`Auto-post for ${type} reached milestone (${unposted}/${threshold}), but awaiting canvas flyer sync. Plain text fallback skipped.`);
      return;
    }

    let caption = '';
    if (isDeposit) {
      caption =
        `🌟 <b>OFFICIAL APPROVED DEPOSITS • HDASE BINGO</b> 🌟\n\n` +
        `✅ <b>Batch Milestone: ${threshold} Deposits Credited!</b>\n` +
        `⚡ Automated & Instant Wallet Top-ups.\n` +
        `🛡️ 100% Verified Player Network.\n\n` +
        `🎮 <b>Play Now:</b> @${botUsername}`;
    } else {
      caption =
        `🏆 <b>OFFICIAL CASHOUT PROOFS • HDASE BINGO</b> 🏆\n\n` +
        `💸 <b>Batch Milestone: ${threshold} Cashouts Paid Out!</b>\n` +
        `⚡ Guaranteed Fast Bank & Telebirr Payouts.\n` +
        `🎱 Win Real ETB Daily in 75-Ball Bingo!\n\n` +
        `🎮 <b>Play & Cashout:</b> @${botUsername}`;
    }

    // ONLY PLAY BINGO NOW BUTTON
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '🎮 PLAY BINGO NOW', url: `https://t.me/${botUsername}` }
        ]
      ]
    };

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        photo: cachedImage,
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      })
    });

    const tgData = (await tgRes.json()) as any;
    if (!tgRes.ok || !tgData.ok) {
      console.error('Failed to auto-post proof photo to channel:', tgData);
      return;
    }

    // Update last post timestamp
    const nowIso = new Date().toISOString();
    await supabase.from('settings').upsert([
      { key: isDeposit ? 'last_channel_post_deposit_at' : 'last_channel_post_withdraw_at', value: nowIso }
    ], { onConflict: 'key' });

    console.log(`Auto-posted ${type} exact canvas proof to ${channelId} (${threshold} items milestone).`);
  } catch (autoErr) {
    console.error('Error during checkAndAutoPostProofs:', autoErr);
  }
}

export default router;
