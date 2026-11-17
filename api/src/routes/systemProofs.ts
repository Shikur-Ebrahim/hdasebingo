import { Router, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { uploadToR2 } from '../services/r2';
import { resolveProofChannel } from './channelProofs';
import { generateStylizedSystemNames } from '../services/systemPlayerService';

const router = Router();

// Middleware: Admin or Worker only
const requireAdminOrWorker = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const telegramId = req.telegramUser!.id.toString();
  const { data } = await supabase.from('users').select('role, permissions').eq('telegram_id', telegramId).single();
  if (!data || (data.role !== 'admin' && data.role !== 'worker')) {
    res.status(403).json({ error: 'Admin or authorized worker only' });
    return;
  }
  next();
};

export interface SystemProofItem {
  id: string;
  system_player_id?: string;
  first_name: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  method: string;
  method_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  is_winner?: boolean;
}

export interface SystemProofSettings {
  depositThreshold: number;
  depositEnabled: boolean;
  withdrawThreshold: number;
  withdrawEnabled: boolean;
  targetChannel: string;
  lastDepositPostAt: string | null;
  lastWithdrawPostAt: string | null;
  lastDepositImage?: string | null;
  lastWithdrawImage?: string | null;
  depositMin: number;
  depositMax: number;
  withdrawMin: number;
  withdrawMax: number;
  dailyAutoGenerate: boolean;
  dailyDeposits: number;
  dailyWithdrawals: number;
}

const DEFAULT_SYSTEM_SETTINGS: SystemProofSettings = {
  depositThreshold: 10,
  depositEnabled: true,
  withdrawThreshold: 10,
  withdrawEnabled: true,
  targetChannel: '@hdasebingo_channel',
  lastDepositPostAt: null,
  lastWithdrawPostAt: null,
  depositMin: 50,
  depositMax: 1000,
  withdrawMin: 100,
  withdrawMax: 5000,
  dailyAutoGenerate: true,
  dailyDeposits: 50,
  dailyWithdrawals: 30,
};

// Realistic Ethiopian payment methods with proportional weights
const PAYMENT_METHODS = [
  { name: 'Telebirr', type: 'telebirr', weight: 60 },
  { name: 'CBE Bank', type: 'cbe', weight: 25 },
  { name: 'Dashen Bank', type: 'dashen', weight: 5 },
  { name: 'Abyssinia', type: 'abyssinia', weight: 5 },
  { name: 'Awash Bank', type: 'awash', weight: 5 },
];

function getRandomMethod() {
  const roll = Math.random() * 100;
  let cum = 0;
  for (const m of PAYMENT_METHODS) {
    cum += m.weight;
    if (roll <= cum) return m;
  }
  return PAYMENT_METHODS[0];
}

// Generate realistic human amounts (steps of 25/50 for deposits, steps of 50/100/500 for withdrawals)
function getRandomAmount(min: number, max: number, type: 'deposit' | 'withdrawal'): number {
  const safeMin = Math.max(10, Math.min(min, max));
  const safeMax = Math.max(safeMin, max);

  if (type === 'deposit') {
    // Curated common Ethiopian deposit steps
    const commonValues = [50, 100, 150, 200, 250, 300, 350, 400, 500, 600, 750, 800, 1000];
    const filtered = commonValues.filter(v => v >= safeMin && v <= safeMax);
    if (filtered.length > 0 && Math.random() < 0.8) {
      return filtered[Math.floor(Math.random() * filtered.length)];
    }
    // Random rounded to nearest 25 or 50
    const step = safeMax > 500 ? 50 : 25;
    const raw = Math.floor(Math.random() * ((safeMax - safeMin) / step + 1)) * step + safeMin;
    return Math.min(safeMax, Math.max(safeMin, raw));
  } else {
    // Curated common Ethiopian withdrawal steps
    const commonValues = [100, 150, 200, 250, 300, 400, 500, 700, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000];
    const filtered = commonValues.filter(v => v >= safeMin && v <= safeMax);
    if (filtered.length > 0 && Math.random() < 0.8) {
      return filtered[Math.floor(Math.random() * filtered.length)];
    }
    const step = safeMax > 1000 ? 100 : 50;
    const raw = Math.floor(Math.random() * ((safeMax - safeMin) / step + 1)) * step + safeMin;
    return Math.min(safeMax, Math.max(safeMin, raw));
  }
}

