import { useState } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  X,
  Coins,
  Check,
  AlertCircle,
  RefreshCw,
  Sparkles,
  SlidersHorizontal,
  Flame,
} from 'lucide-react';

interface Props {
  roomId: string;
  roomName: string;
  currentStakes: number[];
  onClose: () => void;
  onSuccess: (updatedStakes: number[]) => void;
}

const API = import.meta.env.VITE_API_URL || '/api';

const POPULAR_PRESETS: { label: string; stakes: [number, number, number, number] }[] = [
  { label: 'Standard (Default)', stakes: [5, 10, 20, 35] },
  { label: 'Classic Pro',        stakes: [10, 20, 50, 100] },
  { label: 'Fast Low Stakes',    stakes: [2, 5, 10, 20] },
  { label: 'Medium Pot',        stakes: [10, 25, 50, 75] },
  { label: 'VIP High Roller',    stakes: [20, 50, 100, 200] },
];

export default function AgentStakeConfigModal({
  roomName,
  currentStakes,
  onClose,
  onSuccess,
}: Props) {
  const initial = currentStakes.length === 4 ? currentStakes : [5, 10, 20, 35];
  const [s1, setS1] = useState<string>(String(initial[0] ?? 5));
  const [s2, setS2] = useState<string>(String(initial[1] ?? 10));
  const [s3, setS3] = useState<string>(String(initial[2] ?? 20));
  const [s4, setS4] = useState<string>(String(initial[3] ?? 35));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState(false);

  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    try {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred(type);
      }
    } catch {}
  };

  const handleApplyPreset = (stakes: [number, number, number, number]) => {
    triggerHaptic('medium');
    setS1(String(stakes[0]));
    setS2(String(stakes[1]));
    setS3(String(stakes[2]));
    setS4(String(stakes[3]));
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    const n1 = Math.round(Number(s1));
    const n2 = Math.round(Number(s2));
    const n3 = Math.round(Number(s3));
    const n4 = Math.round(Number(s4));

    if ([n1, n2, n3, n4].some(n => isNaN(n) || n <= 0)) {
      setError('All 4 stakes must be positive numbers greater than 0 ETB.');
      triggerHaptic('heavy');
      return;
    }

    const uniqueSet = new Set([n1, n2, n3, n4]);
    if (uniqueSet.size !== 4) {
      setError('All 4 stake options must be different unique amounts.');
      triggerHaptic('heavy');
      return;
    }

    const sorted = [n1, n2, n3, n4].sort((a, b) => a - b);

    setSaving(true);
    triggerHaptic('medium');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (WebApp?.initData) {
        headers['x-telegram-init-data'] = WebApp.initData;
      }
      const token = localStorage.getItem('pwa_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API}/player/agent-room/stakes`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ stakes: sorted }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update room stakes.');
      }

      triggerHaptic('heavy');
      setSuccessMsg(true);
      setTimeout(() => {
        onSuccess(sorted);
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Error updating room stakes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

      {/* Sheet (Light Luxury Design) */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* ── Top Header ── */}
        <div className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-5 pt-3 pb-4 text-white shrink-0 overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/20 rounded-full blur-2xl pointer-events-none" />

          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shadow-inner">
              <SlidersHorizontal size={16} className="text-white" />
            </span>
            <span className="text-[10px] font-black tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded-full">
              Dynamic Room Stakes
            </span>
          </div>

          <h3 className="text-lg font-black leading-tight">
            Manage Room Stakes • መወራረጃዎች
          </h3>
          <p className="text-white/85 text-xs font-semibold mt-0.5 truncate">
            {roomName || 'Your Agent Room'}
          </p>
        </div>

        {/* ── Scrollable Form Body ── */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Description */}
          <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-3 flex items-start gap-2.5">
            <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              Configure the <strong>4 active stake options</strong> for your room. Whenever you update, the game tables automatically adjust so players can join your configured stakes!
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5">
              <AlertCircle size={15} className="text-rose-500 shrink-0" />
              <p className="text-xs text-rose-700 font-bold">{error}</p>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-3.5 py-2.5">
              <Check size={15} className="text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-700 font-bold">
                Room stakes updated successfully!
              </p>
            </div>
          )}

          {/* ── 4 Stake Input Fields ── */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
              4 Stake Values (ETB)
            </label>

            <div className="grid grid-cols-2 gap-3">
              {/* Stake 1 */}
              <div className="bg-slate-50 border border-slate-200 focus-within:border-orange-500 focus-within:bg-white rounded-2xl p-3 transition-all">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Stake 1 (Lowest)
                </span>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={s1}
                    onChange={e => setS1(e.target.value)}
                    className="w-full text-xl font-black text-slate-900 bg-transparent outline-none"
                    placeholder="5"
                  />
                  <span className="text-xs font-bold text-slate-400">ETB</span>
                </div>
              </div>

              {/* Stake 2 */}
              <div className="bg-slate-50 border border-slate-200 focus-within:border-orange-500 focus-within:bg-white rounded-2xl p-3 transition-all">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Stake 2
                </span>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={s2}
                    onChange={e => setS2(e.target.value)}
                    className="w-full text-xl font-black text-slate-900 bg-transparent outline-none"
                    placeholder="10"
                  />
                  <span className="text-xs font-bold text-slate-400">ETB</span>
                </div>
              </div>

              {/* Stake 3 */}
              <div className="bg-slate-50 border border-slate-200 focus-within:border-orange-500 focus-within:bg-white rounded-2xl p-3 transition-all">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Stake 3
                </span>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={s3}
                    onChange={e => setS3(e.target.value)}
                    className="w-full text-xl font-black text-slate-900 bg-transparent outline-none"
                    placeholder="20"
                  />
                  <span className="text-xs font-bold text-slate-400">ETB</span>
                </div>
              </div>

              {/* Stake 4 */}
              <div className="bg-slate-50 border border-slate-200 focus-within:border-orange-500 focus-within:bg-white rounded-2xl p-3 transition-all">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Stake 4 (Highest)
                </span>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={s4}
                    onChange={e => setS4(e.target.value)}
                    className="w-full text-xl font-black text-slate-900 bg-transparent outline-none"
                    placeholder="35"
                  />
                  <span className="text-xs font-bold text-slate-400">ETB</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Quick Presets ── */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              Quick Presets • ፈጣን አማራጮች
            </span>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_PRESETS.map(preset => {
                const isSelected =
                  s1 === String(preset.stakes[0]) &&
                  s2 === String(preset.stakes[1]) &&
                  s3 === String(preset.stakes[2]) &&
                  s4 === String(preset.stakes[3]);

                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleApplyPreset(preset.stakes)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                    }`}
                  >
                    <span>{preset.label}:</span>
                    <span className="font-black text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                      {preset.stakes.join('/')} ETB
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Live Player View Preview ── */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                Player Screen Preview
              </span>
              <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                <Flame size={12} className="text-orange-500" /> 4 Live Tables
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[s1, s2, s3, s4].map((v, i) => (
                <div
                  key={i}
                  className="bg-white border border-amber-200/80 rounded-xl p-2 text-center shadow-2xs"
                >
                  <p className="text-xs font-black text-slate-900 leading-tight">
                    {v || '0'}
                  </p>
                  <p className="text-[8px] font-extrabold text-amber-700 uppercase">
                    ETB
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Fixed Footer Action ── */}
        <div className="p-4 bg-white border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || successMsg}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw size={16} className="animate-spin text-white" />
                <span>Updating Stakes...</span>
              </>
            ) : successMsg ? (
              <>
                <Check size={16} className="text-white" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Coins size={16} className="text-white" />
                <span>Update Stakes • መወራረጃዎችን አዘምን</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
