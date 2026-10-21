import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Percent, Minus, RefreshCw, Trash2, Calendar, PlusCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { Navigate } from 'react-router-dom';

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
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
    if (!amt || amt <= 0) { setSubmitError('Enter a valid amount.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/audit/reduce`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ amount: amt, note: reduceNote }),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json.error || 'Failed.'); return; }
      setReduceAmount('');
      setReduceNote('');
      setShowAddForm(false);
      fetchAudit('', ''); // refresh with all time to see updated reductions
    } catch (err: any) {
      setSubmitError(err.message);
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this reduction entry?')) return;
    try {
      await fetch(`${API_URL}/admin/audit/reduce/${id}`, { method: 'DELETE', headers: getHeaders() });
      fetchAudit('', '');
    } catch (e) { console.error(e); }
  };

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 pt-6 pb-10">
        <div className="flex items-center space-x-3 mb-2">
          <Link to="/admin" className="text-white/70 hover:text-white p-1">
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="text-xl font-black text-white">Financial Audit</h1>
            <p className="text-slate-400 text-xs font-medium">Worker performance & net remaining balance</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-6 space-y-4">

        {/* Preset Buttons */}
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 pb-1 snap-x">
          {['Today', 'Yesterday', '7 Days', '1 Month', '3 Months', 'All Time'].map(p => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`snap-start whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-black transition-all ${
                activePreset === p
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >{p}</button>
          ))}
          <button
            onClick={() => { setShowCustom(v => !v); setActivePreset('Custom'); }}
            className={`snap-start whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-black flex items-center space-x-1 transition-all ${
              activePreset === 'Custom' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            <Calendar size={12} /><span>Custom</span>
          </button>
        </div>

        {/* Custom Date Picker */}
        {showCustom && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">From</label>
                <input type="date" value={customFrom} max={toDateStr(new Date())}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">To</label>
                <input type="date" value={customTo} max={toDateStr(new Date())}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400" />
              </div>
            </div>
            <button onClick={applyCustom} disabled={!customFrom || !customTo}
              className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-black text-sm disabled:opacity-40 active:scale-95 transition-transform">
              Generate Report
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
          </div>
        ) : data ? (
          <>
            {/* Financial Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Total Deposits */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 col-span-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                  <ArrowDownToLine size={20} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deposits</p>
                <p className="text-lg font-black text-slate-800">{fmt(data.totalDeposits)}</p>
                <p className="text-[10px] text-slate-400 font-medium">ETB</p>
              </div>

              {/* Total Payout */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 col-span-1">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-2">
                  <ArrowUpFromLine size={20} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actual Payout</p>
                <p className="text-lg font-black text-slate-800">{fmt(data.totalWithdrawals)}</p>
                <p className="text-[10px] text-slate-400 font-medium">ETB (after fee)</p>
              </div>

              {/* Fees Collected */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 col-span-1">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
                  <Percent size={20} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fees Collected</p>
                <p className="text-lg font-black text-amber-700">+{fmt(data.totalFees)}</p>
                <p className="text-[10px] text-slate-400 font-medium">ETB</p>
              </div>

              {/* Total Reduced */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 col-span-1">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-2">
                  <Minus size={20} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Reduced</p>
                <p className="text-lg font-black text-purple-700">-{fmt(data.totalReduced)}</p>
                <p className="text-[10px] text-slate-400 font-medium">ETB (manual)</p>
              </div>
            </div>

            {/* Net Profit Banner */}
            <div className={`rounded-2xl p-5 shadow-sm flex items-center justify-between ${
              data.netProfit >= 0 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-rose-500 to-red-500'
            }`}>
              <div>
                <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Net Profit</p>
                <p className="text-xs text-white/70 font-medium mb-1">Deposits − Actual Payouts</p>
                <p className="text-3xl font-black text-white">
                  {data.netProfit >= 0 ? '+' : ''}{fmt(data.netProfit)} ETB
                </p>
              </div>
              <TrendingUp size={40} className="text-white/20" />
            </div>

            {/* Net Remaining Banner */}
            <div className={`rounded-2xl p-5 shadow-sm flex items-center justify-between ${
              data.netRemaining >= 0 ? 'bg-gradient-to-r from-slate-700 to-slate-900' : 'bg-gradient-to-r from-orange-600 to-red-700'
            }`}>
              <div>
                <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">🏦 Net Remaining Balance</p>
                <p className="text-xs text-white/60 font-medium mb-1">Net Profit − Manual Reductions</p>
                <p className="text-3xl font-black text-white">
                  {data.netRemaining >= 0 ? '+' : ''}{fmt(data.netRemaining)} ETB
                </p>
              </div>
              <div className="text-white/20 text-5xl font-black">₿</div>
            </div>

            {/* Note */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-xs text-blue-700 font-medium">
              📊 <strong>Gross Requested:</strong> {fmt(data.grossRequested)} ETB &nbsp;|&nbsp;
              <strong>Fee Savings:</strong> +{fmt(data.totalFees)} ETB collected from users
            </div>

            {/* Add Reduction */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <button
                onClick={() => setShowAddForm(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 active:bg-slate-50"
              >
                <div className="flex items-center space-x-2">
                  <PlusCircle size={18} className="text-purple-600" />
                  <span className="font-black text-slate-700 text-sm">Add Manual Reduction</span>
                </div>
                {showAddForm ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>

              {showAddForm && (
                <form onSubmit={handleReduce} className="px-5 pb-5 space-y-3 border-t border-slate-50">
                  <p className="text-xs text-slate-500 font-medium pt-3">
                    Record an external payment or expense deducted from net profit.
                  </p>
                  {submitError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600 font-bold">
                      {submitError}
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Amount (ETB)</label>
                    <input
                      type="number"
                      value={reduceAmount}
                      onChange={e => setReduceAmount(e.target.value)}
                      placeholder="0.00"
                      min="1"
                      step="0.01"
                      className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 bg-slate-50 focus:border-purple-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Note / Reason</label>
                    <input
                      type="text"
                      value={reduceNote}
                      onChange={e => setReduceNote(e.target.value)}
                      placeholder="e.g. Worker salary, external payment..."
                      className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 font-medium text-slate-800 bg-slate-50 focus:border-purple-400 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {submitting ? 'Saving…' : '➖ Record Reduction'}
                  </button>
                </form>
              )}
            </div>

            {/* Reduction History */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 active:bg-slate-50"
              >
                <div className="flex items-center space-x-2">
                  <RefreshCw size={16} className="text-slate-500" />
                  <span className="font-black text-slate-700 text-sm">Reduction History</span>
                  <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {data.reductions.length}
                  </span>
                </div>
                {showHistory ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>

              {showHistory && (
                <div className="border-t border-slate-50">
                  {data.reductions.length === 0 ? (
                    <div className="py-8 text-center text-slate-400">
                      <Minus size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-semibold">No reductions yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {data.reductions.map(r => (
                        <div key={r.id} className="flex items-center px-5 py-3.5 space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                            <Minus size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-800 text-sm">-{fmt(r.amount)} ETB</p>
                            <p className="text-xs text-slate-500 font-medium truncate">
                              {r.note || 'No note'} • by {r.reduced_by}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              {new Date(r.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
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
          <div className="py-16 text-center text-slate-400 font-semibold">Failed to load audit data.</div>
        )}
      </div>
    </div>
  );
}