// Helper to fetch parsed settings and items
async function getStoredData() {
  const { data: rows } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', [
      'system_proof_settings',
      'system_proof_deposits',
      'system_proof_withdrawals',
      'posted_system_deposit_ids',
      'posted_system_withdraw_ids',
      'last_system_post_deposit_at',
      'last_system_post_withdraw_at',
      'last_system_post_deposit_image',
      'last_system_post_withdraw_image',
      'channel_link',
      'channel_post_target'
    ]);

  const map = Object.fromEntries((rows || []).map(r => [r.key, r.value]));

  let customSettings: Partial<SystemProofSettings> = {};
  try {
    if (map.system_proof_settings) {
      customSettings = JSON.parse(map.system_proof_settings);
    }
  } catch {}

  const targetChannel = await resolveProofChannel(customSettings.targetChannel || map.channel_post_target || map.channel_link);

  const settings: SystemProofSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...customSettings,
    targetChannel,
    lastDepositPostAt: map.last_system_post_deposit_at || null,
    lastWithdrawPostAt: map.last_system_post_withdraw_at || null,
    lastDepositImage: map.last_system_post_deposit_image || null,
    lastWithdrawImage: map.last_system_post_withdraw_image || null,
  };

  let allDeposits: SystemProofItem[] = [];
  try {
    if (map.system_proof_deposits) {
      allDeposits = JSON.parse(map.system_proof_deposits);
      if (!Array.isArray(allDeposits)) allDeposits = [];
    }
  } catch {
    allDeposits = [];
  }

  let allWithdrawals: SystemProofItem[] = [];
  try {
    if (map.system_proof_withdrawals) {
      allWithdrawals = JSON.parse(map.system_proof_withdrawals);
      if (!Array.isArray(allWithdrawals)) allWithdrawals = [];
    }
  } catch {
    allWithdrawals = [];
  }

  let postedDepositIds: string[] = [];
  try {
    if (map.posted_system_deposit_ids) {
      postedDepositIds = JSON.parse(map.posted_system_deposit_ids);
      if (!Array.isArray(postedDepositIds)) postedDepositIds = [];
    }
  } catch {
    postedDepositIds = [];
  }

  let postedWithdrawIds: string[] = [];
  try {
    if (map.posted_system_withdraw_ids) {
      postedWithdrawIds = JSON.parse(map.posted_system_withdraw_ids);
      if (!Array.isArray(postedWithdrawIds)) postedWithdrawIds = [];
    }
  } catch {
    postedWithdrawIds = [];
  }

  return {
    settings,
    allDeposits,
    allWithdrawals,
    postedDepositIds,
    postedWithdrawIds,
  };
}

// ── GET /api/system-proofs/data ──────────────────────────────────────────────
router.get('/data', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { settings, allDeposits, allWithdrawals, postedDepositIds, postedWithdrawIds } = await getStoredData();

    // Filter unposted items
    const unpostedDeposits = allDeposits.filter(d => !postedDepositIds.includes(d.id));
    const unpostedWithdrawals = allWithdrawals.filter(w => !postedWithdrawIds.includes(w.id));

    // Stats about system player pool
    const [winnerBotsRes, totalBotsRes] = await Promise.all([
      supabase.from('system_players').select('id', { count: 'exact', head: true }).gt('total_won', 0),
      supabase.from('system_players').select('id', { count: 'exact', head: true }),
    ]);

    res.json({
      settings,
      unpostedDepositsCount: unpostedDeposits.length,
      unpostedWithdrawalsCount: unpostedWithdrawals.length,
      unpostedDeposits,
      unpostedWithdrawals,
      allDeposits,
      allWithdrawals,
      stats: {
        winnerSystemBots: winnerBotsRes.count || 0,
        totalSystemBots: totalBotsRes.count || 0,
      },
    });
  } catch (err: any) {
    console.error('Error fetching system proofs data:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch system proofs data' });
  }
});

