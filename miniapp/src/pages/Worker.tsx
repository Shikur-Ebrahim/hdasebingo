import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { Navigate, Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, Calendar, RefreshCw, LogOut, Search, Fingerprint, X, Minus, ChevronDown, ChevronUp, ChevronRight, Sparkles, ShieldCheck } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Reduction {
  id: string;
  amount: number;
  note: string;
  reduced_by: string;
  created_at: string;
}

function toDateStr(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Worker() {
  const { user } = useGameStore();
  const [activePreset, setActivePreset] = useState('Today');
  const [stats, setStats] = useState({ totalDeposits: 0, totalWithdrawals: 0, totalFees: 0, netProfit: 0 });
  const [loading, setLoading] = useState(true);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

  // Net remaining balance (fingerprint modal)
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceData, setBalanceData] = useState<{ netRemaining: number; reductions: Reduction[] } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [showBalanceHistory, setShowBalanceHistory] = useState(true);

  // Custom date range state
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const startOf = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.toISOString();
  };

  const endOf = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy.toISOString();
  };

  const fetchReport = useCallback(async (fromIso: string, toIso: string) => {
    setLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const params = new URLSearchParams();
      if (fromIso) params.append('from', fromIso);
      if (toIso) params.append('to', toIso);

      const res = await fetch(`${API_URL}/admin/profit-report?${params}`, {
        headers: { 'x-telegram-init-data': initData }
      });
      if (res.ok) {
        setStats(await res.json());
      } else if (res.status === 404) {
        alert("Backend update required! Please run 'git pull' and 'docker compose up -d --build' on your VPS.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    setShowCustom(false);
    const now = new Date();

    let fromIso = '';
    let toIso = '';

    if (preset === 'Today') {
      fromIso = startOf(now);
      toIso = endOf(now);
    } else if (preset === 'Yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      fromIso = startOf(yest);
      toIso = endOf(yest);
    } else if (preset === '7 Days') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      fromIso = startOf(d);
      toIso = endOf(now);
    } else if (preset === '1 Month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      fromIso = startOf(d);
      toIso = endOf(now);
    } else if (preset === '3 Months') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      fromIso = startOf(d);
      toIso = endOf(now);
    } else if (preset === '6 Months') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      fromIso = startOf(d);
      toIso = endOf(now);
    } else if (preset === '1 Year') {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      fromIso = startOf(d);
      toIso = endOf(now);
    }
    // All Time: fromIso & toIso stay ''

    fetchReport(fromIso, toIso);
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    setActivePreset('Custom');
    setShowCustom(false);
    const from = new Date(customFrom);
    const to = new Date(customTo);
    fetchReport(startOf(from), endOf(to));
  };

  const fetchPendingCounts = useCallback(async () => {
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/admin/pending-counts`, {
        headers: { 'x-telegram-init-data': initData }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingDeposits(data.pendingDeposits);
        setPendingWithdrawals(data.pendingWithdrawals);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    applyPreset('Today');
    fetchPendingCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openBalanceModal = async () => {
    setShowBalanceModal(true);
    setBalanceLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/admin/audit/worker-balance`, {
        headers: { 'x-telegram-init-data': initData },
      });
      if (res.ok) setBalanceData(await res.json());
    } catch (e) { console.error(e); }
    finally { setBalanceLoading(false); }
  };

  if (!user || user.role !== 'worker') {
    return <Navigate to="/" replace />;
  }

  const perms = user.permissions || {};

  return (
    <>
    <div className="min-h-screen bg-slate-50 flex flex-col pb-36">
      {/* Header */}
      <div className="bg-orange-600 text-white px-4 py-6 rounded-b-[2rem] shadow-md relative z-10 shrink-0">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-black">Worker Profile</h1>
            <p className="text-orange-200 text-sm font-medium mt-1">
              Welcome back, {user.first_name}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {/* Top Green Fingerprint Button */}
            <button
              onClick={openBalanceModal}
              className="p-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-90 text-white rounded-full shadow-md shadow-emerald-900/30 transition-all border border-emerald-300/40 relative flex items-center justify-center"
              title="View Net Balance"
            >
              <Fingerprint size={20} className="text-white drop-shadow" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-300 rounded-full border-2 border-orange-600 animate-pulse" />
            </button>
            <Link to="/" className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
              <LogOut size={20} />
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Link
            to="/admin/deposits"
            className={`flex items-center p-3 rounded-2xl transition-all shadow-sm ${perms.deposits ? 'bg-white text-emerald-700 active:scale-95' : 'bg-white/20 text-white/50 pointer-events-none'}`}
          >
            <div className={`p-2 rounded-xl mr-3 ${perms.deposits ? 'bg-emerald-100' : 'bg-white/10'}`}>
              <ArrowDownToLine size={20} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm leading-tight">Verify</p>
              <p className={`text-[11px] ${perms.deposits ? 'text-emerald-600/70' : 'text-white/40'}`}>Deposits</p>
            </div>
            {pendingDeposits > 0 && (
              <span className="ml-auto bg-rose-500 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                {pendingDeposits}
              </span>
            )}
          </Link>

          <Link
            to="/admin/withdrawals"
            className={`flex items-center p-3 rounded-2xl transition-all shadow-sm ${perms.withdrawals ? 'bg-white text-rose-700 active:scale-95' : 'bg-white/20 text-white/50 pointer-events-none'}`}
          >
            <div className={`p-2 rounded-xl mr-3 ${perms.withdrawals ? 'bg-rose-100' : 'bg-white/10'}`}>
              <ArrowUpFromLine size={20} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm leading-tight">Verify</p>
              <p className={`text-[11px] ${perms.withdrawals ? 'text-rose-600/70' : 'text-white/40'}`}>Withdrawals</p>
            </div>
            {pendingWithdrawals > 0 && (
              <span className="ml-auto bg-rose-500 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                {pendingWithdrawals}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="flex-1 p-4 -mt-2 relative z-0">

        {/* Report Header */}
        <div className="flex items-center justify-between mb-4 mt-2">
          <h2 className="font-black text-slate-800 text-lg flex items-center space-x-2">
            <TrendingUp size={20} className="text-orange-500" />
            <span>Profit Report</span>
          </h2>
          <div className="flex items-center space-x-2">
            {loading && <RefreshCw size={16} className="text-slate-400 animate-spin" />}
            <button
              onClick={() => { setShowCustom(v => !v); setActivePreset('Custom'); }}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-[11px] font-black border transition-all ${
                activePreset === 'Custom'
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              <Calendar size={12} />
              <span>Custom</span>
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {showCustom && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Select Date Range</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">To</label>
                <input
                  type="date"
                  value={customTo}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <button
              onClick={applyCustomRange}
              disabled={!customFrom || !customTo}
              className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-black text-sm disabled:opacity-40 flex items-center justify-center space-x-2 active:scale-95 transition-transform"
            >
              <Search size={14} />
              <span>Generate Report</span>
            </button>
          </div>
        )}

        {/* Preset Buttons */}
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 pb-2 mb-4 snap-x">
          {['Today', 'Yesterday', '7 Days', '1 Month', '3 Months', '6 Months', '1 Year', 'All Time'].map(preset => (
            <button
              key={preset}
              onClick={() => applyPreset(preset)}
              className={`snap-start whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-black transition-all ${
                activePreset === preset
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <ArrowDownToLine size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Deposits</p>
              <p className="text-xl font-black text-slate-800">{stats.totalDeposits.toLocaleString()} ETB</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <ArrowUpFromLine size={24} />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Withdrawals</p>
              <p className="text-xl font-black text-slate-800">{stats.totalWithdrawals.toLocaleString()} ETB</p>
            </div>
          </div>

          <div className={`rounded-2xl p-5 shadow-sm flex items-center justify-between ${
            stats.netProfit >= 0
              ? 'bg-gradient-to-r from-orange-500 to-amber-500'
              : 'bg-gradient-to-r from-rose-500 to-red-500'
          }`}>
            <div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Net Profit</p>
              <p className="text-3xl font-black text-white">
                {stats.netProfit > 0 ? '+' : ''}{stats.netProfit.toLocaleString()} ETB
              </p>
            </div>
            <TrendingUp size={40} className="text-white/20" />
          </div>
        </div>

      </div>
    </div>

      {/* ── Fixed Bottom Floating Circular Black Fingerprint Button ── */}
      <div className="fixed bottom-6 left-0 right-0 flex items-center justify-center z-40 pointer-events-none">
        <div className="relative flex items-center justify-center pointer-events-auto">
          {/* Subtle Dark Aura Ping */}
          <div className="absolute w-24 h-24 rounded-full bg-slate-900/25 animate-ping pointer-events-none" />
          <div className="absolute w-28 h-28 rounded-full bg-black/20 blur-xl pointer-events-none" />

          {/* Outer Ring Border */}
          <div className="p-1.5 rounded-full bg-gradient-to-b from-slate-600 via-slate-800 to-black shadow-2xl shadow-black/70 backdrop-blur-md border border-slate-600/40">
            {/* Main Circular Black Button */}
            <button
              onClick={openBalanceModal}
              className="w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-gradient-to-br from-slate-900 via-zinc-950 to-black hover:from-slate-800 hover:to-zinc-900 active:scale-90 transition-all flex items-center justify-center text-white shadow-2xl border-2 border-slate-500/40 group relative overflow-hidden"
              title="View Net Remaining Balance"
            >
              {/* Subtle metallic sheen highlight */}
              <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/15 rounded-t-full pointer-events-none" />
              <Fingerprint size={42} className="text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.45)] group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Net Balance Modal (Fingerprint) ───────────────────────────── */}
      {showBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowBalanceModal(false)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl shadow-2xl pb-8 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Fingerprint size={20} />
                </div>
                <h2 className="text-lg font-black text-slate-800">Net Remaining Balance</h2>
              </div>
              <button onClick={() => setShowBalanceModal(false)} className="p-2 rounded-xl hover:bg-slate-100">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {balanceLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
              </div>
            ) : balanceData ? (
              <div className="px-5 pt-5 space-y-4">
                {/* Balance Card */}
                <div className={`rounded-3xl p-6 text-center shadow-2xl relative overflow-hidden border ${
                  balanceData.netRemaining >= 0
                    ? 'bg-gradient-to-br from-slate-950 via-zinc-900 to-black text-white border-slate-700/60 shadow-black/40'
                    : 'bg-gradient-to-br from-rose-950 via-red-950 to-black text-white border-rose-800/60 shadow-rose-950/40'
                }`}>
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner">
                    <Fingerprint size={32} />
                  </div>
                  <p className="text-slate-400 text-[11px] font-black uppercase tracking-wider mb-1">Live Net Remaining Balance</p>
                  <p className="text-4xl font-black text-white tracking-tight">
                    {balanceData.netRemaining >= 0 ? '+' : ''}
                    {balanceData.netRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white/10 text-xs font-black text-emerald-400 border border-emerald-400/30 backdrop-blur-sm">
                    ETB
                  </span>
                  <p className="text-slate-400 text-[11px] font-medium mt-3 border-t border-slate-800 pt-2">
                    Net Profit (Deposits − Actual Payouts) minus manual reductions
                  </p>
                </div>

                {/* History Toggle */}
                <button
                  onClick={() => setShowBalanceHistory(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100"
                >
                  <div className="flex items-center space-x-2">
                    <Minus size={16} className="text-purple-500" />
                    <span className="font-black text-slate-700 text-sm">Reduction History</span>
                    <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {balanceData.reductions.length}
                    </span>
                  </div>
                  {showBalanceHistory ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </button>

                {showBalanceHistory && (
                  <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                    {balanceData.reductions.length === 0 ? (
                      <div className="py-8 text-center text-slate-400">
                        <p className="text-sm font-semibold">No reductions recorded yet</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {balanceData.reductions.map(r => (
                          <div key={r.id} className="flex items-start px-4 py-3 space-x-3">
                            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                              <Minus size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-slate-800 text-sm">
                                -{r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                              </p>
                              <p className="text-xs text-slate-500 font-medium">{r.note || 'No note'}</p>
                              <p className="text-[10px] text-slate-400">
                                {new Date(r.created_at).toLocaleDateString('en-US', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                })} • by {r.reduced_by}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 font-semibold">Failed to load balance.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
