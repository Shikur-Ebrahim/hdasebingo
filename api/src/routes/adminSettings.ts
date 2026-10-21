import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();
router.use(validateTelegramAuth);

// Default fallback settings
export const DEFAULT_SETTINGS = {
  call_interval_ms:  3000,
  waiting_period_s:  60,
  release_time_s:    60,   // seconds before solo player's cartela is released and refunded
  min_players:       2,
  max_players:       150,
  prize_percent:     80,   // % of total stakes (for 3+ players)
  max_cartelas_per_user: 2, // max cartelas a single user can pick per game
  early_call_8_enabled: false,
  early_call_8_rewards: { '10': 100, '20': 200, '50': 500, '100': 1000 } as Record<string, number>,
  early_call_10_enabled: false,
  early_call_10_rewards: { '10': 70, '20': 210, '50': 350, '100': 700 } as Record<string, number>,
};

// Cache so BingoEngine doesn't hammer DB every tick
let _cached: typeof DEFAULT_SETTINGS | null = null;
let _cachedAt = 0;
const CACHE_TTL = 10_000; // 10 seconds

export async function getSettings(): Promise<typeof DEFAULT_SETTINGS> {
  if (_cached && Date.now() - _cachedAt < CACHE_TTL) return _cached;
  const { data } = await supabase.from('game_settings').select('*').limit(1).maybeSingle();
  if (data) {
    _cached = {
      call_interval_ms: data.call_interval_ms ?? DEFAULT_SETTINGS.call_interval_ms,
      waiting_period_s: data.waiting_period_s ?? DEFAULT_SETTINGS.waiting_period_s,
      release_time_s:   data.release_time_s   ?? DEFAULT_SETTINGS.release_time_s,
      min_players:      data.min_players      ?? DEFAULT_SETTINGS.min_players,
      max_players:      data.max_players      ?? DEFAULT_SETTINGS.max_players,
      prize_percent:    data.prize_percent     ?? DEFAULT_SETTINGS.prize_percent,
      max_cartelas_per_user: data.max_cartelas_per_user ?? DEFAULT_SETTINGS.max_cartelas_per_user,
      early_call_8_enabled:  data.early_call_8_enabled ?? DEFAULT_SETTINGS.early_call_8_enabled,
      early_call_8_rewards:  data.early_call_8_rewards ?? DEFAULT_SETTINGS.early_call_8_rewards,
      early_call_10_enabled: data.early_call_10_enabled ?? DEFAULT_SETTINGS.early_call_10_enabled,
      early_call_10_rewards: data.early_call_10_rewards ?? DEFAULT_SETTINGS.early_call_10_rewards,
    };
  } else {
    _cached = { ...DEFAULT_SETTINGS };
  }
  _cachedAt = Date.now();
  return _cached!;
}

export function invalidateSettingsCache() { _cached = null; }

// Helper: check if requester is admin via DB
async function isAdmin(telegramId: string): Promise<boolean> {
  const { data } = await supabase.from('users').select('role').eq('telegram_id', telegramId).single();
  return data?.role === 'admin';
}

// GET /api/admin/settings
router.get('/', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  if (!(await isAdmin(telegramId))) return res.status(403).json({ error: 'Forbidden' });
  const s = await getSettings();
  res.json(s);
});

// PUT /api/admin/settings
router.put('/', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  if (!(await isAdmin(telegramId))) return res.status(403).json({ error: 'Forbidden' });

  const { 
    call_interval_ms, waiting_period_s, release_time_s, min_players, max_players, prize_percent,
    max_cartelas_per_user,
    early_call_8_enabled, early_call_8_rewards,
    early_call_10_enabled, early_call_10_rewards
  } = req.body;

  // Validate ranges
  const ci  = Math.max(1000,  Math.min(30000, Number(call_interval_ms)  || DEFAULT_SETTINGS.call_interval_ms));
  const wp  = Math.max(10,    Math.min(3600,  Number(waiting_period_s)  || DEFAULT_SETTINGS.waiting_period_s));
  const rt  = Math.max(15,    Math.min(600,   Number(release_time_s)    || DEFAULT_SETTINGS.release_time_s));
  const mnp = Math.max(2,     Math.min(50,    Number(min_players)       || DEFAULT_SETTINGS.min_players));
  const mxp = Math.max(10,    Math.min(500,   Number(max_players)       || DEFAULT_SETTINGS.max_players));
  const pp  = Math.max(50,    Math.min(100,   Number(prize_percent)     || DEFAULT_SETTINGS.prize_percent));
  const mxc = Math.max(1,     Math.min(20,    Number(max_cartelas_per_user) || DEFAULT_SETTINGS.max_cartelas_per_user));

  const payload: any = {
    call_interval_ms: ci,
    waiting_period_s: wp,
    release_time_s:   rt,
    min_players:      mnp,
    max_players:      mxp,
    prize_percent:    pp,
    max_cartelas_per_user: mxc,
    early_call_8_enabled:  !!early_call_8_enabled,
    early_call_8_rewards:  early_call_8_rewards || DEFAULT_SETTINGS.early_call_8_rewards,
    early_call_10_enabled: !!early_call_10_enabled,
    early_call_10_rewards: early_call_10_rewards || DEFAULT_SETTINGS.early_call_10_rewards,
    updated_at:       new Date().toISOString(),
  };

  // Try UPDATE first, INSERT if no row exists
  const { data: existing } = await supabase.from('game_settings').select('id').eq('id', 1).maybeSingle();

  let error;
  if (existing) {
    ({ error } = await supabase.from('game_settings').update(payload).eq('id', 1));
  } else {
    ({ error } = await supabase.from('game_settings').insert({ id: 1, ...payload }));
  }

  // Fallback: if release_time_s or max_cartelas_per_user column doesn't exist yet in Supabase table
  if (error && (error.message?.includes('release_time_s') || error.message?.includes('max_cartelas_per_user'))) {
    const fallbackPayload = { ...payload };
    if (error.message?.includes('release_time_s')) delete fallbackPayload.release_time_s;
    if (error.message?.includes('max_cartelas_per_user')) delete fallbackPayload.max_cartelas_per_user;
    if (existing) {
      ({ error } = await supabase.from('game_settings').update(fallbackPayload).eq('id', 1));
    } else {
      ({ error } = await supabase.from('game_settings').insert({ id: 1, ...fallbackPayload }));
    }
  }

  if (error) return res.status(500).json({ error: error.message });

  invalidateSettingsCache();
  res.json({ ok: true, settings: { ...payload } });
});

export default router;
