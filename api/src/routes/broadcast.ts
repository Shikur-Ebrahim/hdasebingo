/**
 * api/src/routes/broadcast.ts
 * Admin Broadcast / Post management
 *
 * Endpoints:
 *  GET    /api/broadcast                 – list all posts (admin)
 *  GET    /api/broadcast/channel-default – get default configured channel (@hdasebingo)
 *  POST   /api/broadcast                 – create post (draft or scheduled)
 *  PUT    /api/broadcast/:id             – update post
 *  DELETE /api/broadcast/:id             – delete post (also deletes R2 media)
 *  POST   /api/broadcast/:id/send        – immediately send/publish a post
 *  POST   /api/broadcast/presign         – get R2 presigned URL for image/video upload
 */

import { Router, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { getPresignedUploadUrl, deleteFromR2 } from '../services/r2';
import crypto from 'crypto';

const router = Router();

// Default Telegram Channel
export const DEFAULT_CHANNEL = '@hdasebingo';

// ── Middleware: admin only ────────────────────────────────────────────────────
const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const telegramId = req.telegramUser!.id.toString();
  const { data } = await supabase.from('users').select('role').eq('telegram_id', telegramId).single();
  if (!data || data.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
};

/**
 * Normalizes any channel link or username into a valid Telegram chat_id:
 * - "https://t.me/hdasebingo" -> "@hdasebingo"
 * - "t.me/hdasebingo"        -> "@hdasebingo"
 * - "@hdasebingo"            -> "@hdasebingo"
 * - "hdasebingo"             -> "@hdasebingo"
 * - "-100123456789"         -> "-100123456789"
 * - empty / null            -> "@hdasebingo"
 */
export function normalizeTelegramChannel(input?: string | null): string {
  if (!input || !input.trim()) return DEFAULT_CHANNEL;
  let ch = input.trim();
  // Strip http://, https://, www., t.me/, telegram.me/
  ch = ch.replace(/^https?:\/\//i, '');
  ch = ch.replace(/^www\./i, '');
  ch = ch.replace(/^(t\.me|telegram\.me)\//i, '');
  ch = ch.replace(/\/.*$/, ''); // strip any trailing slash or path parts
  ch = ch.trim();
  if (!ch) return DEFAULT_CHANNEL;
  // If numeric channel/group ID (e.g. -100123456789 or 100123456789)
  if (ch.startsWith('-') || /^\d+$/.test(ch)) {
    return ch.startsWith('-') ? ch : `-${ch}`;
  }
  // Otherwise it's a username handle
  ch = ch.replace(/^@/, '');
  return `@${ch}`;
}

// ── Helper: resolve Telegram Channel username or chat ID ────────────────────
async function resolveChannelId(customChannel?: string | null): Promise<string> {
  if (customChannel && customChannel.trim()) {
    return normalizeTelegramChannel(customChannel);
  }

  if (process.env.TELEGRAM_CHANNEL_ID && process.env.TELEGRAM_CHANNEL_ID.trim()) {
    return normalizeTelegramChannel(process.env.TELEGRAM_CHANNEL_ID);
  }

  try {
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['channel_link', 'channel_id', 'telegram_channel_id']);

    if (rows && rows.length > 0) {
      for (const k of ['channel_id', 'telegram_channel_id', 'channel_link']) {
        const found = rows.find(r => r.key === k && r.value);
        if (found && found.value.trim()) {
          return normalizeTelegramChannel(found.value);
        }
      }
    }
  } catch (err) {
    console.error('[Broadcast] Failed to read channel from settings:', err);
  }

  return DEFAULT_CHANNEL;
}

// ── Helper: send one Telegram request with fallback for markdown parse errors ─
async function sendTelegramRequest(
  base: string,
  endpoint: string,
  payload: any
): Promise<{ ok: boolean; error?: string }> {
  try {
    let r = await fetch(`${base}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errJson = (await r.json().catch(() => null)) as any;
      const desc = errJson?.description || r.statusText;

      // If Markdown parse failed (bad entity / formatting), retry without Markdown
      if (
        payload.parse_mode &&
        (desc.includes('parse') || desc.includes('entity') || desc.includes('can\'t parse'))
      ) {
        const plainPayload = { ...payload };
        delete plainPayload.parse_mode;
        const retryR = await fetch(`${base}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plainPayload),
        });
        if (retryR.ok) return { ok: true };
        const retryJson = (await retryR.json().catch(() => null)) as any;
        return { ok: false, error: retryJson?.description || retryR.statusText };
      }

      return { ok: false, error: desc };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ── Helper: send media / message to a user or channel ─────────────────────────
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  body: string,
  mediaUrl?: string | null,
  mediaType?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const base = `https://api.telegram.org/bot${botToken}`;

  // Telegram photo/video caption limit is 1024 chars
  const isCaptionTooLong = mediaUrl && body.length > 1020;
  const caption = isCaptionTooLong ? body.slice(0, 1017) + '...' : body;

  let result: { ok: boolean; error?: string };

  if (mediaUrl && mediaType === 'video') {
    result = await sendTelegramRequest(base, 'sendVideo', {
      chat_id: chatId,
      video: mediaUrl,
      caption: caption || undefined,
      parse_mode: 'Markdown',
      supports_streaming: true,
    });
  } else if (mediaUrl && mediaType === 'image') {
    result = await sendTelegramRequest(base, 'sendPhoto', {
      chat_id: chatId,
      photo: mediaUrl,
      caption: caption || undefined,
      parse_mode: 'Markdown',
    });
  } else {
    result = await sendTelegramRequest(base, 'sendMessage', {
      chat_id: chatId,
      text: body,
      parse_mode: 'Markdown',
    });
  }

  // If caption was too long, send the full body as follow-up text message
  if (result.ok && isCaptionTooLong) {
    await sendTelegramRequest(base, 'sendMessage', {
      chat_id: chatId,
      text: body,
      parse_mode: 'Markdown',
    });
  }

  return result;
}

