import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  Users,
  Calendar,
  TrendingUp,
  ChevronDown,
  Percent,
  Gamepad2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Tx {
  id: string;
  type:
    | 'deposit'
    | 'withdrawal'
    | 'withdrawal_fee'
    | 'welcome_bonus'
    | 'deposit_bonus'
    | 'second_deposit_bonus'
    | 'invitation_reward'
    | 'jackpot_8'
    | 'jackpot_10';
  amount: number;
  gross_amount?: number;
  fee_amount?: number;
  status: string;
  created_at: string;
  username: string;
  telegram_id: string;
  game_id?: string;
  stake?: number;
}

interface Stats {
  totalDeposits: number;
  totalWithdrawals: number; // Actual net payout
  totalWithdrawalGross?: number;
  totalWithdrawalFees?: number;
  totalWelcomeBonus: number;
  totalDepBonus: number;
  totalSecondDepBonus: number;
  totalInvBonus: number;
  totalJackpot8: number;
  totalJackpot10: number;
  totalMatches?: number;
  totalGameProfit?: number;
}

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1, exact: true },
  { label: '7 Days', days: 7 },
  { label: '1 Month', days: 30 },
  { label: '3 Months', days: 90 },
  { label: '6 Months', days: 180 },
  { label: '1 Year', days: 365 },
  { label: 'All Time', days: -1 },
];

