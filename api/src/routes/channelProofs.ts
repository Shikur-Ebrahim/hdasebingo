import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { uploadToR2 } from '../services/r2';
import { generateStylizedSystemNames } from '../services/systemPlayerService';

const router = Router();

// Default Telegram Channel
export const DEFAULT_PROOF_CHANNEL = '@hdasebingo_channel';

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

// ── Helpers for Dynamically Tracking Database Deposit & Withdrawal Methods ───
export async function getActiveDepositMethods(): Promise<Array<{ id: string; name?: string; type: string }>> {
  try {
    const { data } = await supabase
      .from('deposit_methods')
      .select('id, name, type, is_active')
      .eq('is_active', true);
    if (data && data.length > 0) {
      return data.map(d => ({
        id: d.id,
        name: d.name || d.type,
        type: d.type || 'telebirr'
      }));
    }
  } catch (err) {
    console.error('Failed to query deposit_methods:', err);
  }

  return [
    { id: 'cbe', name: 'Zahara', type: 'cbe' },
    { id: 'telebirr', name: 'Zahara', type: 'telebirr' },
    { id: 'dashen', name: 'Zahara', type: 'dashen' },
    { id: 'boa', name: 'Zahara', type: 'boa' },
    { id: 'awash', name: 'Zahara', type: 'awash' }
  ];
}

export async function getActiveWithdrawalMethods(): Promise<Array<{ id: string; type: string }>> {
  try {
    const { data } = await supabase
      .from('withdrawal_methods')
      .select('id, type, is_active')
      .eq('is_active', true);
    if (data && data.length > 0) {
      return data.map(w => ({
        id: w.id,
        type: w.type || 'telebirr'
      }));
    }
  } catch (err) {
    console.error('Failed to query withdrawal_methods:', err);
  }

  return [
    { id: 'telebirr', type: 'telebirr' },
    { id: 'cbe', type: 'cbe' },
    { id: 'boa', type: 'boa' },
    { id: 'dashen', type: 'dashen' },
    { id: 'awash', type: 'awash' }
  ];
}

// ── Realistic Amount Rounding ─────────────────────────────────────────────────
export function getRandomDepositAmount(min = 50, max = 1000): number {
  const steps = [50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 750, 800, 1000];
  const filtered = steps.filter(s => s >= min && s <= max);
  if (filtered.length > 0) {
    return filtered[Math.floor(Math.random() * filtered.length)];
  }
  const raw = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.max(min, Math.min(max, Math.round(raw / 25) * 25));
}

export function getRandomWithdrawalAmount(min = 100, max = 5000): number {
  const steps = [100, 150, 200, 250, 300, 400, 500, 600, 750, 800, 1000, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 5000];
  const filtered = steps.filter(s => s >= min && s <= max);
  if (filtered.length > 0) {
    return filtered[Math.floor(Math.random() * filtered.length)];
  }
  const raw = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.max(min, Math.min(max, Math.round(raw / 50) * 50));
}

// ── Helper to fetch bot candidates prioritizing winners ───────────────────────
export async function getBotCandidates(count: number, preferWinners = true): Promise<Array<{ id: string; first_name: string; total_won?: number }>> {
  try {
    let query = supabase.from('system_players').select('id, telegram_id, first_name, total_won');
    if (preferWinners) {
      query = query.gt('total_won', 0).order('total_won', { ascending: false });
    }
    const { data } = await query.limit(Math.max(count * 3, 50));
    let candidates = (data || []).map(b => ({
      id: b.id || b.telegram_id || `bot_${Math.random()}`,
      first_name: (b.first_name || 'Player').trim(),
      total_won: Number(b.total_won) || 0
    }));

    if (candidates.length < count) {
      const fallbackNames = generateStylizedSystemNames(count - candidates.length + 20);
      for (const name of fallbackNames) {
        candidates.push({
          id: `bot_${Math.random().toString(36).slice(2, 9)}`,
          first_name: name,
          total_won: 500
        });
      }
    }

    return candidates.sort(() => Math.random() - 0.5).slice(0, count);
  } catch {
    const fallbackNames = generateStylizedSystemNames(count + 10);
    return fallbackNames.slice(0, count).map(name => ({
      id: `bot_${Math.random().toString(36).slice(2, 9)}`,
      first_name: name,
      total_won: 300
    }));
  }
}

