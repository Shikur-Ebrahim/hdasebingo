import { Router, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { uploadToR2 } from '../services/r2';
import { generateFlyerPng, DepositRow, WithdrawalRow } from '../services/flyerGenerator';

const router = Router();

// Default Telegram Channel
export const DEFAULT_PROOF_CHANNEL = '@dmg_official_channel';

// ── Middleware: Admin or Worker ───────────────────────────────────────────────
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
      if (map.channel_post_target?.trim()) return normalizeTelegramChannel(map.channel_post_target);
      if (map.channel_link?.trim()) return normalizeTelegramChannel(map.channel_link);
      if (map.telegram_channel_id?.trim()) return normalizeTelegramChannel(map.telegram_channel_id);
      if (map.channel_id?.trim()) return normalizeTelegramChannel(map.channel_id);
    }
  } catch (err) {
    console.error('Failed to resolve proof channel from settings:', err);
  }
  return DEFAULT_PROOF_CHANNEL;
}

// ── Helper: Enrich withdrawals with user names ────────────────────────────────
async function enrichWithdrawals(withdrawalsRaw: any[]): Promise<any[]> {
  if (!withdrawalsRaw || withdrawalsRaw.length === 0) return [];
  const tgIds = [...new Set(withdrawalsRaw.map((w: any) => w.telegram_id))];
  const { data: usersData } = await supabase
    .from('users')
    .select('telegram_id, first_name, username')
    .in('telegram_id', tgIds);
  const userMap = usersData ? Object.fromEntries(usersData.map((u: any) => [u.telegram_id, u])) : {};
  return withdrawalsRaw.map((w: any) => ({ ...w, users: userMap[w.telegram_id] || null }));
}

// ── Helper: Send photo buffer to Telegram via multipart/form-data ─────────────
async function sendPhotoToTelegram(
  botToken: string,
  chatId: string,
  pngBuffer: Buffer,
  caption: string,
  replyMarkup: object
): Promise<{ ok: boolean; result?: any; description?: string }> {
  // Build multipart body manually (Node 18+ has FormData built-in but not in older versions)
  // Use a simple boundary-based multipart approach for compatibility
  const boundary = `----FormBoundary${Date.now()}`;
  const crlf = '\r\n';

  const parts: Buffer[] = [];

  const addField = (name: string, value: string) => {
    parts.push(Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${name}"${crlf}${crlf}` +
      `${value}${crlf}`
    ));
  };

  addField('chat_id', chatId);
  addField('caption', caption);
  addField('parse_mode', 'HTML');
  addField('reply_markup', JSON.stringify(replyMarkup));

  // Photo file part
  parts.push(Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="photo"; filename="proof.png"${crlf}` +
    `Content-Type: image/png${crlf}${crlf}`
  ));
  parts.push(pngBuffer);
  parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`));

  const body = Buffer.concat(parts);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });

  return res.json() as Promise<any>;
}

// ── Helper: Build Amharic caption ─────────────────────────────────────────────
function buildCaption(type: 'deposit' | 'withdrawal', threshold: number, botUsername: string): string {
  if (type === 'deposit') {
    return (
      `🌟 <b>የተረጋገጡ ዲፖዚቶች • ህዳሴ ቢንጎ</b> 🌟\n\n` +
      `✅ <b>የ${threshold} ተጫዋቾች ዲፖዚት በተሳካ ሁኔታ ገቢ ተደርጓል!</b>\n` +
      `⚡ ፈጣን እና አስተማማኝ የሂሳብ መሙያ።\n` +
      `🛡️ 100% የታመነ እና የተረጋገጠ አሰራር።\n\n` +
      `🎮 <b>አሁኑኑ ይጫወቱ:</b> @${botUsername}`
    );
  }
  return (
    `🏆 <b>የተረጋገጡ የሽልማት ክፍያዎች • ህዳሴ ቢንጎ</b> 🏆\n\n` +
    `💸 <b>የ${threshold} አሸናፊዎች የሽልማት ክፍያ በተሳካ ሁኔታ ተፈጽሟል!</b>\n` +
    `⚡ ፈጣን የባንክ እና የቴሌብር ክፍያ።\n` +
    `🎱 በየቀኑ በ 75-ኳስ ቢንጎ ይጫወቱ፣ ያሸንፉ፣ ወዲያውኑ ብርዎን ያውጡ!\n\n` +
    `🎮 <b>ይጫወቱ እና ያሸንፉ:</b> @${botUsername}`
  );
}

