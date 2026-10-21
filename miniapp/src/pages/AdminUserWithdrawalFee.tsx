import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Percent,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Calculator,
  Save,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';

interface WithdrawalFeeSettings {
  is_enabled: boolean;
  tier1_max_amount: number;
  tier1_fee_percent: number;
  tier2_max_amount: number;
  tier2_fee_percent: number;
  tier3_fee_percent: number;
}

const DEFAULT_SETTINGS: WithdrawalFeeSettings = {
  is_enabled: true,
  tier1_max_amount: 2000,
  tier1_fee_percent: 3,
  tier2_max_amount: 10000,
  tier2_fee_percent: 2,
  tier3_fee_percent: 1,
};

const API = import.meta.env.VITE_API_URL || '/api';

export default function AdminUserWithdrawalFee() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<WithdrawalFeeSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<WithdrawalFeeSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live test calculator
  const [testAmount, setTestAmount] = useState<string>('1000');

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
      const res = await fetch(`${API}/admin/withdrawal-fee`, {
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
      const res = await fetch(`${API}/admin/withdrawal-fee`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (res.ok && data?.settings) {
        setSettings(data.settings);
        setDraft(data.settings);
        setMessage({ type: 'success', text: 'Withdrawal fee settings saved and applied to database!' });
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
    } else {
      feePercent = draft.tier3_fee_percent;
      tier = `Tier 3 (> ${draft.tier2_max_amount.toLocaleString()} ETB)`;
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
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white px-4 pt-6 pb-6 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all active:scale-95"
          >
            <ArrowLeft size={16} />
            <span>Admin</span>
          </button>
          <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full">
            User Fees Only
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
            <Percent size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">
              User Withdrawal Fee
            </h1>
            <p className="text-xs text-purple-200/80 font-medium mt-0.5">
              Tiered percentage fees deducted on player withdrawals
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
                Fee Status
              </span>
              <p className="text-base font-black text-slate-800">
                {draft.is_enabled ? 'Withdrawal Fee Enabled' : 'Withdrawal Fee Disabled'}
              </p>
              <p className="text-[11px] text-slate-400">
                {draft.is_enabled
                  ? 'Fee is automatically deducted from user withdrawals'
                  : 'Users withdraw 100% of their requested amount with zero fee'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDraft({ ...draft, is_enabled: !draft.is_enabled })}
              className={`w-14 h-8 rounded-full transition-colors relative p-1 shrink-0 ${
                draft.is_enabled ? 'bg-emerald-500' : 'bg-slate-300'
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

        {/* 3 Tier Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles size={14} className="text-amber-500" />
              <span>Tiered Fee Rates</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">3 Active Tiers</span>
          </div>

          {/* Tier 1 Card */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 text-xs font-black flex items-center justify-center">
                  1
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Tier 1: Up to Threshold</h4>
                  <p className="text-[10px] text-slate-400">Default: Min withdrawal up to 2,000 ETB</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
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
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-amber-400 focus:outline-none transition-all"
                  min="1"
                  step="100"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Fee Percent (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={draft.tier1_fee_percent}
                    onChange={(e) => setDraft({ ...draft, tier1_fee_percent: Number(e.target.value) || 0 })}
                    className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-amber-400 focus:outline-none transition-all"
                    min="0"
                    max="100"
                    step="0.5"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">
                    %
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50/60 rounded-xl p-2.5 text-[11px] text-amber-900 border border-amber-100 flex items-center justify-between">
              <span>Example: 1,000 ETB withdrawal</span>
              <span className="font-black text-amber-800">
                Fee: {(1000 * draft.tier1_fee_percent) / 100} ETB (Payout: {1000 - (1000 * draft.tier1_fee_percent) / 100} ETB)
              </span>
            </div>
          </div>

          {/* Tier 2 Card */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-800 text-xs font-black flex items-center justify-center">
                  2
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Tier 2: Intermediate Range</h4>
                  <p className="text-[10px] text-slate-400">Default: 2,001 ETB up to 10,000 ETB</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
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
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-purple-400 focus:outline-none transition-all"
                  min={draft.tier1_max_amount}
                  step="500"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Fee Percent (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={draft.tier2_fee_percent}
                    onChange={(e) => setDraft({ ...draft, tier2_fee_percent: Number(e.target.value) || 0 })}
                    className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-purple-400 focus:outline-none transition-all"
                    min="0"
                    max="100"
                    step="0.5"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">
                    %
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-purple-50/60 rounded-xl p-2.5 text-[11px] text-purple-900 border border-purple-100 flex items-center justify-between">
              <span>Example: 5,000 ETB withdrawal</span>
              <span className="font-black text-purple-800">
                Fee: {(5000 * draft.tier2_fee_percent) / 100} ETB (Payout: {5000 - (5000 * draft.tier2_fee_percent) / 100} ETB)
              </span>
            </div>
          </div>

          {/* Tier 3 Card */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">
                  3
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Tier 3: High Volume</h4>
                  <p className="text-[10px] text-slate-400">
                    Applies to any amount above {draft.tier2_max_amount.toLocaleString()} ETB
                  </p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {draft.tier3_fee_percent}% Fee
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Threshold
                </label>
                <div className="px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-100 text-slate-500">
                  Above {draft.tier2_max_amount.toLocaleString()} ETB
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Fee Percent (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={draft.tier3_fee_percent}
                    onChange={(e) => setDraft({ ...draft, tier3_fee_percent: Number(e.target.value) || 0 })}
                    className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 font-black text-sm bg-slate-50 focus:bg-white focus:border-emerald-400 focus:outline-none transition-all"
                    min="0"
                    max="100"
                    step="0.5"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">
                    %
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50/60 rounded-xl p-2.5 text-[11px] text-emerald-900 border border-emerald-100 flex items-center justify-between">
              <span>Example: 20,000 ETB withdrawal</span>
              <span className="font-black text-emerald-800">
                Fee: {(20000 * draft.tier3_fee_percent) / 100} ETB (Payout: {20000 - (20000 * draft.tier3_fee_percent) / 100} ETB)
              </span>
            </div>
          </div>
        </div>

        {/* Live Simulator */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <Calculator size={18} className="text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
              Live Fee Calculator Simulator
            </h3>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1">
              Test Withdrawal Amount (ETB)
            </label>
            <input
              type="number"
              value={testAmount}
              onChange={(e) => setTestAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-black text-base focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="bg-white/10 p-2.5 rounded-2xl">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Matched Tier</span>
              <span className="text-xs font-black text-amber-300 truncate block mt-0.5">
                {testCalcResult.feePercent}% Rate
              </span>
            </div>
            <div className="bg-white/10 p-2.5 rounded-2xl">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Fee Deducted</span>
              <span className="text-xs font-black text-rose-300 block mt-0.5">
                -{testCalcResult.feeAmount.toLocaleString()} ETB
              </span>
            </div>
            <div className="bg-white/10 p-2.5 rounded-2xl">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Net Payout</span>
              <span className="text-xs font-black text-emerald-300 block mt-0.5">
                {testCalcResult.netAmount.toLocaleString()} ETB
              </span>
            </div>
          </div>
        </div>

        {/* Exemption Notice */}
        <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-4 flex items-start space-x-3 text-purple-950">
          <ShieldCheck size={20} className="text-purple-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-black">Role Exemption Guarantee</p>
            <p className="text-[11px] leading-relaxed text-purple-800">
              This tiered fee applies strictly to <strong>regular users</strong>. Official <strong>Agents</strong> and <strong>Promoters</strong> are completely exempt (<strong>0% fee</strong>) when withdrawing their balances.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center space-x-2.5">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="w-1/3 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-black text-xs hover:bg-slate-50 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-40"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-xs transition-all shadow-md shadow-orange-500/20 active:scale-98 flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Save size={15} />
            <span>{saving ? 'Saving to Database...' : 'Save & Apply Fee Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