// ── Natural Interleaving of Real and System Proofs ────────────────────────────
export function interleaveProofs<T extends { created_at?: string; updated_at?: string }>(realList: T[], sysList: T[]): T[] {
  if (realList.length === 0) return sysList;
  if (sysList.length === 0) return realList;

  const result: T[] = [];
  let rIdx = 0;
  let sIdx = 0;
  const ratio = Math.max(1, Math.round(sysList.length / Math.max(1, realList.length)));

  while (rIdx < realList.length || sIdx < sysList.length) {
    if (rIdx < realList.length) {
      result.push(realList[rIdx++]);
    }
    for (let k = 0; k < ratio && sIdx < sysList.length; k++) {
      result.push(sysList[sIdx++]);
    }
  }

  return result;
}

// ── GET /api/channel-proofs/data ──────────────────────────────────────────────
router.get('/data', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    // 1. Fetch settings including system player queues
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
        'posted_withdraw_ids',
        'system_proof_deposits',
        'system_proof_withdrawals'
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

    // 2. Fetch active deposit and withdrawal methods from database
    const availableDepositMethods = await getActiveDepositMethods();
    const availableWithdrawalMethods = await getActiveWithdrawalMethods();

    // 3. Fetch approved real deposits (up to 100)
    const { data: depositsRaw } = await supabase
      .from('deposits')
      .select('id, telegram_id, amount, status, created_at, updated_at, deposit_methods(id, name, type), users!deposits_telegram_id_fkey(first_name, username)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(100);

    // 4. Fetch approved real withdrawals (up to 100)
    const { data: withdrawalsRaw } = await supabase
      .from('withdrawals')
      .select('id, telegram_id, method_id, amount, net_amount, fee_amount, account_name, account_number, status, created_at, updated_at, withdrawal_methods(id, type)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(100);

    // Enrich real withdrawals with user names
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
        users: userMap[w.telegram_id] || null,
        is_system: false
      }));
    }

    // 5. Parse system player proofs from settings
    let systemDeposits: any[] = [];
    try {
      systemDeposits = JSON.parse(sMap.system_proof_deposits || '[]');
      if (!Array.isArray(systemDeposits)) systemDeposits = [];
    } catch {
      systemDeposits = [];
    }

    let systemWithdrawals: any[] = [];
    try {
      systemWithdrawals = JSON.parse(sMap.system_proof_withdrawals || '[]');
      if (!Array.isArray(systemWithdrawals)) systemWithdrawals = [];
    } catch {
      systemWithdrawals = [];
    }

    // 6. Filter unposted (NOT yet posted) transactions
    const unpostedRealDeposits = (depositsRaw || []).filter(d => !postedDepositIds.includes(d.id)).map(d => ({ ...d, is_system: false }));
    const unpostedSysDeposits = systemDeposits.filter(d => !postedDepositIds.includes(d.id));

    const unpostedRealWithdrawals = enrichedWithdrawals.filter(w => !postedWithdrawIds.includes(w.id));
    const unpostedSysWithdrawals = systemWithdrawals.filter(w => !postedWithdrawIds.includes(w.id));

    // 7. Naturally combine and interleave real and system player proofs
    const combinedDeposits = interleaveProofs(unpostedRealDeposits, unpostedSysDeposits);
    const combinedWithdrawals = interleaveProofs(unpostedRealWithdrawals, unpostedSysWithdrawals);

    // Count winner bots in pool
    let winnerBotsCount = 0;
    try {
      const { count } = await supabase.from('system_players').select('*', { count: 'exact', head: true }).gt('total_won', 0);
      winnerBotsCount = count || 0;
    } catch {}

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
      unpostedDepositsCount: combinedDeposits.length,
      unpostedWithdrawalsCount: combinedWithdrawals.length,
      realDepositsCount: unpostedRealDeposits.length,
      systemDepositsCount: unpostedSysDeposits.length,
      realWithdrawalsCount: unpostedRealWithdrawals.length,
      systemWithdrawalsCount: unpostedSysWithdrawals.length,
      unpostedDeposits: combinedDeposits,
      unpostedWithdrawals: combinedWithdrawals,
      recentDeposits: combinedDeposits,
      recentWithdrawals: combinedWithdrawals,
      postedDepositIdsCount: postedDepositIds.length,
      postedWithdrawIdsCount: postedWithdrawIds.length,
      availableDepositMethods,
      availableWithdrawalMethods,
      winnerBotsCount,
    });
  } catch (err: any) {
    console.error('Error fetching channel proofs data:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/channel-proofs/generate-system-proofs ───────────────────────────
router.post('/generate-system-proofs', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const {
      type = 'both', // 'deposit' | 'withdrawal' | 'both'
      count = 10,
      min_deposit = 50,
      max_deposit = 1000,
      min_withdraw = 100,
      max_withdraw = 5000,
      prefer_winners = true
    } = req.body;

    const requestedCount = Math.min(100, Math.max(1, parseInt(count, 10) || 10));
    const activeDepMethods = await getActiveDepositMethods();
    const activeWithMethods = await getActiveWithdrawalMethods();

    // Fetch existing system proofs from settings
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['system_proof_deposits', 'system_proof_withdrawals', 'posted_deposit_ids', 'posted_withdraw_ids']);

    const sMap = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
    let existingSysDeposits: any[] = [];
    try { existingSysDeposits = JSON.parse(sMap.system_proof_deposits || '[]'); } catch { existingSysDeposits = []; }
    let existingSysWithdrawals: any[] = [];
    try { existingSysWithdrawals = JSON.parse(sMap.system_proof_withdrawals || '[]'); } catch { existingSysWithdrawals = []; }

    let postedDepIds: string[] = [];
    try { postedDepIds = JSON.parse(sMap.posted_deposit_ids || '[]'); } catch { postedDepIds = []; }
    let postedWithIds: string[] = [];
    try { postedWithIds = JSON.parse(sMap.posted_withdraw_ids || '[]'); } catch { postedWithIds = []; }

    const newDeposits: any[] = [];
    const newWithdrawals: any[] = [];
    const now = Date.now();

    if (type === 'deposit' || type === 'both') {
      const candidates = await getBotCandidates(requestedCount, prefer_winners !== false);
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const method = activeDepMethods[Math.floor(Math.random() * activeDepMethods.length)];
        const amount = getRandomDepositAmount(Number(min_deposit) || 50, Number(max_deposit) || 1000);
        const ts = new Date(now - (i * 7 + Math.floor(Math.random() * 15)) * 60 * 1000).toISOString();

        newDeposits.push({
          id: `sys-dep-${crypto.randomUUID()}`,
          telegram_id: c.id,
          amount,
          status: 'approved',
          created_at: ts,
          updated_at: ts,
          deposit_methods: {
            id: method.id,
            name: method.name || method.type,
            type: method.type
          },
          users: {
            first_name: c.first_name,
            username: c.first_name
          },
          is_system: true
        });
      }
    }

    if (type === 'withdrawal' || type === 'both') {
      const candidates = await getBotCandidates(requestedCount, prefer_winners !== false);
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const method = activeWithMethods[Math.floor(Math.random() * activeWithMethods.length)];
        const amount = getRandomWithdrawalAmount(Number(min_withdraw) || 100, Number(max_withdraw) || 5000);
        const ts = new Date(now - (i * 9 + Math.floor(Math.random() * 20)) * 60 * 1000).toISOString();

        newWithdrawals.push({
          id: `sys-wth-${crypto.randomUUID()}`,
          telegram_id: c.id,
          method_id: method.id,
          amount,
          net_amount: amount,
          fee_amount: 0,
          account_name: c.first_name,
          account_number: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
          status: 'approved',
          created_at: ts,
          updated_at: ts,
          withdrawal_methods: {
            id: method.id,
            type: method.type
          },
          users: {
            first_name: c.first_name,
            username: c.first_name
          },
          is_system: true
        });
      }
    }

    const combinedSysDeposits = [...newDeposits, ...existingSysDeposits].slice(0, 300);
    const combinedSysWithdrawals = [...newWithdrawals, ...existingSysWithdrawals].slice(0, 300);

    const updates = [];
    if (newDeposits.length > 0) {
      updates.push({ key: 'system_proof_deposits', value: JSON.stringify(combinedSysDeposits) });
    }
    if (newWithdrawals.length > 0) {
      updates.push({ key: 'system_proof_withdrawals', value: JSON.stringify(combinedSysWithdrawals) });
    }

    if (updates.length > 0) {
      await supabase.from('settings').upsert(updates, { onConflict: 'key' });
    }

    const unpostedDepCount = combinedSysDeposits.filter(d => !postedDepIds.includes(d.id)).length;
    const unpostedWithCount = combinedSysWithdrawals.filter(w => !postedWithIds.includes(w.id)).length;

    res.json({
      success: true,
      generatedDeposits: newDeposits.length,
      generatedWithdrawals: newWithdrawals.length,
      unpostedSystemDeposits: unpostedDepCount,
      unpostedSystemWithdrawals: unpostedWithCount,
      message: `በተሳካ ሁኔታ ${newDeposits.length + newWithdrawals.length} የሲስተም ተጫዋች ፕሩፎች ተፈጥረው ከእውነተኛ ጋር ተቀላቅለዋል!`
    });
  } catch (err: any) {
    console.error('Error generating system proofs:', err);
    res.status(500).json({ error: err.message || 'Failed to generate system proofs' });
  }
});