// ── POST /api/system-proofs/generate ─────────────────────────────────────────
router.post('/generate', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const {
      type = 'deposit',
      count = 10,
      min_amount,
      max_amount,
      prefer_winners = true,
    } = req.body;

    if (type !== 'deposit' && type !== 'withdrawal') {
      res.status(400).json({ error: 'type must be deposit or withdrawal' });
      return;
    }

    const genCount = Math.max(1, Math.min(100, Number(count) || 10));

    // 1. Fetch available system players from database
    let botCandidates: Array<{ id?: string; first_name: string; total_won?: number }> = [];

    if (prefer_winners) {
      const { data: winners } = await supabase
        .from('system_players')
        .select('id, first_name, total_won')
        .gt('total_won', 0)
        .order('total_won', { ascending: false })
        .limit(genCount * 2);

      if (winners && winners.length > 0) {
        botCandidates = [...winners];
      }
    }

    // If more candidates needed, fetch general pool
    if (botCandidates.length < genCount * 2) {
      const { data: generalPool } = await supabase
        .from('system_players')
        .select('id, first_name, total_won')
        .limit(genCount * 3);

      if (generalPool && generalPool.length > 0) {
        const seen = new Set(botCandidates.map(b => b.first_name));
        for (const b of generalPool) {
          if (!seen.has(b.first_name)) {
            botCandidates.push(b);
            seen.add(b.first_name);
          }
        }
      }
    }

    // Fallback if system_players table is empty
    if (botCandidates.length < genCount) {
      const generatedNames = generateStylizedSystemNames(genCount * 2);
      const seen = new Set(botCandidates.map(b => b.first_name));
      for (const name of generatedNames) {
        if (!seen.has(name)) {
          botCandidates.push({ first_name: name, total_won: 0 });
          seen.add(name);
        }
      }
    }

    // Shuffle candidates
    botCandidates.sort(() => Math.random() - 0.5);

    const { settings, allDeposits, allWithdrawals } = await getStoredData();
    const effectiveMin = Number(min_amount) || (type === 'deposit' ? settings.depositMin : settings.withdrawMin);
    const effectiveMax = Number(max_amount) || (type === 'deposit' ? settings.depositMax : settings.withdrawMax);

    const now = Date.now();
    const newItems: SystemProofItem[] = [];

    for (let i = 0; i < genCount; i++) {
      const bot = botCandidates[i % botCandidates.length];
      const methodObj = getRandomMethod();
      const amount = getRandomAmount(effectiveMin, effectiveMax, type);

      // Stagger created_at between 5 minutes and 8 hours ago
      const offsetMs = (i * 12 + Math.floor(Math.random() * 25)) * 60 * 1000;
      const createdAtIso = new Date(now - offsetMs).toISOString();

      newItems.push({
        id: `sp_${type.charAt(0)}_${now}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        system_player_id: bot.id,
        first_name: bot.first_name,
        type: type,
        amount,
        method: methodObj.name,
        method_type: methodObj.type,
        status: 'approved',
        created_at: createdAtIso,
        updated_at: createdAtIso,
        is_winner: (bot.total_won ?? 0) > 0,
      });
    }

    const key = type === 'deposit' ? 'system_proof_deposits' : 'system_proof_withdrawals';
    const currentList = type === 'deposit' ? allDeposits : allWithdrawals;
    const updatedList = [...newItems, ...currentList].slice(0, 300); // Keep latest 300

    await supabase.from('settings').upsert({
      key,
      value: JSON.stringify(updatedList),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    res.json({
      success: true,
      generatedCount: newItems.length,
      items: newItems,
    });
  } catch (err: any) {
    console.error('Error generating system proofs:', err);
    res.status(500).json({ error: err.message || 'Failed to generate system proofs' });
  }
});

// ── POST /api/system-proofs/post (1-Click Post to Channel) ───────────────────
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
    const filename = `channel-proofs/system-${type}/${Date.now()}_proof.png`;

    let publicImageUrl = '';
    try {
      publicImageUrl = await uploadToR2(filename, buffer, 'image/png');
    } catch (uploadErr) {
      console.error('Error uploading system proof image to R2:', uploadErr);
      res.status(500).json({ error: 'Failed to upload proof image to storage' });
      return;
    }

    // 2. Resolve target channel
    const channelId = await resolveProofChannel(custom_channel);

    // 3. Prepare Telegram caption
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

    // 4. Send EXACT canvas photo to Telegram channel with Play Now button
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
      console.error('Telegram sendPhoto error for system proof:', tgData);
      res.status(502).json({
        error: `Telegram error: ${tgData.description || 'Failed to post to channel'}`,
        channelId,
        tgData
      });
      return;
    }

    // 5. Update settings with last post timestamp, cached image URL, and record posted IDs
    const nowIso = new Date().toISOString();
    const postedKey = type === 'deposit' ? 'posted_system_deposit_ids' : 'posted_system_withdraw_ids';

    const { postedDepositIds, postedWithdrawIds } = await getStoredData();
    const existingPostedIds = type === 'deposit' ? postedDepositIds : postedWithdrawIds;

    let idsToRecord: string[] = [];
    if (Array.isArray(posted_ids) && posted_ids.length > 0) {
      idsToRecord = posted_ids.map(String);
    }

    const updatedPostedIds = Array.from(new Set([...existingPostedIds, ...idsToRecord]));

    const settingsToUpdate = type === 'deposit'
      ? [
          { key: 'last_system_post_deposit_at', value: nowIso },
          { key: 'last_system_post_deposit_image', value: publicImageUrl },
          { key: postedKey, value: JSON.stringify(updatedPostedIds) },
        ]
      : [
          { key: 'last_system_post_withdraw_at', value: nowIso },
          { key: 'last_system_post_withdraw_image', value: publicImageUrl },
          { key: postedKey, value: JSON.stringify(updatedPostedIds) },
        ];

    await supabase.from('settings').upsert(settingsToUpdate, { onConflict: 'key' });

    res.json({
      success: true,
      publicImageUrl,
      postedAt: nowIso,
      channelId,
      postedCount: idsToRecord.length,
    });
  } catch (err: any) {
    console.error('Error posting system proof to channel:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/system-proofs/send-to-me (Deliver directly to Admin's chat) ─────
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
    const key = `proof-previews/system-${telegramId}/${Date.now()}_${type || 'proof'}.png`;

    let publicUrl = '';
    try {
      publicUrl = await uploadToR2(key, buffer, 'image/png');
    } catch (upErr) {
      console.error('R2 upload error for system preview:', upErr);
      res.status(500).json({ error: 'Failed to upload preview image' });
      return;
    }

    const label = type === 'deposit' ? 'System Player Deposits Proof' : 'System Player Withdrawals Proof';
    const caption =
      `🤖 <b>Official ${label} • HDASE BINGO</b>\n\n` +
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

// ── POST /api/system-proofs/reset-history ────────────────────────────────────
router.post('/reset-history', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type } = req.body;
    const keys = type === 'deposit'
      ? ['posted_system_deposit_ids']
      : type === 'withdrawal'
      ? ['posted_system_withdraw_ids']
      : ['posted_system_deposit_ids', 'posted_system_withdraw_ids'];

    const updates = keys.map(k => ({ key: k, value: '[]' }));
    await supabase.from('settings').upsert(updates, { onConflict: 'key' });

    res.json({ success: true, message: 'Posted history reset successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset history' });
  }
});

// ── POST /api/system-proofs/clear-all ────────────────────────────────────────
router.post('/clear-all', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { type } = req.body;
    if (type === 'deposit') {
      await supabase.from('settings').upsert([
        { key: 'system_proof_deposits', value: '[]' },
        { key: 'posted_system_deposit_ids', value: '[]' }
      ], { onConflict: 'key' });
    } else if (type === 'withdrawal') {
      await supabase.from('settings').upsert([
        { key: 'system_proof_withdrawals', value: '[]' },
        { key: 'posted_system_withdraw_ids', value: '[]' }
      ], { onConflict: 'key' });
    } else {
      await supabase.from('settings').upsert([
        { key: 'system_proof_deposits', value: '[]' },
        { key: 'system_proof_withdrawals', value: '[]' },
        { key: 'posted_system_deposit_ids', value: '[]' },
        { key: 'posted_system_withdraw_ids', value: '[]' }
      ], { onConflict: 'key' });
    }

    res.json({ success: true, message: 'All items cleared' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear items' });
  }
});

// ── POST /api/system-proofs/delete-item ──────────────────────────────────────
router.post('/delete-item', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { id, type } = req.body;
    if (!id || !type) {
      res.status(400).json({ error: 'id and type required' });
      return;
    }

    const { allDeposits, allWithdrawals } = await getStoredData();
    const key = type === 'deposit' ? 'system_proof_deposits' : 'system_proof_withdrawals';
    const list = type === 'deposit' ? allDeposits : allWithdrawals;
    const updated = list.filter(item => item.id !== id);

    await supabase.from('settings').upsert({
      key,
      value: JSON.stringify(updated),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete item' });
  }
});

// ── POST /api/system-proofs/mark-item ────────────────────────────────────────
router.post('/mark-item', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const { id, type, mark_as_posted } = req.body;
    if (!id || !type) {
      res.status(400).json({ error: 'id and type required' });
      return;
    }

    const { postedDepositIds, postedWithdrawIds } = await getStoredData();
    const postedKey = type === 'deposit' ? 'posted_system_deposit_ids' : 'posted_system_withdraw_ids';
    const existing = type === 'deposit' ? postedDepositIds : postedWithdrawIds;

    let updated: string[];
    if (mark_as_posted) {
      updated = Array.from(new Set([...existing, id]));
    } else {
      updated = existing.filter(x => x !== id);
    }

    await supabase.from('settings').upsert({
      key: postedKey,
      value: JSON.stringify(updated),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    res.json({ success: true, is_posted: mark_as_posted });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to mark item' });
  }
});

// ── PUT /api/system-proofs/settings ──────────────────────────────────────────
router.put('/settings', validateTelegramAuth, requireAdminOrWorker, async (req: AuthRequest, res) => {
  try {
    const {
      depositThreshold,
      depositEnabled,
      withdrawThreshold,
      withdrawEnabled,
      targetChannel,
      depositMin,
      depositMax,
      withdrawMin,
      withdrawMax,
      dailyAutoGenerate,
      dailyDeposits,
      dailyWithdrawals,
    } = req.body;

    const { settings } = await getStoredData();

    const updatedSettings: SystemProofSettings = {
      ...settings,
      depositThreshold: Math.max(1, parseInt(depositThreshold || '10', 10)),
      depositEnabled: depositEnabled !== false,
      withdrawThreshold: Math.max(1, parseInt(withdrawThreshold || '10', 10)),
      withdrawEnabled: withdrawEnabled !== false,
      targetChannel: targetChannel || settings.targetChannel,
      depositMin: Math.max(10, parseInt(depositMin || '50', 10)),
      depositMax: Math.max(50, parseInt(depositMax || '1000', 10)),
      withdrawMin: Math.max(10, parseInt(withdrawMin || '100', 10)),
      withdrawMax: Math.max(100, parseInt(withdrawMax || '5000', 10)),
      dailyAutoGenerate: dailyAutoGenerate !== false,
      dailyDeposits: Math.max(1, parseInt(dailyDeposits || '50', 10)),
      dailyWithdrawals: Math.max(1, parseInt(dailyWithdrawals || '30', 10)),
    };

    await supabase.from('settings').upsert({
      key: 'system_proof_settings',
      value: JSON.stringify(updatedSettings),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    res.json({ success: true, settings: updatedSettings });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save settings' });
  }
});

export default router;
