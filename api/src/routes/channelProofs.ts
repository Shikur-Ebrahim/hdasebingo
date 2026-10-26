import { Router, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { uploadToR2 } from '../services/r2';

const router = Router();

// Default Telegram Channel
export const DEFAULT_PROOF_CHANNEL = '@hdasebingo';

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
  if (!input || !input.trim() || input.includes('dmg_official_channel')) return DEFAULT_PROOF_CHANNEL;
  let ch = input.trim();
  ch = ch.replace(/^https?:\/\//i, '');
  ch = ch.replace(/^www\./i, '');
  ch = ch.replace(/^(t\.me|telegram\.me)\//i, '');
  ch = ch.replace(/\/.*$/, '');
  ch = ch.trim();
  if (!ch || ch.includes('dmg_official_channel')) return DEFAULT_PROOF_CHANNEL;
  if (ch.startsWith('-') || /^\d+$/.test(ch)) {
    return ch.startsWith('-') ? ch : `-${ch}`;
  }
  ch = ch.replace(/^@/, '');
  return `@${ch}`;
}

/**
 * Resolves target channel dynamically from Admin Settings (channel_link) or custom input.
 * Dynamically tracks the official channel link configured in Admin Settings.
 */
export async function resolveProofChannel(customChannel?: string | null): Promise<string> {
  if (customChannel && customChannel.trim() && !customChannel.includes('dmg_official_channel')) {
    return normalizeTelegramChannel(customChannel);
  }

  try {
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['channel_link', 'channel_post_target', 'channel_id', 'telegram_channel_id']);

    if (rows && rows.length > 0) {
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]));

      // 1. Primary: channel_link saved in Admin Settings (The central authoritative channel)
      if (map.channel_link?.trim() && !map.channel_link.includes('dmg_official_channel')) {
        return normalizeTelegramChannel(map.channel_link);
      }

      // 2. Secondary: channel_post_target if explicitly configured and not legacy
      if (map.channel_post_target?.trim() && !map.channel_post_target.includes('dmg_official_channel')) {
        return normalizeTelegramChannel(map.channel_post_target);
      }

      // 3. Fallbacks: telegram_channel_id or channel_id
      if (map.telegram_channel_id?.trim() && !map.telegram_channel_id.includes('dmg_official_channel')) {
        return normalizeTelegramChannel(map.telegram_channel_id);
      }
      if (map.channel_id?.trim() && !map.channel_id.includes('dmg_official_channel')) {
        return normalizeTelegramChannel(map.channel_id);
      }
    }
  } catch (err) {
    console.error('Failed to resolve proof channel from settings:', err);
  }

  const envChannel = process.env.TELEGRAM_CHANNEL_ID || process.env.CHANNEL_ID;
  if (envChannel && !envChannel.includes('dmg_official_channel')) {
    return normalizeTelegramChannel(envChannel);
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
        'last_channel_post_withdraw_image',
        'posted_deposit_ids',
        'posted_withdraw_ids'
      ]);

    const sMap = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]));
    const depositThreshold = parseInt(sMap.channel_post_deposit_threshold || '10', 10) || 10;
    const depositEnabled = sMap.channel_post_deposit_enabled !== 'false';
    const withdrawThreshold = parseInt(sMap.channel_post_withdraw_threshold || '10', 10) || 10;
    const withdrawEnabled = sMap.channel_post_withdraw_enabled !== 'false';

    // Clean up any legacy hardcoded target channel in database so dynamic channel takes over
    if (sMap.channel_post_target && sMap.channel_post_target.includes('dmg_official_channel')) {
      await supabase.from('settings').delete().eq('key', 'channel_post_target');
    }

    // Resolves dynamically from Admin Settings (channel_link)
    const targetChannel = await resolveProofChannel(
      sMap.channel_post_target && !sMap.channel_post_target.includes('dmg_official_channel')
        ? sMap.channel_post_target
        : null
    );
    const lastDepositPostAt = sMap.last_channel_post_deposit_at || null;
    const lastWithdrawPostAt = sMap.last_channel_post_withdraw_at || null;

    let postedDepositIds: string[] = [];
    try {
      postedDepositIds = JSON.parse(sMap.posted_deposit_ids || '[]');
      if (!Array.isArray(postedDepositIds)) postedDepositIds = [];
    } catch {
      postedDepositIds = [];
    }

    let postedWithdrawIds: string[] = [];
    try {
      postedWithdrawIds = JSON.parse(sMap.posted_withdraw_ids || '[]');
      if (!Array.isArray(postedWithdrawIds)) postedWithdrawIds = [];
    } catch {
      postedWithdrawIds = [];
    }

    // 2. Fetch approved deposits (up to 100 for batching and queue management)
    const { data: depositsRaw } = await supabase
      .from('deposits')
      .select('id, telegram_id, amount, status, created_at, updated_at, deposit_methods(id, name, type), users!deposits_telegram_id_fkey(first_name, username)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(100);

    // 3. Fetch approved withdrawals (up to 100 for batching and queue management)
    const { data: withdrawalsRaw } = await supabase
      .from('withdrawals')
      .select('id, telegram_id, method_id, amount, net_amount, fee_amount, account_name, account_number, status, created_at, updated_at, withdrawal_methods(id, type)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(100);

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

    // 4. Filter unposted (NOT yet posted) approved transactions
    const unpostedDeposits = (depositsRaw || []).filter(d => !postedDepositIds.includes(d.id));
    const unpostedWithdrawals = enrichedWithdrawals.filter(w => !postedWithdrawIds.includes(w.id));

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
      unpostedDepositsCount: unpostedDeposits.length,
      unpostedWithdrawalsCount: unpostedWithdrawals.length,
      unpostedDeposits,
      unpostedWithdrawals,
      recentDeposits: unpostedDeposits,
      recentWithdrawals: unpostedWithdrawals,
      postedDepositIdsCount: postedDepositIds.length,
      postedWithdrawIdsCount: postedWithdrawIds.length,
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
    const filename = `channel-proofs/${type}/${Date.now()}_flyer.png`;
    const publicUrl = await uploadToR2(filename, buffer, 'image/png');

    const nowIso = new Date().toISOString();
    const settingKey = type === 'deposit' ? 'last_channel_post_deposit_image' : 'last_channel_post_withdraw_image';
    const timeKey = type === 'deposit' ? 'last_channel_post_deposit_image_at' : 'last_channel_post_withdraw_image_at';

    await supabase.from('settings').upsert([
      { key: settingKey, value: publicUrl },
      { key: timeKey, value: nowIso }
    ], { onConflict: 'key' });

    res.json({ success: true, publicUrl });
  } catch (err: any) {
    console.error('sync-cache error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/channel-proofs/post (Manual or Triggered 1-click Post to Channel) ──
router.post('/post', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type, image_base64, custom_channel, caption, posted_ids } = req.body;

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

    // 3. Prepare clean Amharic Telegram Caption (no redundant channel link)
    let finalCaption = caption;
    if (!finalCaption) {
      if (type === 'deposit') {
        finalCaption =
          `🌟 <b>የተረጋገጡ ዲፖዚቶች • ህዳሴ ቢንጎ</b> 🌟\n\n` +
          `✅ <b>የተጫዋቾች ዲፖዚት በተሳካ ሁኔታ ገቢ ተደርጓል!</b>\n` +
          `⚡ ፈጣን እና አስተማማኝ የሂሳብ መሙያ።\n` +
          `🛡️ 100% የታመነ እና የተረጋገጠ አሰራር።\n\n` +
          `💰 በ <b>ቴሌብር፣ ንግድ ባንክ (CBE)፣ አቢሲኒያ ወይም አዋሽ</b> አስገብተው አሁኑኑ ይጫወቱ!\n\n` +
          `🎮 <b>አሁኑኑ ይጫወቱ:</b> @${botUsername}`;
      } else {
        finalCaption =
          `🏆 <b>የተረጋገጡ የሽልማት ክፍያዎች • ህዳሴ ቢንጎ</b> 🏆\n\n` +
          `💸 <b>የአሸናፊዎች የሽልማት ክፍያ በተሳካ ሁኔታ ተፈጽሟል!</b>\n` +
          `🎉 ለሁሉም አሸናፊዎቻችን እንኳን ደስ አላችሁ!\n` +
          `⚡ ፈጣን የባንክ እና የቴሌብር ክፍያ።\n\n` +
          `🎱 በየቀኑ በ 75-ኳስ ቢንጎ ይጫወቱ፣ ያሸንፉ፣ ወዲያውኑ ብርዎን ያውጡ!\n\n` +
          `🎮 <b>ይጫወቱ እና ያሸንፉ:</b> @${botUsername}`;
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
              { text: '🎮 አሁኑኑ ይጫወቱ • PLAY NOW', url: `https://t.me/${botUsername}` }
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

    // 5. Update settings with last post timestamp, cached image URL, AND mark IDs as posted
    const nowIso = new Date().toISOString();
    const postedKey = type === 'deposit' ? 'posted_deposit_ids' : 'posted_withdraw_ids';

    const { data: currentPostedRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', postedKey)
      .single();

    let existingPostedIds: string[] = [];
    try {
      existingPostedIds = JSON.parse(currentPostedRow?.value || '[]');
      if (!Array.isArray(existingPostedIds)) existingPostedIds = [];
    } catch {
      existingPostedIds = [];
    }

    let idsToRecord: string[] = [];
    if (Array.isArray(posted_ids) && posted_ids.length > 0) {
      idsToRecord = posted_ids.map(String);
    } else {
      const table = type === 'deposit' ? 'deposits' : 'withdrawals';
      const { data: unpostedRows } = await supabase
        .from(table)
        .select('id')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(20);

      idsToRecord = (unpostedRows || [])
        .map(r => r.id)
        .filter(id => !existingPostedIds.includes(id))
        .slice(0, 10);
    }

    const updatedPostedIds = Array.from(new Set([...existingPostedIds, ...idsToRecord]));

    const settingsToUpdate = type === 'deposit'
      ? [
          { key: 'last_channel_post_deposit_at', value: nowIso },
          { key: 'last_channel_post_deposit_image', value: publicImageUrl },
          { key: 'last_channel_post_deposit_image_at', value: nowIso },
          { key: 'posted_deposit_ids', value: JSON.stringify(updatedPostedIds) }
        ]
      : [
          { key: 'last_channel_post_withdraw_at', value: nowIso },
          { key: 'last_channel_post_withdraw_image', value: publicImageUrl },
          { key: 'last_channel_post_withdraw_image_at', value: nowIso },
          { key: 'posted_withdraw_ids', value: JSON.stringify(updatedPostedIds) }
        ];

    await supabase.from('settings').upsert(settingsToUpdate, { onConflict: 'key' });

    res.json({
      success: true,
      channelId,
      publicImageUrl,
      messageId: tgData.result?.message_id,
      postedAt: nowIso,
      postedCount: idsToRecord.length,
      totalPostedCount: updatedPostedIds.length,
    });
  } catch (err: any) {
    console.error('Error posting proof to channel:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/channel-proofs/reset-history (Reset posted history to show all approved again) ──
router.post('/reset-history', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type } = req.body; // 'deposit' | 'withdrawal' | 'all'
    const updates: { key: string; value: string }[] = [];
    if (!type || type === 'deposit' || type === 'all') {
      updates.push({ key: 'posted_deposit_ids', value: '[]' });
    }
    if (!type || type === 'withdrawal' || type === 'all') {
      updates.push({ key: 'posted_withdraw_ids', value: '[]' });
    }
    await supabase.from('settings').upsert(updates, { onConflict: 'key' });
    res.json({ success: true, message: 'Proof post history reset successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset history' });
  }
});

// ── POST /api/channel-proofs/mark-item (Manually toggle item posted / unposted) ──
router.post('/mark-item', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type, id, action } = req.body;
    if (!type || !id || !action) {
      res.status(400).json({ error: 'type, id, and action are required' });
      return;
    }
    const key = type === 'deposit' ? 'posted_deposit_ids' : 'posted_withdraw_ids';
    const { data: row } = await supabase.from('settings').select('value').eq('key', key).single();
    let list: string[] = [];
    try { list = JSON.parse(row?.value || '[]'); } catch { list = []; }

    if (action === 'post') {
      if (!list.includes(id)) list.push(id);
    } else {
      list = list.filter(item => item !== id);
    }

    await supabase.from('settings').upsert([{ key, value: JSON.stringify(list) }], { onConflict: 'key' });
    res.json({ success: true, list });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update item state' });
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
    ];

    if (targetChannel && targetChannel.trim() && !targetChannel.includes('dmg_official_channel')) {
      const normalized = normalizeTelegramChannel(targetChannel);
      updates.push({ key: 'channel_post_target', value: normalized });
    }

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
    const postedKey = isDeposit ? 'posted_deposit_ids' : 'posted_withdraw_ids';

    let postedIds: string[] = [];
    try {
      postedIds = JSON.parse(sMap[postedKey] || '[]');
      if (!Array.isArray(postedIds)) postedIds = [];
    } catch {
      postedIds = [];
    }

    // Fetch approved records to count unposted items
    const { data: allApproved } = await supabase
      .from(table)
      .select('id')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(100);

    const unposted = (allApproved || []).filter(r => !postedIds.includes(r.id));
    const unpostedCount = unposted.length;

    if (unpostedCount < threshold) {
      // Threshold not yet reached
      return;
    }

    const channelId = await resolveProofChannel();
    const cachedImage = isDeposit ? sMap.last_channel_post_deposit_image : sMap.last_channel_post_withdraw_image;

    // CRITICAL: ONLY post if the exact canvas image is cached on R2 and is fresh!
    // NEVER send a plain text message, and NEVER send an outdated flyer from a past batch!
    const imageUpdatedAt = sMap[`last_channel_post_${type}_image_at`];
    if (!cachedImage || !imageUpdatedAt) {
      console.log(`Auto-post for ${type} reached milestone (${unpostedCount}/${threshold}), but awaiting fresh canvas flyer render from admin. Plain text fallback skipped.`);
      return;
    }

    if (lastPostAt && new Date(imageUpdatedAt) <= new Date(lastPostAt)) {
      console.log(`Auto-post for ${type}: cached flyer is from previous batch. Waiting for admin to render fresh flyer.`);
      return;
    }

    let caption = '';
    if (isDeposit) {
      caption =
        `🌟 <b>የተረጋገጡ ዲፖዚቶች • ህዳሴ ቢንጎ</b> 🌟\n\n` +
        `✅ <b>የ${threshold} ተጫዋቾች ዲፖዚት በተሳካ ሁኔታ ገቢ ተደርጓል!</b>\n` +
        `⚡ ፈጣን እና አስተማማኝ የሂሳብ መሙያ።\n` +
        `🛡️ 100% የታመነ እና የተረጋገጠ አሰራር።\n\n` +
        `🎮 <b>አሁኑኑ ይጫወቱ:</b> @${botUsername}`;
    } else {
      caption =
        `🏆 <b>የተረጋገጡ የሽልማት ክፍያዎች • ህዳሴ ቢንጎ</b> 🏆\n\n` +
        `💸 <b>የ${threshold} አሸናፊዎች የሽልማት ክፍያ በተሳካ ሁኔታ ተፈጽሟል!</b>\n` +
        `⚡ ፈጣን የባንክ እና የቴሌብር ክፍያ።\n` +
        `🎱 በየቀኑ በ 75-ኳስ ቢንጎ ይጫወቱ፣ ያሸንፉ፣ ወዲያውኑ ብርዎን ያውጡ!\n\n` +
        `🎮 <b>ይጫወቱ እና ያሸንፉ:</b> @${botUsername}`;
    }

    // ONLY PLAY BINGO NOW BUTTON
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '🎮 አሁኑኑ ይጫወቱ • PLAY NOW', url: `https://t.me/${botUsername}` }
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

    // Update last post timestamp and record posted IDs
    const postedBatchIds = unposted.slice(0, threshold).map(r => r.id);
    const updatedPosted = Array.from(new Set([...postedIds, ...postedBatchIds]));
    const nowIso = new Date().toISOString();

    await supabase.from('settings').upsert([
      { key: isDeposit ? 'last_channel_post_deposit_at' : 'last_channel_post_withdraw_at', value: nowIso },
      { key: postedKey, value: JSON.stringify(updatedPosted) }
    ], { onConflict: 'key' });

    console.log(`Auto-posted ${type} exact canvas proof to ${channelId} (${threshold} items milestone).`);
  } catch (autoErr) {
    console.error('Error during checkAndAutoPostProofs:', autoErr);
  }
}

export default router;