// ── Core: broadcast a post to all eligible users and/or channel ───────────────
async function executeBroadcast(postId: string): Promise<void> {
  const { data: post } = await supabase
    .from('broadcast_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (!post) return;

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    await supabase.from('broadcast_posts').update({
      status: 'failed',
      error_message: 'BOT_TOKEN environment variable is not set on the server',
      updated_at: new Date().toISOString(),
    }).eq('id', postId);
    console.error('[Broadcast] BOT_TOKEN not set');
    return;
  }

  // Mark as sending
  await supabase.from('broadcast_posts').update({
    status: 'sending',
    updated_at: new Date().toISOString(),
  }).eq('id', postId);

  let sentCount = 0;
  let failedCount = 0;
  let lastError = '';

  const mediaUrl = post.media_url || null;
  const mediaType = post.media_type || null;

  // Format message text: combine title + body
  const messageText = post.title && post.title.trim()
    ? `*${post.title.trim()}*\n\n${post.body.trim()}`
    : post.body.trim();

  // ── 1. Send to channel if requested ─────────────────────────────────────────
  const sendToChannel = post.send_to === 'channel' || post.send_to === 'both';
  if (sendToChannel) {
    const channelId = await resolveChannelId(post.channel_id);
    console.log(`[Broadcast] Sending to Telegram channel: ${channelId} (post.id: ${postId})`);
    const res = await sendTelegramMessage(botToken, channelId, messageText, mediaUrl, mediaType);
    if (res.ok) {
      sentCount++;
      console.log(`[Broadcast] ✅ Successfully posted to channel ${channelId}`);
    } else {
      failedCount++;
      let friendlyError = res.error || 'Failed to send to channel';
      if (
        friendlyError.includes('chat not found') ||
        friendlyError.includes('not a member') ||
        friendlyError.includes('administrator') ||
        friendlyError.includes('CHAT_ADMIN')
      ) {
        friendlyError = `Channel (${channelId}): Bot is not an Administrator in the channel. Please add your Telegram Bot as an Admin in ${channelId} with "Post Messages" permission.`;
      }
      lastError = friendlyError;
      console.warn(`[Broadcast] ❌ Channel error: ${friendlyError}`);
    }
  }

  // ── 2. Send to all users (excluding admins, workers, and inactive accounts) ──
  const sendToBot = post.send_to === 'bot' || post.send_to === 'both';
  if (sendToBot) {
    let page = 0;
    const pageSize = 100;

    while (true) {
      const { data: users, error: uErr } = await supabase
        .from('users')
        .select('telegram_id, role, status')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (uErr) {
        console.error('[Broadcast] Error fetching users page', page, uErr);
        if (!lastError) lastError = `DB error: ${uErr.message}`;
        break;
      }

      if (!users || users.length === 0) break;

      // Filter in JS: only regular players (not admin, not worker, not inactive)
      const eligible = users.filter((u: any) =>
        u.telegram_id &&
        u.role !== 'admin' &&
        u.role !== 'worker' &&
        u.status !== 'inactive'
      );

      for (const u of eligible) {
        await new Promise(r => setTimeout(r, 35)); // ~28 msg/sec Telegram rate limit
        const res = await sendTelegramMessage(botToken, u.telegram_id, messageText, mediaUrl, mediaType);
        if (res.ok) {
          sentCount++;
        } else {
          failedCount++;
          if (!lastError && res.error) lastError = res.error;
        }
      }

      if (users.length < pageSize) break;
      page++;
    }
  }

  const finalStatus = sentCount > 0 ? 'sent' : 'failed';

  await supabase.from('broadcast_posts').update({
    status: finalStatus,
    sent_at: new Date().toISOString(),
    sent_count: sentCount,
    failed_count: failedCount,
    error_message: lastError || null,
    updated_at: new Date().toISOString(),
  }).eq('id', postId);

  console.log(`[Broadcast] Post ${postId} finished: status=${finalStatus}, sent=${sentCount}, failed=${failedCount}`);
}

