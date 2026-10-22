import { supabase } from './supabase';

export interface AgencyWithdrawalFeeSettings {
  is_enabled: boolean;
  tier1_max_amount: number; // default: 5000
  tier1_fee_percent: number; // default: 20%
  tier2_max_amount: number; // default: 25000
  tier2_fee_percent: number; // default: 15%
  tier3_max_amount: number; // default: 75000
  tier3_fee_percent: number; // default: 10%
  tier4_max_amount: number; // default: 150000
  tier4_fee_percent: number; // default: 5%
  tier5_fee_percent: number; // default: 3%
}

export const DEFAULT_AGENCY_FEE_SETTINGS: AgencyWithdrawalFeeSettings = {
  is_enabled: true,
  tier1_max_amount: 5000,
  tier1_fee_percent: 20,
  tier2_max_amount: 25000,
  tier2_fee_percent: 15,
  tier3_max_amount: 75000,
  tier3_fee_percent: 10,
  tier4_max_amount: 150000,
  tier4_fee_percent: 5,
  tier5_fee_percent: 3,
};

let _cachedSettings: AgencyWithdrawalFeeSettings | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 10_000; // 10s

export function invalidateAgencyWithdrawalFeeCache() {
  _cachedSettings = null;
  _cachedAt = 0;
}

export async function getAgencyWithdrawalFeeSettings(): Promise<AgencyWithdrawalFeeSettings> {
  if (_cachedSettings && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedSettings;
  }

  // 1. Try dedicated table first if available
  try {
    const { data, error } = await supabase
      .from('agency_withdrawal_fee_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      _cachedSettings = {
        is_enabled: data.is_enabled ?? true,
        tier1_max_amount: Number(data.tier1_max_amount ?? 5000),
        tier1_fee_percent: Number(data.tier1_fee_percent ?? 20),
        tier2_max_amount: Number(data.tier2_max_amount ?? 25000),
        tier2_fee_percent: Number(data.tier2_fee_percent ?? 15),
        tier3_max_amount: Number(data.tier3_max_amount ?? 75000),
        tier3_fee_percent: Number(data.tier3_fee_percent ?? 10),
        tier4_max_amount: Number(data.tier4_max_amount ?? 150000),
        tier4_fee_percent: Number(data.tier4_fee_percent ?? 5),
        tier5_fee_percent: Number(data.tier5_fee_percent ?? 3),
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
      .like('key', 'agency_withdrawal_fee%');

    if (rows && rows.length > 0) {
      const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
      _cachedSettings = {
        is_enabled: map.agency_withdrawal_fee_enabled !== 'false',
        tier1_max_amount: Number(map.agency_withdrawal_fee_tier1_max || 5000),
        tier1_fee_percent: Number(map.agency_withdrawal_fee_tier1_pct || 20),
        tier2_max_amount: Number(map.agency_withdrawal_fee_tier2_max || 25000),
        tier2_fee_percent: Number(map.agency_withdrawal_fee_tier2_pct || 15),
        tier3_max_amount: Number(map.agency_withdrawal_fee_tier3_max || 75000),
        tier3_fee_percent: Number(map.agency_withdrawal_fee_tier3_pct || 10),
        tier4_max_amount: Number(map.agency_withdrawal_fee_tier4_max || 150000),
        tier4_fee_percent: Number(map.agency_withdrawal_fee_tier4_pct || 5),
        tier5_fee_percent: Number(map.agency_withdrawal_fee_tier5_pct || 3),
      };
      _cachedAt = Date.now();
      return _cachedSettings;
    }
  } catch {
    // ignore
  }

  _cachedSettings = { ...DEFAULT_AGENCY_FEE_SETTINGS };
  _cachedAt = Date.now();
  return _cachedSettings;
}

export async function saveAgencyWithdrawalFeeSettings(
  settings: Partial<AgencyWithdrawalFeeSettings>
): Promise<AgencyWithdrawalFeeSettings> {
  const current = await getAgencyWithdrawalFeeSettings();

  const t1Max = Math.max(1, Number(settings.tier1_max_amount ?? current.tier1_max_amount));
  const t2Max = Math.max(t1Max, Number(settings.tier2_max_amount ?? current.tier2_max_amount));
  const t3Max = Math.max(t2Max, Number(settings.tier3_max_amount ?? current.tier3_max_amount));
  const t4Max = Math.max(t3Max, Number(settings.tier4_max_amount ?? current.tier4_max_amount));

  const merged: AgencyWithdrawalFeeSettings = {
    is_enabled: settings.is_enabled !== undefined ? !!settings.is_enabled : current.is_enabled,
    tier1_max_amount: t1Max,
    tier1_fee_percent: Math.max(0, Math.min(100, Number(settings.tier1_fee_percent ?? current.tier1_fee_percent))),
    tier2_max_amount: t2Max,
    tier2_fee_percent: Math.max(0, Math.min(100, Number(settings.tier2_fee_percent ?? current.tier2_fee_percent))),
    tier3_max_amount: t3Max,
    tier3_fee_percent: Math.max(0, Math.min(100, Number(settings.tier3_fee_percent ?? current.tier3_fee_percent))),
    tier4_max_amount: t4Max,
    tier4_fee_percent: Math.max(0, Math.min(100, Number(settings.tier4_fee_percent ?? current.tier4_fee_percent))),
    tier5_fee_percent: Math.max(0, Math.min(100, Number(settings.tier5_fee_percent ?? current.tier5_fee_percent))),
  };

  // Try saving to dedicated table if available
  try {
    const { data: existing } = await supabase
      .from('agency_withdrawal_fee_settings')
      .select('id')
      .eq('id', 1)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('agency_withdrawal_fee_settings')
        .update({ ...merged, updated_at: new Date().toISOString() })
        .eq('id', 1);
    } else {
      await supabase
        .from('agency_withdrawal_fee_settings')
        .insert({ id: 1, ...merged, updated_at: new Date().toISOString() });
    }
  } catch {
    // ignore if table not created
  }

  // Save to settings table as universal fallback
  try {
    const entries = [
      { key: 'agency_withdrawal_fee_enabled', value: String(merged.is_enabled) },
      { key: 'agency_withdrawal_fee_tier1_max', value: String(merged.tier1_max_amount) },
      { key: 'agency_withdrawal_fee_tier1_pct', value: String(merged.tier1_fee_percent) },
      { key: 'agency_withdrawal_fee_tier2_max', value: String(merged.tier2_max_amount) },
      { key: 'agency_withdrawal_fee_tier2_pct', value: String(merged.tier2_fee_percent) },
      { key: 'agency_withdrawal_fee_tier3_max', value: String(merged.tier3_max_amount) },
      { key: 'agency_withdrawal_fee_tier3_pct', value: String(merged.tier3_fee_percent) },
      { key: 'agency_withdrawal_fee_tier4_max', value: String(merged.tier4_max_amount) },
      { key: 'agency_withdrawal_fee_tier4_pct', value: String(merged.tier4_fee_percent) },
      { key: 'agency_withdrawal_fee_tier5_pct', value: String(merged.tier5_fee_percent) },
    ];
    for (const item of entries) {
      await supabase.from('settings').upsert(item, { onConflict: 'key' });
    }
  } catch (err) {
    console.error('Error saving agency fee to settings table:', err);
  }

  invalidateAgencyWithdrawalFeeCache();
  _cachedSettings = { ...merged };
  _cachedAt = Date.now();
  return merged;
}