// ── POST /api/channel-proofs/clear-system-proofs ──────────────────────────────
router.post('/clear-system-proofs', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type = 'all' } = req.body;
    const updates = [];
    if (type === 'deposit' || type === 'all') {
      updates.push({ key: 'system_proof_deposits', value: '[]' });
    }
    if (type === 'withdrawal' || type === 'all') {
      updates.push({ key: 'system_proof_withdrawals', value: '[]' });
    }
    if (updates.length > 0) {
      await supabase.from('settings').upsert(updates, { onConflict: 'key' });
    }
    res.json({ success: true, message: 'System player proof queue cleared' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear system proofs' });
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
          `✅ <b>የተጫዋቾች ዲፖዚት በተሳካ ሁኔታ ገቢ ተደርጓል!</b>\n` +
          `⚡️ ፈጣን እና አስተማማኝ የሂሳብ መሙያ።\n` +
          `🛡️ 100% የታመነ እና የተረጋገጠ አሰራር።\n\n` +
          `📞 <b>ለማንኛውም ጥያቄ በቀጥታ ይደውሉ:</b> +251996598686\n\n` +
          `🎮 <b>አሁኑኑ ይጫወቱ:</b> @${botUsername}`;
      } else {
        finalCaption =
          `💸 <b>የአሸናፊዎች የሽልማት ክፍያ በተሳካ ሁኔታ ተፈጽሟል!</b>\n` +
          `🎉 ለሁሉም አሸናፊዎቻችን እንኳን ደስ አላችሁ!\n\n` +
          `📞 <b>ለማንኛውም ጥያቄ በቀጥታ ይደውሉ:</b> +251996598686\n\n` +
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
        `✅ <b>የተጫዋቾች ዲፖዚት በተሳካ ሁኔታ ገቢ ተደርጓል!</b>\n` +
        `⚡️ ፈጣን እና አስተማማኝ የሂሳብ መሙያ።\n` +
        `🛡️ 100% የታመነ እና የተረጋገጠ አሰራር።\n\n` +
        `📞 <b>ለማንኛውም ጥያቄ በቀጥታ ይደውሉ:</b> +251996598686\n\n` +
        `🎮 <b>አሁኑኑ ይጫወቱ:</b> @${botUsername}`;
    } else {
      caption =
        `💸 <b>የአሸናፊዎች የሽልማት ክፍያ በተሳካ ሁኔታ ተፈጽሟል!</b>\n` +
        `🎉 ለሁሉም አሸናፊዎቻችን እንኳን ደስ አላችሁ!\n\n` +
        `📞 <b>ለማንኛውም ጥያቄ በቀጥታ ይደውሉ:</b> +251996598686\n\n` +
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