// ── Background scheduler ──────────────────────────────────────────────────────
let schedulerRunning = false;
export function startBroadcastScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  setInterval(async () => {
    try {
      const { data: duePosts } = await supabase
        .from('broadcast_posts')
        .select('id')
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString());

      if (!duePosts || duePosts.length === 0) return;

      for (const p of duePosts) {
        console.log(`[Broadcast] Scheduled post due: ${p.id}`);
        executeBroadcast(p.id).catch(e => console.error('[Broadcast Scheduler]', e));
      }
    } catch (e) {
      console.error('[Broadcast Scheduler]', e);
    }
  }, 30_000);

  console.log('📢 Broadcast scheduler running');
}

// ── GET /api/broadcast/channel-default ────────────────────────────────────────
router.get('/channel-default', validateTelegramAuth, requireAdmin, async (_req, res) => {
  const channel = await resolveChannelId();
  res.json({ defaultChannel: channel || DEFAULT_CHANNEL });
});

// ── GET /api/broadcast ────────────────────────────────────────────────────────
router.get('/', validateTelegramAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('broadcast_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ posts: data || [] });
});

// ── POST /api/broadcast/presign ───────────────────────────────────────────────
router.post('/presign', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { filename, contentType } = req.body;
  if (!filename || !contentType) {
    res.status(400).json({ error: 'filename and contentType required' }); return;
  }
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const allowedVideos = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
  const allowed = [...allowedImages, ...allowedVideos];

  if (!allowed.includes(contentType)) {
    res.status(400).json({ error: 'Only image/video files allowed' }); return;
  }

  const isVideo = allowedVideos.includes(contentType);
  const ext = filename.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
  const folder = isVideo ? 'post-videos' : 'post-images';
  const key = `${folder}/${crypto.randomBytes(10).toString('hex')}.${ext}`;

  try {
    const uploadUrl = await getPresignedUploadUrl(key, contentType, 600); // 10-minute window
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ uploadUrl, publicUrl, key, mediaType: isVideo ? 'video' : 'image' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/broadcast ───────────────────────────────────────────────────────
router.post('/', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const { title, body, media_url, media_key, media_type, send_to, channel_id, scheduled_at } = req.body;

  if (!body || !body.trim()) {
    res.status(400).json({ error: 'Post body is required' }); return;
  }
  const sendTo = ['bot', 'channel', 'both'].includes(send_to) ? send_to : 'bot';
  const status = scheduled_at ? 'scheduled' : 'draft';
  const resolvedChannel = (sendTo === 'channel' || sendTo === 'both')
    ? normalizeTelegramChannel(channel_id)
    : null;

  const { data, error } = await supabase
    .from('broadcast_posts')
    .insert({
      title: title || '',
      body: body.trim(),
      media_url: media_url || null,
      media_key: media_key || null,
      media_type: media_type || null,
      send_to: sendTo,
      channel_id: resolvedChannel,
      status,
      scheduled_at: scheduled_at || null,
      created_by: telegramId,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ post: data });
});

// ── PUT /api/broadcast/:id ────────────────────────────────────────────────────
router.put('/:id', validateTelegramAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, body, media_url, media_key, media_type, send_to, channel_id, scheduled_at } = req.body;

  const { data: existing } = await supabase.from('broadcast_posts').select('status, media_key').eq('id', id).single();
  if (!existing) { res.status(404).json({ error: 'Post not found' }); return; }
  if (existing.status === 'sent' || existing.status === 'sending') {
    res.status(400).json({ error: 'Cannot edit a post that is already sent or sending' }); return;
  }

  if (media_key && existing.media_key && media_key !== existing.media_key) {
    deleteFromR2(existing.media_key).catch(() => {});
  }

  const sendTo = ['bot', 'channel', 'both'].includes(send_to) ? send_to : 'bot';
  const status = scheduled_at ? 'scheduled' : 'draft';
  const resolvedChannel = (sendTo === 'channel' || sendTo === 'both')
    ? normalizeTelegramChannel(channel_id)
    : null;

  const { data, error } = await supabase
    .from('broadcast_posts')
    .update({
      title: title || '',
      body: body?.trim(),
      media_url: media_url || null,
      media_key: media_key || null,
      media_type: media_type || null,
      send_to: sendTo,
      channel_id: resolvedChannel,
      status,
      scheduled_at: scheduled_at || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ post: data });
});

// ── DELETE /api/broadcast/:id ─────────────────────────────────────────────────
router.delete('/:id', validateTelegramAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from('broadcast_posts').select('media_key').eq('id', id).single();
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

  if (existing.media_key) {
    deleteFromR2(existing.media_key).catch(() => {});
  }

  const { error } = await supabase.from('broadcast_posts').delete().eq('id', id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// ── POST /api/broadcast/:id/send ─────────────────────────────────────────────
router.post('/:id/send', validateTelegramAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: post } = await supabase.from('broadcast_posts').select('status').eq('id', id).single();
  if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
  if (post.status === 'sending') { res.status(400).json({ error: 'Already sending' }); return; }
  if (post.status === 'sent') { res.status(400).json({ error: 'Already sent' }); return; }

  res.json({ success: true, message: 'Broadcast started' });
  executeBroadcast(id).catch(e => console.error('[Broadcast Send]', e));
});

export default router;
