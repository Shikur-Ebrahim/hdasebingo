import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Percent,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calculator,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  Layers,
  Coins,
} from 'lucide-react';

interface AgencyWithdrawalFeeSettings {
  is_enabled: boolean;
  tier1_max_amount: number;
  tier1_fee_percent: number;
  tier2_max_amount: number;
  tier2_fee_percent: number;
  tier3_max_amount: number;
  tier3_fee_percent: number;
  tier4_max_amount: number;
  tier4_fee_percent: number;
  tier5_fee_percent: number;
}

const DEFAULT_SETTINGS: AgencyWithdrawalFeeSettings = {
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

const API = import.meta.env.VITE_API_URL || '/api';

export default function AdminAgencyWithdrawalFee() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AgencyWithdrawalFeeSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<AgencyWithdrawalFeeSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live test calculator state
  const [testAmount, setTestAmount] = useState<string>('10000');

  const getHeaders = () => {
    const initData = typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData
      ? (window as any).Telegram.WebApp.initData
      : '';
    return {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData,
    };
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/agency-withdrawal-fee`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (res.ok && data?.settings) {
        setSettings(data.settings);
        setDraft(data.settings);
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to load fee settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/admin/agency-withdrawal-fee`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (res.ok && data?.settings) {
        setSettings(data.settings);
        setDraft(data.settings);
        setMessage({ type: 'success', text: 'Agency & Promoter withdrawal fee settings saved successfully!' });
        setTimeout(() => setMessage(null), 4000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error saving settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(settings);
    setMessage(null);
  };

  const applyPreset = (preset: 'default' | 'moderate' | 'flat10' | 'zero') => {
    if (preset === 'default') {
      setDraft({
        ...draft,
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
      });
    } else if (preset === 'moderate') {
      setDraft({
        ...draft,
        is_enabled: true,
        tier1_max_amount: 5000,
        tier1_fee_percent: 15,
        tier2_max_amount: 25000,
        tier2_fee_percent: 10,
        tier3_max_amount: 75000,
        tier3_fee_percent: 7,
        tier4_max_amount: 150000,
        tier4_fee_percent: 4,
        tier5_fee_percent: 2,
      });
    } else if (preset === 'flat10') {
      setDraft({
        ...draft,
        is_enabled: true,
        tier1_fee_percent: 10,
        tier2_fee_percent: 10,
        tier3_fee_percent: 10,
        tier4_fee_percent: 10,
        tier5_fee_percent: 10,
      });
    } else if (preset === 'zero') {
      setDraft({
        ...draft,
        tier1_fee_percent: 0,
        tier2_fee_percent: 0,
        tier3_fee_percent: 0,
        tier4_fee_percent: 0,
        tier5_fee_percent: 0,
      });
    }
  };

  // Calculator helper
  const calcTest = () => {
    const amt = parseFloat(testAmount) || 0;
    if (!draft.is_enabled || amt <= 0) {
      return { feePercent: 0, feeAmount: 0, netAmount: amt, tier: 'Fee Disabled / Zero' };
    }
    let feePercent = 0;
    let tier = '';
    if (amt <= draft.tier1_max_amount) {
      feePercent = draft.tier1_fee_percent;
      tier = `Tier 1 (≤ ${draft.tier1_max_amount.toLocaleString()} ETB)`;
    } else if (amt <= draft.tier2_max_amount) {
      feePercent = draft.tier2_fee_percent;
      tier = `Tier 2 (${(draft.tier1_max_amount + 1).toLocaleString()} - ${draft.tier2_max_amount.toLocaleString()} ETB)`;
    } else if (amt <= draft.tier3_max_amount) {
      feePercent = draft.tier3_fee_percent;
      tier = `Tier 3 (${(draft.tier2_max_amount + 1).toLocaleString()} - ${draft.tier3_max_amount.toLocaleString()} ETB)`;
    } else if (amt <= draft.tier4_max_amount) {
      feePercent = draft.tier4_fee_percent;
      tier = `Tier 4 (${(draft.tier3_max_amount + 1).toLocaleString()} - ${draft.tier4_max_amount.toLocaleString()} ETB)`;
    } else {
      feePercent = draft.tier5_fee_percent;
      tier = `Tier 5 (> ${draft.tier4_max_amount.toLocaleString()} ETB)`;
    }
    const feeAmount = Math.round(((amt * feePercent) / 100) * 100) / 100;
    const netAmount = Math.max(0, Math.round((amt - feeAmount) * 100) / 100);
    return { feePercent, feeAmount, netAmount, tier };
  };

  const testCalcResult = calcTest();
  const isDirty = JSON.stringify(settings) !== JSON.stringify(draft);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-950 via-indigo-900 to-slate-900 text-white px-4 pt-6 pb-6 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all active:scale-95"
          >
            <ArrowLeft size={16} />
            <span>Admin</span>
          </button>
          <span className="text-[10px] font-black uppercase tracking-wider bg-purple-500/30 text-purple-200 border border-purple-400/30 px-2.5 py-1 rounded-full">
            Agency & Promoter Only
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0 shadow-inner">
            <Coins size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">
              Agency & Promoter Server Fee
            </h1>
            <p className="text-xs text-purple-200/80 font-medium mt-0.5">
              Configurable tiered server fees deducted on agency and promoter withdrawals
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 -mt-3 space-y-4">
        {/* Status Message */}
        {message && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center space-x-2 animate-in fade-in ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Master Toggle Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
                Server Fee Status
              </span>
              <p className="text-base font-black text-slate-800">
                {draft.is_enabled ? 'Agency Server Fee Active' : 'Agency Server Fee Disabled'}
              </p>
              <p className="text-[11px] text-slate-400">
                {draft.is_enabled
                  ? 'Server fee is automatically calculated and deducted on payout'
                  : 'Agency & Promoters withdraw 100% of their earnings with 0% fee'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDraft({ ...draft, is_enabled: !draft.is_enabled })}
              className={`w-14 h-8 rounded-full transition-colors relative p-1 shrink-0 ${
                draft.is_enabled ? 'bg-purple-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                  draft.is_enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-2.5">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
            Quick Presets
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => applyPreset('default')}
              className="px-3 py-2 rounded-xl text-xs font-black bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-all active:scale-95 text-center"
            >
              Default (20%-3%)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('moderate')}
              className="px-3 py-2 rounded-xl text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all active:scale-95 text-center"
            >
              Moderate (15%-2%)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('flat10')}
              className="px-3 py-2 rounded-xl text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all active:scale-95 text-center"
            >
              Flat 10%
            </button>
            <button
              type="button"
              onClick={() => applyPreset('zero')}
              className="px-3 py-2 rounded-xl text-xs font-black bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-all active:scale-95 text-center"
            >
              0% Zero Fee
            </button>
          </div>
        </div>

        {/* 5 Tier Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <Layers size={14} className="text-purple-600" />
              <span>5 Configurable Tier Ranges</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">5 Tiers Active</span>
          </div>

          {/* Tier 1 Card */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-800 text-xs font-black flex items-center justify-center">
                  1
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Tier 1: Up to Threshold</h4>
                  <p className="text-[10px] text-slate-400">Default: Up to 5,000 ETB (20%)</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                {draft.tier1_fee_percent}% Fee
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Max Amount (ETB)
                </label>
                <input
                  type="number"
                  value={draft.tier1_max_amount}
                  onChange={(e) => setDraft({ ...draft, tier1_max_amount: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-purple-400 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Server Fee (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draft.tier1_fee_percent}
                    onChange={(e) => setDraft({ ...draft, tier1_fee_percent: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-purple-400 focus:outline-none transition-all pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-black text-slate-400">%</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Applies to withdrawals ≤ {draft.tier1_max_amount.toLocaleString()} ETB.
            </p>
          </div>

          {/* Tier 2 Card */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 text-xs font-black flex items-center justify-center">
                  2
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Tier 2: Mid Range</h4>
                  <p className="text-[10px] text-slate-400">Default: 5,001 up to 25,000 ETB (15%)</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {draft.tier2_fee_percent}% Fee
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Max Amount (ETB)
                </label>
                <input
                  type="number"
                  value={draft.tier2_max_amount}
                  onChange={(e) => setDraft({ ...draft, tier2_max_amount: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-indigo-400 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Server Fee (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draft.tier2_fee_percent}
                    onChange={(e) => setDraft({ ...draft, tier2_fee_percent: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-indigo-400 focus:outline-none transition-all pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-black text-slate-400">%</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Applies from {(draft.tier1_max_amount + 1).toLocaleString()} to {draft.tier2_max_amount.toLocaleString()} ETB.
            </p>
          </div>

          {/* Tier 3 Card */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 text-xs font-black flex items-center justify-center">
                  3
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Tier 3: Upper Mid Range</h4>
                  <p className="text-[10px] text-slate-400">Default: 25,001 up to 75,000 ETB (10%)</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {draft.tier3_fee_percent}% Fee
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Max Amount (ETB)
                </label>
                <input
                  type="number"
                  value={draft.tier3_max_amount}
                  onChange={(e) => setDraft({ ...draft, tier3_max_amount: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-blue-400 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Server Fee (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draft.tier3_fee_percent}
                    onChange={(e) => setDraft({ ...draft, tier3_fee_percent: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-blue-400 focus:outline-none transition-all pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-black text-slate-400">%</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Applies from {(draft.tier2_max_amount + 1).toLocaleString()} to {draft.tier3_max_amount.toLocaleString()} ETB.
            </p>
          </div>

          {/* Tier 4 Card */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-teal-100 text-teal-800 text-xs font-black flex items-center justify-center">
                  4
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Tier 4: High Range</h4>
                  <p className="text-[10px] text-slate-400">Default: 75,001 up to 150,000 ETB (5%)</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                {draft.tier4_fee_percent}% Fee
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Max Amount (ETB)
                </label>
                <input
                  type="number"
                  value={draft.tier4_max_amount}
                  onChange={(e) => setDraft({ ...draft, tier4_max_amount: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-teal-400 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Server Fee (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draft.tier4_fee_percent}
                    onChange={(e) => setDraft({ ...draft, tier4_fee_percent: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-teal-400 focus:outline-none transition-all pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-black text-slate-400">%</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Applies from {(draft.tier3_max_amount + 1).toLocaleString()} to {draft.tier4_max_amount.toLocaleString()} ETB.
            </p>
          </div>

          {/* Tier 5 Card (Above Top Threshold) */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">
                  5
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Tier 5: Highest Range</h4>
                  <p className="text-[10px] text-slate-400">Default: 150,001 ETB and above (3%)</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {draft.tier5_fee_percent}% Fee
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Threshold
                </label>
                <div className="px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-100 text-slate-600 flex items-center">
                  &gt; {draft.tier4_max_amount.toLocaleString()} ETB
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Server Fee (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draft.tier5_fee_percent}
                    onChange={(e) => setDraft({ ...draft, tier5_fee_percent: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-emerald-400 focus:outline-none transition-all pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-black text-slate-400">%</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Applies to all large withdrawals exceeding {draft.tier4_max_amount.toLocaleString()} ETB.
            </p>
          </div>
        </div>

        {/* Live Test Calculator Card */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                <Calculator size={16} />
              </div>
              <h3 className="text-sm font-black text-white">Live Server Fee Simulator</h3>
            </div>
            <span className="text-[10px] font-bold text-purple-200/80 bg-white/10 px-2.5 py-1 rounded-full">
              Preview Mode
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-purple-200/80 block">
              Test Withdrawal Amount (ETB)
            </label>
            <input
              type="number"
              value={testAmount}
              onChange={(e) => setTestAmount(e.target.value)}
              placeholder="e.g. 10000"
              className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-lg font-black placeholder:text-white/30 focus:outline-none focus:border-purple-400 focus:bg-white/15 transition-all"
            />
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-purple-200/80 font-bold">Active Tier:</span>
              <span className="font-black text-purple-300">{testCalcResult.tier}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-purple-200/80 font-bold">Server Fee Rate:</span>
              <span className="font-black text-white">{testCalcResult.feePercent}%</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-purple-200/80 font-bold">Server Fee Deducted:</span>
              <span className="font-black text-rose-400">
                -{testCalcResult.feeAmount.toLocaleString()} ETB
              </span>
            </div>
            <div className="pt-2 border-t border-white/10 flex justify-between items-center">
              <span className="text-xs font-black text-white">Net Payout to Partner:</span>
              <span className="text-lg font-black text-emerald-400">
                {testCalcResult.netAmount.toLocaleString()} ETB
              </span>
            </div>
          </div>
        </div>

        {/* Informational Guidance Notice */}
        <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200/80 flex items-start space-x-3 text-xs text-purple-900">
          <Info size={18} className="text-purple-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-black">How Server Fee Works for Agency & Promoters</p>
            <p className="text-[11px] text-purple-700 leading-relaxed font-medium">
              When an Agent (Room) or Promoter requests a withdrawal, their requested amount will deduct their balance,
              and the exact <strong>Server Fee</strong> calculated above is displayed to both the partner and admin.
              The Admin approves and sends the Net Payout to their verified bank.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="flex-1 py-3.5 rounded-2xl border border-slate-300 bg-white font-black text-xs text-slate-700 flex items-center justify-center space-x-2 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            <RotateCcw size={15} />
            <span>Discard Changes</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white font-black text-xs flex items-center justify-center space-x-2 shadow-lg shadow-purple-500/25 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save size={15} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
