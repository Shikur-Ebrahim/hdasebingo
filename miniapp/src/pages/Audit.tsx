import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Gift, Users, Swords, Search, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Tx {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  note: string;
}

const getTypeMeta = (type: string, lang: 'en' | 'am') => {
  const meta: Record<string, { label: string; icon: JSX.Element; color: string; bg: string; badge: string; prefix: string }> = {
  deposit: { label: t[lang].fullAudit.typeDeposit, icon: <ArrowDownCircle size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700', prefix: '+' },
  withdrawal: { label: t[lang].fullAudit.typeWithdrawal, icon: <ArrowUpCircle size={14} />, color: 'text-rose-600', bg: 'bg-rose-50', badge: 'bg-rose-100 text-rose-700', prefix: '-' },
  deposit_bonus: { label: t[lang].fullAudit.typeFirstBonus, icon: <Gift size={14} />, color: 'text-violet-600', bg: 'bg-violet-50', badge: 'bg-violet-100 text-violet-700', prefix: '+' },
  second_deposit_bonus: { label: t[lang].fullAudit.typeSecondBonus, icon: <Gift size={14} />, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', badge: 'bg-fuchsia-100 text-fuchsia-700', prefix: '+' },
  invitation_reward: { label: t[lang].fullAudit.typeInvite, icon: <Users size={14} />, color: 'text-blue-600', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700', prefix: '+' },
  game_win: { label: t[lang].fullAudit.typeGameWin, icon: <Swords size={14} />, color: 'text-yellow-600', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', prefix: '+' },
  jackpot_8: { label: t[lang].fullAudit.typeJackpot8, icon: <Gift size={14} />, color: 'text-amber-600', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700', prefix: '+' },
  jackpot_10: { label: t[lang].fullAudit.typeJackpot10, icon: <Gift size={14} />, color: 'text-orange-600', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', prefix: '+' },
  game_stake: { label: t[lang].fullAudit.typeGamePlayed, icon: <Swords size={14} />, color: 'text-slate-600', bg: 'bg-slate-100', badge: 'bg-slate-200 text-slate-700', prefix: '-' },
  };
  return meta[type] || { label: type, icon: <Search size={14}/>, color: 'text-slate-600', bg: 'bg-slate-50', badge: 'bg-slate-200 text-slate-700', prefix: '' };
};

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtTime(iso: string, lang: 'en' | 'am') {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' � ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function Audit() {
  const navigate = useNavigate();
  const { language } = useGameStore();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    fetch(`${API_URL}/player/audit`, {
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }
    })
      .then(r => r.json())
      .then(data => {
        if (data.transactions) setTxs(data.transactions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? txs : txs.filter(t => t.type === filter || (filter === 'bonus' && t.type.includes('bonus')) || (filter === 'jackpot' && t.type.includes('jackpot')));

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#0a0f1e]">
      {/* HEADER */}
      <div className="bg-white dark:bg-[#111729] px-4 py-3 shadow-sm border-b border-gray-100 dark:border-white/5 flex items-center shrink-0 z-10">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-700 dark:text-white/70 active:bg-slate-200 dark:active:bg-white/10">
          <ArrowLeft size={18} />
        </button>
        <h1 className="ml-3 text-base font-black text-slate-800 dark:text-white">{t[language].fullAudit.title}</h1>
      </div>

      {/* FILTERS */}
      <div className="px-4 py-3 bg-white dark:bg-[#111729] border-b border-gray-100 dark:border-white/5 shrink-0">
        <div className="flex space-x-2 overflow-x-auto scrollbar-hide pb-1">
          {[
            { id: 'all', label: t[language].fullAudit.filterAll },
            { id: 'deposit', label: t[language].fullAudit.filterDeposits },
            { id: 'withdrawal', label: t[language].fullAudit.filterWithdrawals },
            { id: 'bonus', label: t[language].fullAudit.filterBonuses },
            { id: 'jackpot', label: t[language].fullAudit.filterJackpots },
            { id: 'game_win', label: t[language].fullAudit.filterWins },
            { id: 'game_stake', label: t[language].fullAudit.filterPlays },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                filter === f.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">{t[language].fullAudit.loading}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <Search size={32} className="text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-bold text-slate-400">{t[language].fullAudit.noTransactions}</p>
          </div>
        ) : (
          filtered.map(tx => {
            const meta = getTypeMeta(tx.type, language);
            return (
              <div key={tx.id} className="bg-white dark:bg-[#111729] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm p-3 flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center shrink-0`}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5 mb-1">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${meta.badge}`}>{meta.label}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${tx.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : tx.status === 'pending' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                      {tx.status === 'approved' ? t[language].fullAudit.statusApproved : tx.status === 'pending' ? t[language].fullAudit.statusPending : tx.status === 'rejected' ? t[language].fullAudit.statusRejected : tx.status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{tx.note}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{fmtTime(tx.created_at, language)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-black ${meta.color}`}>
                    {meta.prefix}{fmt(tx.amount)}
                  </p>
                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5">ETB</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
