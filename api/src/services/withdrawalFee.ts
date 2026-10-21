import { supabase } from './supabase';

export interface WithdrawalFeeSettings {
  is_enabled: boolean;
  tier1_max_amount: number;
  tier1_fee_percent: number;
  tier2_max_amount: number;
  tier2_fee_percent: number;
  tier3_fee_percent: number;
}

export const DEFAULT_FEE_SETTINGS: WithdrawalFeeSettings = {
  is_enabled: true,
  tier1_max_amount: 2000,
  tier1_fee_percent: 3,
  tier2_max_amount: 10000,
  tier2_fee_percent: 2,
  tier3_fee_percent: 1,
};

let _cachedSettings: WithdrawalFeeSettings | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 10_000; // 10s

export function invalidateWithdrawalFeeCache() {
  _cachedSettings = null;
  _cachedAt = 0;
}

export async function getWithdrawalFeeSettings(): Promise<WithdrawalFeeSettings> {
  if (_cachedSettings && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedSettings;
  }

  // 1. Try dedicated table first
  try {
    const { data, error } = await supabase
      .from('withdrawal_fee_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      _cachedSettings = {
        is_enabled: data.is_enabled ?? true,
        tier1_max_amount: Number(data.tier1_max_amount ?? 2000),
        tier1_fee_percent: Number(data.tier1_fee_percent ?? 3),
        tier2_max_amount: Number(data.tier2_max_amount ?? 10000),
        tier2_fee_percent: Number(data.tier2_fee_percent ?? 2),
        tier3_fee_percent: Number(data.tier3_fee_percent ?? 1),
      };
      _cachedAt = Date.now();
      return _cachedSettings;
    }
  } catch {
    // ignore and fallback
  }

  // 2. Fallback to settings key-value table
  try {
    const { data: rows } = await supabase
      .from('settings')
      .select('*')
      .like('key', 'user_withdrawal_fee%');

    if (rows && rows.length > 0) {
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
      _cachedSettings = {
        is_enabled: map.user_withdrawal_fee_enabled !== 'false',
        tier1_max_amount: Number(map.user_withdrawal_fee_tier1_max || 2000),
        tier1_fee_percent: Number(map.user_withdrawal_fee_tier1_pct || 3),
        tier2_max_amount: Number(map.user_withdrawal_fee_tier2_max || 10000),
        tier2_fee_percent: Number(map.user_withdrawal_fee_tier2_pct || 2),
        tier3_fee_percent: Number(map.user_withdrawal_fee_tier3_pct || 1),
      };
      _cachedAt = Date.now();
      return _cachedSettings;
    }
  } catch {
    // ignore
  }

  _cachedSettings = { ...DEFAULT_FEE_SETTINGS };
  _cachedAt = Date.now();
  return _cachedSettings;
}

export async function saveWithdrawalFeeSettings(
  settings: Partial<WithdrawalFeeSettings>
): Promise<WithdrawalFeeSettings> {
  const current = await getWithdrawalFeeSettings();
  const merged: WithdrawalFeeSettings = {
    is_enabled: settings.is_enabled !== undefined ? !!settings.is_enabled : current.is_enabled,
    tier1_max_amount: Math.max(1, Number(settings.tier1_max_amount ?? current.tier1_max_amount)),
    tier1_fee_percent: Math.max(0, Math.min(100, Number(settings.tier1_fee_percent ?? current.tier1_fee_percent))),
    tier2_max_amount: Math.max(
      Math.max(1, Number(settings.tier1_max_amount ?? current.tier1_max_amount)),
      Number(settings.tier2_max_amount ?? current.tier2_max_amount)
    ),
    tier2_fee_percent: Math.max(0, Math.min(100, Number(settings.tier2_fee_percent ?? current.tier2_fee_percent))),
    tier3_fee_percent: Math.max(0, Math.min(100, Number(settings.tier3_fee_percent ?? current.tier3_fee_percent))),
  };

  // Try saving to withdrawal_fee_settings table
  try {
    const { data: existing } = await supabase.from('withdrawal_fee_settings').select('id').eq('id', 1).maybeSingle();
    if (existing) {
      await supabase.from('withdrawal_fee_settings').update({ ...merged, updated_at: new Date().toISOString() }).eq('id', 1);
    } else {
      await supabase.from('withdrawal_fee_settings').insert({ id: 1, ...merged, updated_at: new Date().toISOString() });
    }
  } catch {
    // ignore if table not created yet
  }

  // Also save to settings table as universal fallback
  try {
    const entries = [
      { key: 'user_withdrawal_fee_enabled', value: String(merged.is_enabled) },
      { key: 'user_withdrawal_fee_tier1_max', value: String(merged.tier1_max_amount) },
      { key: 'user_withdrawal_fee_tier1_pct', value: String(merged.tier1_fee_percent) },
      { key: 'user_withdrawal_fee_tier2_max', value: String(merged.tier2_max_amount) },
      { key: 'user_withdrawal_fee_tier2_pct', value: String(merged.tier2_fee_percent) },
      { key: 'user_withdrawal_fee_tier3_pct', value: String(merged.tier3_fee_percent) },
    ];
    for (const item of entries) {
      await supabase.from('settings').upsert(item, { onConflict: 'key' });
    }
  } catch (err) {
    console.error('Error saving to settings table:', err);
  }

  invalidateWithdrawalFeeCache();
  _cachedSettings = { ...merged };
  _cachedAt = Date.now();
  return merged;
}

export function calculateWithdrawalFee(
  amount: number,
  userRole: string | undefined | null,
  settings: WithdrawalFeeSettings = DEFAULT_FEE_SETTINGS
): { fee_percent: number; fee_amount: number; net_amount: number } {
  const amt = Number(amount) || 0;

  // Agent and Promoter withdrawals are strictly 0% fee exempt
  if (userRole === 'agent' || userRole === 'promoter') {
    return { fee_percent: 0, fee_amount: 0, net_amount: amt };
  }

  if (!settings.is_enabled || amt <= 0) {
    return { fee_percent: 0, fee_amount: 0, net_amount: amt };
  }

  let feePercent = 0;
  if (amt <= settings.tier1_max_amount) {
    feePercent = Number(settings.tier1_fee_percent) || 0;
  } else if (amt <= settings.tier2_max_amount) {
    feePercent = Number(settings.tier2_fee_percent) || 0;
  } else {
    feePercent = Number(settings.tier3_fee_percent) || 0;
  }

  const feeAmount = Math.round(((amt * feePercent) / 100) * 100) / 100;
  const netAmount = Math.max(0, Math.round((amt - feeAmount) * 100) / 100);

  return { fee_percent: feePercent, fee_amount: feeAmount, net_amount: netAmount };
}
