import { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Percent, 
  Minus, RefreshCw, Trash2, Calendar, PlusCircle, ChevronDown, 
  ChevronUp, ShieldCheck, Wallet, History, AlertCircle
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface AuditData {
  totalDeposits: number;
  totalWithdrawals: number;
  grossRequested: number;
  totalFees: number;
  netProfit: number;
  totalReduced: number;
  netRemaining: number;
  reductions: Reduction[];
}

interface Reduction {
  id: string;
  amount: number;
  note: string;
  reduced_by: string;
  created_at: string;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminAudit() {
  const { user } = useGameStore();

  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState('All Time');
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Reduction form
  const [reduceAmount, setReduceAmount] = useState('');
  const [reduceNote, setReduceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  const getHeaders = () => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    return { 'Content-Type': 'application/json', 'x-telegram-init-data': initData };
  };

  const fetchAudit = useCallback(async (fromIso = '', toIso = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromIso) params.append('from', fromIso);
      if (toIso) params.append('to', toIso);
      const res = await fetch(`${API_URL}/admin/audit?${params}`, { headers: getHeaders() });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const startOf = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.toISOString(); };
  const endOf   = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c.toISOString(); };

  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    setShowCustom(false);
    const now = new Date();
    if (preset === 'Today')      { fetchAudit(startOf(now), endOf(now)); return; }
    if (preset === 'Yesterday')  { const y = new Date(now); y.setDate(y.getDate() - 1); fetchAudit(startOf(y), endOf(y)); return; }
    if (preset === '7 Days')     { const d = new Date(now); d.setDate(d.getDate() - 7); fetchAudit(startOf(d), endOf(now)); return; }
    if (preset === '1 Month')    { const d = new Date(now); d.setMonth(d.getMonth() - 1); fetchAudit(startOf(d), endOf(now)); return; }
    if (preset === '3 Months')   { const d = new Date(now); d.setMonth(d.getMonth() - 3); fetchAudit(startOf(d), endOf(now)); return; }
    fetchAudit('', ''); // All Time
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    setActivePreset('Custom');
    setShowCustom(false);
    fetchAudit(startOf(new Date(customFrom)), endOf(new Date(customTo)));
  };

  useEffect(() => { fetchAudit('', ''); }, [fetchAudit]);

  const handleReduce = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const amt = parseFloat(reduceAmount);
    if (!amt || amt <= 0) { setSubmitError('Enter a valid positive amount.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/audit/reduce`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ amount: amt, note: reduceNote }),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json.error || 'Failed to record reduction.'); return; }
      setReduceAmount('');
      setReduceNote('');
      setShowAddForm(false);
      fetchAudit('', '');
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this reduction record?')) return;
    try {
      await fetch(`${API_URL}/admin/audit/reduce/${id}`, { method: 'DELETE', headers: getHeaders() });
      fetchAudit('', '');
    } catch (e) {
      console.error(e);
    }
  };

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-16">
      
      {/* ── Top Header ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 px-4 pt-5 pb-6 border-b border-slate-800/80 sticky top-0 z-20 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link 
              to="/admin" 
              className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">FINANCIAL AUDIT</span>
              </div>
              <h1 className="text-xl font-black text-white leading-tight">Worker & Profit Audit</h1>
            </div>
          </div>

          <button
            onClick={() => fetchAudit('', '')}
            className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-emerald-400 active:scale-95 transition-all"
            title="Refresh Audit Data"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-400' : ''} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">

        {/* ── Date Preset Pills ─────────────────────────────────────────── */}
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 pb-1 snap-x">
          {['Today', 'Yesterday', '7 Days', '1 Month', '3 Months', 'All Time'].map(p => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`snap-start whitespace-nowrap px-4 py-2 rounded-2xl text-[11px] font-black transition-all ${
                activePreset === p
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25 scale-105'
                  : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => { setShowCustom(v => !v); setActivePreset('Custom'); }}
            className={`snap-start whitespace-nowrap px-4 py-2 rounded-2xl text-[11px] font-black flex items-center space-x-1 transition-all ${
              activePreset === 'Custom' 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25' 
                : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-white'
            }`}
          >
            <Calendar size={12} />
            <span>Custom</span>
          </button>
        </div>

        {/* ── Custom Date Range Picker ───────────────────────────────────── */}
        {showCustom && (
          <div className="bg-slate-800/90 rounded-3xl p-4 shadow-xl border border-slate-700/80 backdrop-blur-md">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Custom Audit Period</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">From</label>
                <input 
                  type="date" 
                  value={customFrom} 
                  max={toDateStr(new Date())}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">To</label>
                <input 
                  type="date" 
                  value={customTo} 
                  max={toDateStr(new Date())}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" 
                />
              </div>
            </div>
            <button 
              onClick={applyCustom} 
              disabled={!customFrom || !customTo}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs disabled:opacity-40 active:scale-98 transition-transform"
            >
              Apply Custom Range
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Auditing Transactions...</p>
          </div>
        ) : data ? (
          <>
            {/* ── HERO CARD: Net Remaining Balance ─────────────────────────── */}
            <div className="rounded-3xl p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 border-2 border-emerald-500/40 shadow-2xl shadow-emerald-950/40 relative overflow-hidden">
              {/* Decorative glows */}
              <div className="absolute -right-12 -top-12 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-12 -bottom-12 w-36 h-36 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between mb-3 relative z-10">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  <ShieldCheck size={12} />
                  Live Net Remaining
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {activePreset}
                </span>
              </div>

              <div className="relative z-10">
                <p className="text-4xl font-black text-white tracking-tight">
                  {data.netRemaining >= 0 ? '+' : ''}{fmt(data.netRemaining)}
                  <span className="text-base text-emerald-400 ml-1.5 font-bold">ETB</span>
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  Actual money retained after worker payouts & manual reductions
                </p>
              </div>

              {/* Quick Math Breakdown Pill */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold relative z-10">
                <div className="flex items-center space-x-1 text-emerald-400">
                  <span>Profit:</span>
                  <span>+{fmt(data.netProfit)}</span>
                </div>
                <span className="text-slate-600 font-black">−</span>
                <div className="flex items-center space-x-1 text-purple-400">
                  <span>Reductions:</span>
                  <span>-{fmt(data.totalReduced)}</span>
                </div>
                <span className="text-slate-600 font-black">=</span>
                <div className="flex items-center space-x-1 text-white">
                  <span>Remaining:</span>
                  <span className="text-emerald-300">{fmt(data.netRemaining)}</span>
                </div>
              </div>
            </div>

            {/* ── 2x2 Financial Metric Grid ─────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Total Deposits */}
              <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/60 shadow-lg relative overflow-hidden">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-2.5">
                  <ArrowDownToLine size={20} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Deposits</p>
                <p className="text-lg font-black text-white mt-0.5">{fmt(data.totalDeposits)}</p>
                <span className="text-[10px] text-emerald-400 font-bold">Approved inflows</span>
              </div>

              {/* Actual Payout */}
              <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/60 shadow-lg relative overflow-hidden">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mb-2.5">
                  <ArrowUpFromLine size={20} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Actual Payout</p>
                <p className="text-lg font-black text-white mt-0.5">{fmt(data.totalWithdrawals)}</p>
                <span className="text-[10px] text-rose-400 font-bold">Sent to users (net)</span>
              </div>

              {/* Fees Collected */}
              <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/60 shadow-lg relative overflow-hidden">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-2.5">
                  <Percent size={20} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fees Retained</p>
                <p className="text-lg font-black text-amber-300 mt-0.5">+{fmt(data.totalFees)}</p>
                <span className="text-[10px] text-amber-400/80 font-bold">Platform profit cut</span>
              </div>

              {/* Total Reduced */}
              <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/60 shadow-lg relative overflow-hidden">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mb-2.5">
                  <Minus size={20} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Reduced</p>
                <p className="text-lg font-black text-purple-300 mt-0.5">-{fmt(data.totalReduced)}</p>
                <span className="text-[10px] text-purple-400/80 font-bold">{data.reductions.length} recorded</span>
              </div>
            </div>

            {/* ── Net Profit Comparison Banner ─────────────────────────────── */}
            <div className={`rounded-3xl p-5 border shadow-xl flex items-center justify-between ${
              data.netProfit >= 0
                ? 'bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border-emerald-500/30'
                : 'bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 border-rose-500/30'
            }`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                  Net Profit (Deposits − Payouts)
                </p>
                <p className="text-2xl font-black text-white">
                  {data.netProfit >= 0 ? '+' : ''}{fmt(data.netProfit)} <span className="text-sm text-slate-400">ETB</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Gross requested by users: <strong className="text-slate-200">{fmt(data.grossRequested)} ETB</strong>
                </p>
              </div>
              <TrendingUp size={36} className={data.netProfit >= 0 ? 'text-emerald-500/30' : 'text-rose-500/30'} />
            </div>

            {/* ── Add Manual Reduction Form (Collapsible) ───────────────────── */}
            <div className="bg-slate-800/90 rounded-3xl shadow-xl border border-slate-700/70 overflow-hidden">
              <button
                onClick={() => setShowAddForm(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 active:bg-slate-800 transition-colors"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <PlusCircle size={18} />
                  </div>
                  <div className="text-left">
                    <p className="font-black text-white text-sm">Add Manual Reduction</p>
                    <p className="text-[10px] text-slate-400 font-medium">Deduct salary, owner draw or external expense</p>
                  </div>
                </div>
                {showAddForm ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
              </button>

              {showAddForm && (
                <form onSubmit={handleReduce} className="px-5 pb-5 pt-2 space-y-3.5 border-t border-slate-700/60">
                  {submitError && (
                    <div className="flex items-center space-x-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-300 font-bold">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* Preset Quick Amount Chips */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Quick Amounts</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[500, 1000, 3000, 5000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setReduceAmount(String(amt))}
                          className="py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-black text-purple-300 hover:border-purple-400 active:scale-95 transition-all"
                        >
                          +{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Reduction Amount (ETB)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-purple-400">ETB</span>
                      <input
                        type="number"
                        value={reduceAmount}
                        onChange={e => setReduceAmount(e.target.value)}
                        placeholder="0.00"
                        min="1"
                        step="0.01"
                        className="w-full pl-14 pr-4 py-3.5 rounded-2xl bg-slate-900 border border-slate-700 focus:border-purple-400 focus:outline-none text-white font-black text-base"
                        required
                      />
                    </div>
                  </div>

                  {/* Reason Input */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Reason / Note</label>
                    <input
                      type="text"
                      value={reduceNote}
                      onChange={e => setReduceNote(e.target.value)}
                      placeholder="e.g. Worker salary payout, external settlement..."
                      className="w-full px-4 py-3.5 rounded-2xl bg-slate-900 border border-slate-700 focus:border-purple-400 focus:outline-none text-white text-xs font-semibold"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-sm active:scale-98 transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50"
                  >
                    {submitting ? 'Recording Reduction…' : '➖ Record Reduction Entry'}
                  </button>
                </form>
              )}
            </div>

            {/* ── Reduction History Feed (Collapsible) ───────────────────────── */}
            <div className="bg-slate-800/90 rounded-3xl shadow-xl border border-slate-700/70 overflow-hidden">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 active:bg-slate-800 transition-colors"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <History size={18} />
                  </div>
                  <div className="text-left">
                    <p className="font-black text-white text-sm">Reduction History</p>
                    <p className="text-[10px] text-slate-400 font-medium">All manual deductions recorded by admin</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    {data.reductions.length}
                  </span>
                  {showHistory ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </div>
              </button>

              {showHistory && (
                <div className="border-t border-slate-700/60">
                  {data.reductions.length === 0 ? (
                    <div className="py-10 text-center text-slate-500">
                      <Wallet size={36} className="mx-auto mb-2 opacity-30" />
                      <p className="text-xs font-bold uppercase tracking-wider">No Reductions Recorded</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Use "Add Manual Reduction" above to record one.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700/60 max-h-96 overflow-y-auto">
                      {data.reductions.map(r => (
                        <div key={r.id} className="flex items-center px-5 py-3.5 space-x-3 hover:bg-slate-800/50 transition-colors">
                          <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center shrink-0">
                            <Minus size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-black text-white text-sm">
                                -{fmt(r.amount)} <span className="text-xs text-purple-300">ETB</span>
                              </p>
                              <span className="text-[10px] text-slate-500 font-semibold">
                                {new Date(r.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 font-medium truncate mt-0.5">
                              {r.note || 'No note recorded'}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              by <strong className="text-slate-300">{r.reduced_by}</strong> • {new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-2.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all"
                            title="Delete this reduction"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </>
        ) : (
          <div className="py-20 text-center text-slate-400 font-bold">
            Failed to load audit data.
          </div>
        )}

      </div>
    </div>
  );
}
