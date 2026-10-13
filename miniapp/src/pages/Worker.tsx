import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { Navigate, Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, Calendar, RefreshCw, LogOut, Search } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function toDateStr(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Worker() {
  const { user } = useGameStore();
  const [activePreset, setActivePreset] = useState('Today');
  const [stats, setStats] = useState({ totalDeposits: 0, totalWithdrawals: 0, netProfit: 0 });
  const [loading, setLoading] = useState(true);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

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

  if (!user || user.role !== 'worker') {
    return <Navigate to="/" replace />;
  }

  const perms = user.permissions || {};

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24">
      {/* Header */}
      <div className="bg-orange-600 text-white px-4 py-6 rounded-b-[2rem] shadow-md relative z-10 shrink-0">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-black">Worker Profile</h1>
            <p className="text-orange-200 text-sm font-medium mt-1">
              Welcome back, {user.first_name}
            </p>
          </div>
          <Link to="/" className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
            <LogOut size={20} />
          </Link>
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
            <div>
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

        {/* Note */}
        <div className="bg-blue-50 text-blue-800 p-4 rounded-2xl flex items-start space-x-3 text-xs font-medium">
          <Calendar size={18} className="shrink-0 text-blue-500 mt-0.5" />
          <p>Only <strong>approved</strong> deposits and withdrawals are counted. Pending transactions are excluded.</p>
        </div>

      </div>
    </div>
  );
}