const TYPE_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bg: string; badge: string }
> = {
  deposit: {
    label: 'Deposit',
    icon: <ArrowDownCircle size={14} />,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  withdrawal: {
    label: 'Withdrawal (Payout)',
    icon: <ArrowUpCircle size={14} />,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    badge: 'bg-rose-100 text-rose-700',
  },
  withdrawal_fee: {
    label: 'Withdrawal Fee',
    icon: <Percent size={14} />,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    badge: 'bg-teal-100 text-teal-700',
  },
  welcome_bonus: {
    label: 'Welcome Bonus',
    icon: <Gift size={14} />,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
  },
  deposit_bonus: {
    label: '1st Deposit Bonus',
    icon: <Gift size={14} />,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    badge: 'bg-violet-100 text-violet-700',
  },
  second_deposit_bonus: {
    label: '2nd Deposit Bonus',
    icon: <Gift size={14} />,
    color: 'text-fuchsia-600',
    bg: 'bg-fuchsia-50',
    badge: 'bg-fuchsia-100 text-fuchsia-700',
  },
  invitation_reward: {
    label: 'Invite Reward',
    icon: <Users size={14} />,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
  },
  jackpot_8: {
    label: '8-Call Jackpot',
    icon: <Gift size={14} />,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
  },
  jackpot_10: {
    label: '10-Call Jackpot',
    icon: <Gift size={14} />,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
  },
};

function toDateStr(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fmt(n: number) {
  return (n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
}

export default function AdminTxReport() {
  const { user } = useGameStore();

  const startOf = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c.toISOString();
  };
  const endOf = (d: Date) => {
    const c = new Date(d);
    c.setHours(23, 59, 59, 999);
    return c.toISOString();
  };

  const [fromIso, setFromIso] = useState(() => startOf(new Date()));
  const [toIso, setToIso] = useState(() => endOf(new Date()));
  const [activePreset, setActivePreset] = useState('Today');
  const [stats, setStats] = useState<Stats>({
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalWithdrawalGross: 0,
    totalWithdrawalFees: 0,
    totalWelcomeBonus: 0,
    totalDepBonus: 0,
    totalSecondDepBonus: 0,
    totalInvBonus: 0,
    totalJackpot8: 0,
    totalJackpot10: 0,
    totalMatches: 0,
    totalGameProfit: 0,
  });
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | Tx['type']>('all');
  const [showCustom, setShowCustom] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);

  // Custom picker raw values
  const [customFromRaw, setCustomFromRaw] = useState(toDateStr(new Date()));
  const [customToRaw, setCustomToRaw] = useState(toDateStr(new Date()));

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'x-telegram-init-data': typeof WebApp !== 'undefined' ? WebApp.initData : '',
  });

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setActivePreset(preset.label);
    setShowCustom(false);
    setVisibleCount(40);
    const now = new Date();
    if (preset.days === -1) {
      // All time
      setFromIso('');
      setToIso('');
    } else if (preset.days === 0) {
      setFromIso(startOf(now));
      setToIso(endOf(now));
    } else if (preset.exact) {
      // Yesterday
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      setFromIso(startOf(y));
      setToIso(endOf(y));
    } else {
      const f = new Date(now);
      f.setDate(f.getDate() - preset.days);
      setFromIso(startOf(f));
      setToIso(endOf(now));
    }
  };

  const applyCustom = () => {
    if (!customFromRaw || !customToRaw) return;
    setActivePreset('Custom');
    setShowCustom(false);
    setVisibleCount(40);
    setFromIso(startOf(new Date(customFromRaw)));
    setToIso(endOf(new Date(customToRaw)));
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromIso) params.set('from', fromIso);
      if (toIso) params.set('to', toIso);
      const res = await fetch(`${API_URL}/admin/tx-report?${params}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || {});
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  if (!user || (user.role !== 'admin' && !(user.role === 'worker' && user.permissions?.reports))) {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied</div>;
  }

  const filtered = filter === 'all' ? transactions : transactions.filter((t) => t.type === filter);
  const visibleTxs = filtered.slice(0, visibleCount);

  // Net Profit formula using actual payout
  const netProfit =
    (stats.totalDeposits || 0) -
    (stats.totalWithdrawals || 0) -
    (stats.totalWelcomeBonus || 0) -
    (stats.totalDepBonus || 0) -
    (stats.totalSecondDepBonus || 0) -
    (stats.totalInvBonus || 0) -
    (stats.totalJackpot8 || 0) -
    (stats.totalJackpot10 || 0);

  const statCards = [
    {
      label: 'Deposits',
      value: stats.totalDeposits,
      sub: 'Total Cash In',
      icon: <ArrowDownCircle size={16} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Withdrawals (Payout)',
      value: stats.totalWithdrawals,
      sub:
        (stats.totalWithdrawalGross || 0) > stats.totalWithdrawals
          ? `Gross: ${fmt(stats.totalWithdrawalGross || 0)} ETB`
          : 'Actual Paid Out',
      icon: <ArrowUpCircle size={16} />,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
    },
    {
      label: 'Withdrawal Fees',
      value: stats.totalWithdrawalFees || 0,
      sub: 'Service Fee Retained',
      icon: <Percent size={16} />,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
    },
    {
      label: 'Match Commission',
      value: stats.totalGameProfit || 0,
      sub: `${stats.totalMatches || 0} Matches Played`,
      icon: <Gamepad2 size={16} />,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      label: 'Welcome Bonus',
      value: stats.totalWelcomeBonus || 0,
      sub: 'Signup Rewards',
      icon: <Gift size={16} />,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: '1st Dep. Bonus',
      value: stats.totalDepBonus,
      sub: 'First Deposit Bonus',
      icon: <Gift size={16} />,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: '2nd Dep. Bonus',
      value: stats.totalSecondDepBonus,
      sub: 'Second Deposit Bonus',
      icon: <Gift size={16} />,
      color: 'text-fuchsia-600',
      bg: 'bg-fuchsia-50',
    },
    {
      label: 'Invite Reward',
      value: stats.totalInvBonus,
      sub: 'Referral Rewards',
      icon: <Users size={16} />,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '8-Call Jackpot',
      value: stats.totalJackpot8,
      sub: 'Quick Win Prize',
      icon: <Gift size={16} />,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: '10-Call Jackpot',
      value: stats.totalJackpot10,
      sub: '10-Ball Win Prize',
      icon: <Gift size={16} />,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  const filterChips: { id: 'all' | Tx['type']; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdrawal', label: 'Withdrawal' },
    { id: 'withdrawal_fee', label: 'Withdrawal Fee' },
    { id: 'welcome_bonus', label: 'Welcome Bonus' },
    { id: 'deposit_bonus', label: '1st Deposit Bonus' },
    { id: 'second_deposit_bonus', label: '2nd Deposit Bonus' },
    { id: 'invitation_reward', label: 'Invite Reward' },
    { id: 'jackpot_8', label: '8-Call Jackpot' },
    { id: 'jackpot_10', label: '10-Call Jackpot' },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* HEADER */}
      <div className="bg-white px-3 py-3 shadow-sm border-b border-gray-100 flex items-center shrink-0">
        <Link
          to="/admin"
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 active:bg-slate-200"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="ml-3 flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-800">Transaction Report</h1>
          <p className="text-[11px] text-slate-500 font-medium truncate">
            {!fromIso && !toIso
              ? 'All Time Records'
              : activePreset === 'Today'
              ? `Today (${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`
              : activePreset === 'Yesterday'
              ? `Yesterday (${fromIso ? new Date(fromIso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''})`
              : `${fromIso ? new Date(fromIso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'All'} → ${toIso ? new Date(toIso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Now'}`}
          </p>
        </div>
        <button
          onClick={fetchReport}
          disabled={loading}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:bg-slate-200"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* SCROLL AREA */}
      <div className="flex-1 overflow-y-auto">
        {/* DATE PRESETS HORIZONTAL SCROLLER */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border ${
                  activePreset === p.label
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => {
                setShowCustom(!showCustom);
                if (!showCustom) setActivePreset('Custom');
              }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border flex items-center space-x-1 transition-all ${
                showCustom || activePreset === 'Custom'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <Calendar size={12} />
              <span>Custom</span>
              <ChevronDown size={12} />
            </button>
          </div>
        </div>

        {/* CUSTOM DATE RANGE PICKER */}
        {showCustom && (
          <div className="px-3 pb-2 animate-in fade-in">
            <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex items-center space-x-2">
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-slate-500 mb-0.5">From</p>
                <input
                  type="date"
                  value={customFromRaw}
                  max={toDateStr(new Date())}
                  onChange={(e) => setCustomFromRaw(e.target.value)}
                  className="w-full text-xs font-bold text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-slate-800"
                />
              </div>
              <div className="text-slate-300 font-bold">→</div>
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-slate-500 mb-0.5">To</p>
                <input
                  type="date"
                  value={customToRaw}
                  max={toDateStr(new Date())}
                  onChange={(e) => setCustomToRaw(e.target.value)}
                  className="w-full text-xs font-bold text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-slate-800"
                />
              </div>
              <button
                onClick={applyCustom}
                className="shrink-0 h-9 px-3.5 bg-slate-900 text-white text-xs font-bold rounded-xl active:scale-95 transition-all shadow-sm"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {/* STAT METRIC CARDS */}
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-2xl border border-slate-100 shadow-xs p-3 flex items-start space-x-2.5"
            >
              <div
                className={`w-8 h-8 rounded-xl ${card.bg} ${card.color} flex items-center justify-center shrink-0 mt-0.5`}
              >
                {card.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-slate-500 truncate leading-tight">
                  {card.label}
                </p>
                <p className={`text-sm font-bold ${card.color} leading-snug`}>
                  {fmt(card.value)}{' '}
                  <span className="text-[9px] font-semibold text-slate-400">ETB</span>
                </p>
                {card.sub && (
                  <p className="text-[9px] text-slate-400 font-medium truncate mt-0.5">
                    {card.sub}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* NET PROFIT BREAKDOWN BOX */}
        <div className="px-3 pb-3">
          <div className="bg-slate-900 rounded-2xl p-4 space-y-2.5 shadow-md border border-slate-800">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <TrendingUp size={16} className="text-emerald-400" />
                <span className="text-white font-bold text-xs">Net Profit Breakdown</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">True Cash & Payout Flow</span>
            </div>

            {/* Formula rows */}
            <div className="space-y-1.5 text-xs">
              {/* Deposits */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-white/80 text-[11px] font-medium">Deposits</span>
                </div>
                <span className="text-emerald-400 font-bold text-[12px]">
                  +{fmt(stats.totalDeposits)} ETB
                </span>
              </div>

              {/* Withdrawals (Actual Payout) */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span className="text-white/80 text-[11px] font-medium">
                      Withdrawals (Actual Payout)
                    </span>
                  </div>
                  {(stats.totalWithdrawalGross || 0) > 0 && (
                    <span className="text-[9px] text-slate-400 pl-3">
                      Gross: {fmt(stats.totalWithdrawalGross || 0)} · Fee: {fmt(stats.totalWithdrawalFees || 0)} ETB
                    </span>
                  )}
                </div>
                <span className="text-rose-400 font-bold text-[12px]">
                  −{fmt(stats.totalWithdrawals)} ETB
                </span>
              </div>

              {/* Withdrawal Fee Collected (Retained) */}
              {(stats.totalWithdrawalFees || 0) > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    <span className="text-teal-300 text-[11px] font-medium">
                      Withdrawal Fee (Retained Profit)
                    </span>
                  </div>
                  <span className="text-teal-300 font-bold text-[11px]">
                    +{fmt(stats.totalWithdrawalFees || 0)} ETB
                  </span>
                </div>
              )}

              {/* Game Match Platform Commission */}
              {(stats.totalGameProfit || 0) > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    <span className="text-indigo-300 text-[11px] font-medium">
                      Match Platform Profit ({stats.totalMatches || 0} matches)
                    </span>
                  </div>
                  <span className="text-indigo-300 font-bold text-[12px]">
                    +{fmt(stats.totalGameProfit || 0)} ETB
                  </span>
                </div>
              )}

              {/* Welcome Bonus */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-white/70 text-[11px] font-medium">Welcome Bonus</span>
                </div>
                <span className="text-amber-400 font-bold text-[12px]">
                  −{fmt(stats.totalWelcomeBonus || 0)} ETB
                </span>
              </div>

              {/* 1st Deposit Bonus */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <span className="text-white/70 text-[11px] font-medium">1st Deposit Bonus</span>
                </div>
                <span className="text-violet-400 font-bold text-[12px]">
                  −{fmt(stats.totalDepBonus)} ETB
                </span>
              </div>

              {/* 2nd Deposit Bonus */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />
                  <span className="text-white/70 text-[11px] font-medium">2nd Deposit Bonus</span>
                </div>
                <span className="text-fuchsia-400 font-bold text-[12px]">
                  −{fmt(stats.totalSecondDepBonus)} ETB
                </span>
              </div>

              {/* Invite Reward */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-white/70 text-[11px] font-medium">Invite Reward</span>
                </div>
                <span className="text-blue-400 font-bold text-[12px]">
                  −{fmt(stats.totalInvBonus)} ETB
                </span>
              </div>

              {/* 8-Call Jackpot */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-white/70 text-[11px] font-medium">8-Call Jackpot</span>
                </div>
                <span className="text-amber-400 font-bold text-[12px]">
                  −{fmt(stats.totalJackpot8)} ETB
                </span>
              </div>

              {/* 10-Call Jackpot */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  <span className="text-white/70 text-[11px] font-medium">10-Call Jackpot</span>
                </div>
                <span className="text-orange-400 font-bold text-[12px]">
                  −{fmt(stats.totalJackpot10)} ETB
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800 pt-2" />

            {/* Net Result */}
            <div className="flex items-center justify-between">
              <span className="text-white font-bold text-xs">= Net Cash Profit</span>
              <span
                className={`font-black text-base ${
                  netProfit >= 0 ? 'text-yellow-300' : 'text-rose-400'
                }`}
              >
                {netProfit >= 0 ? '+' : ''}
                {fmt(netProfit)} ETB
              </span>
            </div>
          </div>
        </div>

        {/* TYPE FILTER CHIPS */}
        <div className="px-3 pb-2.5 flex space-x-1.5 overflow-x-auto scrollbar-thin">
          {filterChips.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setFilter(c.id);
                setVisibleCount(40);
              }}
              className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-all border ${
                filter === c.id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* TRANSACTION LIST */}
        <div className="px-3 pb-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-2">
              <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-400">Loading transactions...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-2 bg-white rounded-2xl border border-slate-100 p-6 text-center">
              <p className="text-3xl">📭</p>
              <p className="text-xs font-bold text-slate-600">No transactions found</p>
              <p className="text-[11px] text-slate-400">Try selecting a different date range or filter.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleTxs.map((tx) => {
                const meta = TYPE_META[tx.type] || TYPE_META.deposit;
                const isWithdrawal = tx.type === 'withdrawal';
                const isFee = tx.type === 'withdrawal_fee';

                return (
                  <div
                    key={tx.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-xs px-3.5 py-3 flex items-center space-x-3"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center shrink-0`}
                    >
                      {meta.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5 mb-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${meta.badge}`}>
                          {meta.label}
                        </span>
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                            tx.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-600'
                              : tx.status === 'pending'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-rose-50 text-rose-600'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-800 truncate">@{tx.username}</p>

                      <div className="flex items-center flex-wrap gap-x-2 text-[10px] text-slate-400 font-medium mt-0.5">
                        <span>{fmtTime(tx.created_at)}</span>
                        {isWithdrawal && (tx.fee_amount || 0) > 0 && (
                          <span className="text-teal-600 font-semibold bg-teal-50 px-1.5 py-0.2 rounded-md">
                            Fee: {fmt(tx.fee_amount || 0)} · Gross: {fmt(tx.gross_amount || 0)} ETB
                          </span>
                        )}
                        {isFee && (
                          <span className="text-slate-500 font-medium">
                            Deducted from gross {fmt(tx.gross_amount || 0)} ETB
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${meta.color}`}>
                        {isWithdrawal ? '−' : '+'}{fmt(tx.amount)}
                      </p>
                      <p className="text-[9px] text-slate-400 font-semibold">
                        {isWithdrawal ? 'Payout ETB' : isFee ? 'Fee ETB' : 'ETB'}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* LOAD MORE BUTTON */}
              {filtered.length > visibleCount && (
                <div className="pt-2">
                  <button
                    onClick={() => setVisibleCount((c) => c + 40)}
                    className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold active:scale-98 transition-all shadow-xs hover:bg-slate-50"
                  >
                    Load More ({filtered.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