export function calculateAgencyWithdrawalFee(
  amount: number,
  settings: AgencyWithdrawalFeeSettings = DEFAULT_AGENCY_FEE_SETTINGS
): { fee_percent: number; fee_amount: number; net_amount: number; tier_name: string } {
  const amt = Number(amount) || 0;

  if (!settings.is_enabled || amt <= 0) {
    return { fee_percent: 0, fee_amount: 0, net_amount: amt, tier_name: 'Fee Disabled / Zero' };
  }

  let feePercent = 0;
  let tierName = '';

  if (amt <= settings.tier1_max_amount) {
    feePercent = Number(settings.tier1_fee_percent) || 0;
    tierName = `Tier 1 (≤ ${settings.tier1_max_amount.toLocaleString()} ETB)`;
  } else if (amt <= settings.tier2_max_amount) {
    feePercent = Number(settings.tier2_fee_percent) || 0;
    tierName = `Tier 2 (${(settings.tier1_max_amount + 1).toLocaleString()} - ${settings.tier2_max_amount.toLocaleString()} ETB)`;
  } else if (amt <= settings.tier3_max_amount) {
    feePercent = Number(settings.tier3_fee_percent) || 0;
    tierName = `Tier 3 (${(settings.tier2_max_amount + 1).toLocaleString()} - ${settings.tier3_max_amount.toLocaleString()} ETB)`;
  } else if (amt <= settings.tier4_max_amount) {
    feePercent = Number(settings.tier4_fee_percent) || 0;
    tierName = `Tier 4 (${(settings.tier3_max_amount + 1).toLocaleString()} - ${settings.tier4_max_amount.toLocaleString()} ETB)`;
  } else {
    feePercent = Number(settings.tier5_fee_percent) || 0;
    tierName = `Tier 5 (> ${settings.tier4_max_amount.toLocaleString()} ETB)`;
  }

  const feeAmount = Math.round(((amt * feePercent) / 100) * 100) / 100;
  const netAmount = Math.max(0, Math.round((amt - feeAmount) * 100) / 100);

  return { fee_percent: feePercent, fee_amount: feeAmount, net_amount: netAmount, tier_name: tierName };
}