// ── Core: Generate flyer PNG from DB rows and post to Telegram channel ─────────
/**
 * Generates the canvas flyer server-side and posts it to Telegram.
 * Used by both auto-post and the manual "Post to Channel" button.
 *
 * @param type        'deposit' | 'withdrawal'
 * @param items       The DB rows for the NEW batch (since lastPostAt)
 * @param channelId   Resolved Telegram channel ID (@username or -chat_id)
 * @param botToken    Bot token
 * @param botUsername Bot username (for CTA text)
 * @param threshold   Threshold count (for caption text)
 * @returns           The public R2 URL of the uploaded flyer, or throws
 */
async function generateAndPostFlyer(
  type: 'deposit' | 'withdrawal',
  items: (DepositRow | WithdrawalRow)[],
  channelId: string,
  botToken: string,
  botUsername: string,
  threshold: number
): Promise<{ publicImageUrl: string; messageId?: number }> {
  // 1. Generate PNG server-side (exact same design as admin canvas)
  const pngBuffer = await generateFlyerPng(type, items, botUsername);

  // 2. Upload to R2
  const filename = `channel-proofs/${type}/${Date.now()}_proof.png`;
  const publicImageUrl = await uploadToR2(filename, pngBuffer, 'image/png');

  // 3. Build caption & button
  const caption = buildCaption(type, threshold, botUsername);
  const replyMarkup = {
    inline_keyboard: [[
      { text: '🎮 አሁኑኑ ይጫወቱ • PLAY NOW', url: `https://t.me/${botUsername}` }
    ]]
  };

  // 4. Post to Telegram channel using multipart (direct buffer upload)
  const tgData = await sendPhotoToTelegram(botToken, channelId, pngBuffer, caption, replyMarkup);

  if (!tgData.ok) {
    console.error('Telegram sendPhoto error:', tgData);
    throw new Error(`Telegram error: ${tgData.description || 'Failed to post to channel'}`);
  }

  return { publicImageUrl, messageId: tgData.result?.message_id };
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

    // 2. Fetch recent approved deposits (limit 20 for preview)
    const { data: depositsRaw } = await supabase
      .from('deposits')
      .select('id, telegram_id, amount, status, created_at, updated_at, deposit_methods(id, name, type), users!deposits_telegram_id_fkey(first_name, username)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(20);

    // 3. Fetch recent approved withdrawals (limit 20 for preview)
    const { data: withdrawalsRaw } = await supabase
      .from('withdrawals')
      .select('id, telegram_id, method_id, amount, net_amount, fee_amount, account_name, account_number, status, created_at, updated_at, withdrawal_methods(id, type)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(20);

    const enrichedWithdrawals = await enrichWithdrawals(withdrawalsRaw || []);

    // 4. Count unposted deposits since lastDepositPostAt
    let unpostedDepositQuery = supabase
      .from('deposits')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');
    if (lastDepositPostAt) unpostedDepositQuery = unpostedDepositQuery.gt('updated_at', lastDepositPostAt);
    const { count: unpostedDepositsCount } = await unpostedDepositQuery;

    // 5. Count unposted withdrawals since lastWithdrawPostAt
    let unpostedWithdrawQuery = supabase
      .from('withdrawals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');
    if (lastWithdrawPostAt) unpostedWithdrawQuery = unpostedWithdrawQuery.gt('updated_at', lastWithdrawPostAt);
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

// ── POST /api/channel-proofs/sync-cache ──────────────────────────────────────
// Still accepts browser canvas base64 for preview sync — kept for compatibility
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

// ── POST /api/channel-proofs/post (Manual "Post to Channel" button) ───────────
// Generates flyer SERVER-SIDE from the latest NEW batch — no browser canvas needed
router.post('/post', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type, custom_channel } = req.body;

    if (!type || (type !== 'deposit' && type !== 'withdrawal')) {
      res.status(400).json({ error: 'type must be deposit or withdrawal' });
      return;
    }

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'BOT_TOKEN is not configured on server' });
      return;
    }

    const botUsername = process.env.BOT_USERNAME || 'hdasebingo_bot';
    const channelId = await resolveProofChannel(custom_channel);
    const isDeposit = type === 'deposit';

    // Fetch settings to determine threshold and lastPostAt
    const { data: sRows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'channel_post_deposit_threshold',
        'channel_post_withdraw_threshold',
        'last_channel_post_deposit_at',
        'last_channel_post_withdraw_at',
      ]);
    const sMap = Object.fromEntries((sRows || []).map(r => [r.key, r.value]));
    const threshold = parseInt(
      (isDeposit ? sMap.channel_post_deposit_threshold : sMap.channel_post_withdraw_threshold) || '10',
      10
    ) || 10;
    const lastPostAt = isDeposit ? sMap.last_channel_post_deposit_at : sMap.last_channel_post_withdraw_at;

    // Fetch the NEW batch items (approved since lastPostAt) — up to 10 for the flyer
    let items: any[] = [];
    if (isDeposit) {
      let q = supabase
        .from('deposits')
        .select('id, telegram_id, amount, status, updated_at, deposit_methods(id, name, type), users!deposits_telegram_id_fkey(first_name, username)')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(10);
      if (lastPostAt) q = q.gt('updated_at', lastPostAt);
      const { data } = await q;
      items = data || [];
      // If the new batch has fewer than 10 items, pad with most recent older ones
      if (items.length < 10) {
        const extra = await supabase
          .from('deposits')
          .select('id, telegram_id, amount, status, updated_at, deposit_methods(id, name, type), users!deposits_telegram_id_fkey(first_name, username)')
          .eq('status', 'approved')
          .order('updated_at', { ascending: false })
          .limit(10 - items.length);
        if (extra.data) {
          const existingIds = new Set(items.map((x: any) => x.id));
          const padded = extra.data.filter((x: any) => !existingIds.has(x.id));
          items = [...items, ...padded];
        }
      }
    } else {
      let q = supabase
        .from('withdrawals')
        .select('id, telegram_id, method_id, amount, net_amount, fee_amount, account_name, account_number, status, updated_at, withdrawal_methods(id, type)')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(10);
      if (lastPostAt) q = q.gt('updated_at', lastPostAt);
      const { data } = await q;
      items = await enrichWithdrawals(data || []);
      // Pad if needed
      if (items.length < 10) {
        const extra = await supabase
          .from('withdrawals')
          .select('id, telegram_id, method_id, amount, net_amount, fee_amount, account_name, account_number, status, updated_at, withdrawal_methods(id, type)')
          .eq('status', 'approved')
          .order('updated_at', { ascending: false })
          .limit(10 - items.length);
        if (extra.data) {
          const enrichedExtra = await enrichWithdrawals(extra.data);
          const existingIds = new Set(items.map((x: any) => x.id));
          const padded = enrichedExtra.filter((x: any) => !existingIds.has(x.id));
          items = [...items, ...padded];
        }
      }
    }

    // Generate & post
    const { publicImageUrl, messageId } = await generateAndPostFlyer(
      type,
      items as (DepositRow | WithdrawalRow)[],
      channelId,
      botToken,
      botUsername,
      threshold
    );

    // Update settings: lastPostAt + cached image
    const nowIso = new Date().toISOString();
    const settingsToUpdate = isDeposit
      ? [
          { key: 'last_channel_post_deposit_at', value: nowIso },
          { key: 'last_channel_post_deposit_image', value: publicImageUrl },
          { key: 'last_channel_post_deposit_image_at', value: nowIso }
        ]
      : [
          { key: 'last_channel_post_withdraw_at', value: nowIso },
          { key: 'last_channel_post_withdraw_image', value: publicImageUrl },
          { key: 'last_channel_post_withdraw_image_at', value: nowIso }
        ];

    await supabase.from('settings').upsert(settingsToUpdate, { onConflict: 'key' });

    res.json({ success: true, channelId, publicImageUrl, messageId, postedAt: nowIso });
  } catch (err: any) {
    console.error('Error posting proof to channel:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/channel-proofs/send-to-me ──────────────────────────────────────
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
      body: JSON.stringify({ chat_id: telegramId, photo: publicUrl, caption, parse_mode: 'HTML' }),
    });

    const tgData = (await tgRes.json()) as any;
    res.json({ success: tgRes.ok && tgData.ok, publicUrl, tgData });
  } catch (err: any) {
    console.error('send-to-me error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── PUT /api/channel-proofs/settings ─────────────────────────────────────────
router.put('/settings', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { depositThreshold, depositEnabled, withdrawThreshold, withdrawEnabled, targetChannel } = req.body;

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

// ── Auto-post: called after every deposit/withdrawal approval ─────────────────
export async function checkAndAutoPostProofs(type: 'deposit' | 'withdrawal'): Promise<void> {
  try {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return;

    const botUsername = process.env.BOT_USERNAME || 'hdasebingo_bot';

    // Fetch relevant settings
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

    // Count approved records since last post
    let countQ = supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');
    if (lastPostAt) countQ = countQ.gt('updated_at', lastPostAt);
    const { count } = await countQ;
    const unposted = count ?? 0;

    if (unposted < threshold) {
      // Not yet reached threshold — nothing to do
      return;
    }

    console.log(`Auto-post threshold reached for ${type}: ${unposted}/${threshold}. Generating flyer server-side...`);

    const channelId = normalizeTelegramChannel(sMap.channel_post_target || sMap.channel_link || DEFAULT_PROOF_CHANNEL);

    // Fetch the NEW batch (since lastPostAt), up to 10 rows for the canvas
    let items: any[] = [];
    if (isDeposit) {
      let q = supabase
        .from('deposits')
        .select('id, telegram_id, amount, status, updated_at, deposit_methods(id, name, type), users!deposits_telegram_id_fkey(first_name, username)')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(10);
      if (lastPostAt) q = q.gt('updated_at', lastPostAt);
      const { data } = await q;
      items = data || [];
      // Pad with older rows if batch < 10
      if (items.length < 10) {
        const extra = await supabase
          .from('deposits')
          .select('id, telegram_id, amount, status, updated_at, deposit_methods(id, name, type), users!deposits_telegram_id_fkey(first_name, username)')
          .eq('status', 'approved')
          .order('updated_at', { ascending: false })
          .limit(10 - items.length);
        if (extra.data) {
          const existingIds = new Set(items.map((x: any) => x.id));
          items = [...items, ...extra.data.filter((x: any) => !existingIds.has(x.id))];
        }
      }
    } else {
      let q = supabase
        .from('withdrawals')
        .select('id, telegram_id, method_id, amount, net_amount, fee_amount, account_name, account_number, status, updated_at, withdrawal_methods(id, type)')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(10);
      if (lastPostAt) q = q.gt('updated_at', lastPostAt);
      const { data } = await q;
      items = await enrichWithdrawals(data || []);
      if (items.length < 10) {
        const extra = await supabase
          .from('withdrawals')
          .select('id, telegram_id, method_id, amount, net_amount, fee_amount, account_name, account_number, status, updated_at, withdrawal_methods(id, type)')
          .eq('status', 'approved')
          .order('updated_at', { ascending: false })
          .limit(10 - items.length);
        if (extra.data) {
          const enrichedExtra = await enrichWithdrawals(extra.data);
          const existingIds = new Set(items.map((x: any) => x.id));
          items = [...items, ...enrichedExtra.filter((x: any) => !existingIds.has(x.id))];
        }
      }
    }

    // Generate flyer server-side and post to channel
    const { publicImageUrl } = await generateAndPostFlyer(
      type,
      items as (DepositRow | WithdrawalRow)[],
      channelId,
      botToken,
      botUsername,
      threshold
    );

    // Update last post timestamp and cached image URL
    const nowIso = new Date().toISOString();
    await supabase.from('settings').upsert([
      { key: isDeposit ? 'last_channel_post_deposit_at' : 'last_channel_post_withdraw_at', value: nowIso },
      { key: isDeposit ? 'last_channel_post_deposit_image' : 'last_channel_post_withdraw_image', value: publicImageUrl },
      { key: isDeposit ? 'last_channel_post_deposit_image_at' : 'last_channel_post_withdraw_image_at', value: nowIso },
    ], { onConflict: 'key' });

    console.log(`✅ Auto-posted ${type} proof flyer to ${channelId} (${unposted}/${threshold} milestone). URL: ${publicImageUrl}`);
  } catch (autoErr) {
    console.error('Error during checkAndAutoPostProofs:', autoErr);
  }
}

export default router;
