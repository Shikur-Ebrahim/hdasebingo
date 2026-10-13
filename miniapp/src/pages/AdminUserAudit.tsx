import { useState } from 'react';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Gift, Users, Swords, Search, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Tx {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  note: string;
}

const TYPE_META: Record<string, { label: string; icon: JSX.Element; color: string; bg: string; badge: string; prefix: string }> = {
  deposit: { label: 'Deposit', icon: <ArrowDownCircle size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700', prefix: '+' },
  withdrawal: { label: 'Withdrawal', icon: <ArrowUpCircle size={14} />, color: 'text-rose-600', bg: 'bg-rose-50', badge: 'bg-rose-100 text-rose-700', prefix: '-' },
  deposit_bonus: { label: '1st Dep. Bonus', icon: <Gift size={14} />, color: 'text-violet-600', bg: 'bg-violet-50', badge: 'bg-violet-100 text-violet-700', prefix: '+' },
  second_deposit_bonus: { label: '2nd Dep. Bonus', icon: <Gift size={14} />, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', badge: 'bg-fuchsia-100 text-fuchsia-700', prefix: '+' },
  invitation_reward: { label: 'Invite Reward', icon: <Users size={14} />, color: 'text-blue-600', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700', prefix: '+' },
  game_win: { label: 'Game Win', icon: <Swords size={14} />, color: 'text-yellow-600', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', prefix: '+' },
  jackpot_8: { label: '8-Call Jackpot', icon: <Gift size={14} />, color: 'text-amber-600', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700', prefix: '+' },
  jackpot_10: { label: '10-Call Jackpot', icon: <Gift size={14} />, color: 'text-orange-600', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', prefix: '+' },
  game_stake: { label: 'Game Played', icon: <Swords size={14} />, color: 'text-slate-600', bg: 'bg-slate-100', badge: 'bg-slate-200 text-slate-700', prefix: '-' },
};

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function AdminUserAudit() {
  const navigate = useNavigate();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [telegramId, setTelegramId] = useState('');
  const [userInfo, setUserInfo] = useState<any>(null);

  const handleSearch = () => {
    if (!telegramId) return;
    setLoading(true);
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    fetch(`${API_URL}/admin/user-audit/${telegramId}`, {
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }
    })
      .then(r => r.json())
      .then(data => {
        if (data.transactions) setTxs(data.transactions);
        if (data.user) setUserInfo(data.user);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const filtered = filter === 'all' ? txs : txs.filter(t => t.type === filter || (filter === 'bonus' && t.type.includes('bonus')) || (filter === 'jackpot' && t.type.includes('jackpot')));

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#0a0f1e]">
      {/* HEADER */}
      <div className="bg-white dark:bg-[#111729] px-4 py-3 shadow-sm border-b border-gray-100 dark:border-white/5 flex items-center shrink-0 z-10">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-700 dark:text-white/70 active:bg-slate-200 dark:active:bg-white/10">
          <ArrowLeft size={18} />
        </button>
        <h1 className="ml-3 text-base font-black text-slate-800 dark:text-white">User Audit Ledger</h1>
      </div>

      {/* SEARCH BAR */}
      <div className="px-4 py-3 bg-white dark:bg-[#111729] border-b border-gray-100 dark:border-white/5 shrink-0">
        <div className="flex items-center space-x-2">
          <input 
            type="text" 
            placeholder="Telegram ID" 
            value={telegramId}
            onChange={e => setTelegramId(e.target.value)}
            className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
          />
          <button 
            onClick={handleSearch} 
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-black active:scale-95 transition-transform disabled:opacity-50"
          >
            Search
          </button>
        </div>
      </div>

      {/* USER INFO */}
      {userInfo && (
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-500/10 flex items-center shrink-0">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center mr-3">
            <User size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-slate-800 dark:text-white">{userInfo.first_name} {userInfo.username ? `@${userInfo.username}` : ''}</p>
            <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Balance: {fmt(userInfo.balance)} ETB</p>
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="px-4 py-3 bg-white dark:bg-[#111729] border-b border-gray-100 dark:border-white/5 shrink-0">
        <div className="flex space-x-2 overflow-x-auto scrollbar-hide pb-1">
          {[
            { id: 'all', label: 'All' },
            { id: 'deposit', label: 'Deposits' },
            { id: 'withdrawal', label: 'Withdrawals' },
            { id: 'bonus', label: 'Bonuses' },
            { id: 'jackpot', label: 'Jackpots' },
            { id: 'game_win', label: 'Wins' },
            { id: 'game_stake', label: 'Plays' },
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
            <p className="text-xs font-bold text-slate-400">Loading ledger...</p>
          </div>
        ) : filtered.length === 0 && telegramId ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <Search size={32} className="text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-bold text-slate-400">No transactions found</p>
          </div>
        ) : !telegramId ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <User size={32} className="text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-bold text-slate-400">Enter a Telegram ID to view ledger</p>
          </div>
        ) : (
          filtered.map(tx => {
            const meta = TYPE_META[tx.type] || { label: tx.type, icon: <Search size={14}/>, color: 'text-slate-600', bg: 'bg-slate-50', badge: 'bg-slate-200 text-slate-700', prefix: '' };
            return (
              <div key={tx.id} className="bg-white dark:bg-[#111729] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm p-3 flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center shrink-0`}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5 mb-1">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${meta.badge}`}>{meta.label}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${tx.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : tx.status === 'pending' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                      {tx.status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{tx.note}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{fmtTime(tx.created_at)}</p>
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
