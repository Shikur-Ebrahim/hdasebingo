import { useState, useEffect, useCallback } from 'react';
import { Trophy, Users, Medal, RefreshCw, Crown, UserPlus } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all';
type Tab = 'players' | 'inviters';

interface Player {
  rank: number;
  telegram_id: string;
  first_name: string;
  username: string;
  wins: number;
  games?: number;
  total_prize?: number;
}

interface Inviter {
  rank: number;
  telegram_id: string;
  first_name: string;
  username: string;
  invites: number;
}



const MEDAL_COLORS = ['#F59E0B', '#94A3B8', '#D97706'];
const PODIUM_BG = [
  'from-yellow-400 to-yellow-500',
  'from-slate-400 to-slate-500',
  'from-amber-500 to-amber-600',
];
const PODIUM_HEIGHTS = ['h-24', 'h-16', 'h-12'];
const RANK_PODIUM_ORDER = [1, 0, 2]; // silver left, gold center, bronze right

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(id: string) {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-rose-500',
    'bg-orange-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500',
  ];
  let hash = 0;
  for (const c of id) hash = (hash + c.charCodeAt(0)) % colors.length;
  return colors[hash];
}

export default function Leaderboard() {
  const { user, language } = useGameStore();
  const PERIODS: { key: Period; label: string }[] = [
    { key: 'daily', label: t[language].leaderboard.periodDaily },
    { key: 'weekly', label: t[language].leaderboard.periodWeekly },
    { key: 'monthly', label: t[language].leaderboard.periodMonthly },
    { key: 'yearly', label: t[language].leaderboard.periodYearly },
    { key: 'all', label: t[language].leaderboard.periodAll },
  ];
  const [tab, setTab] = useState<Tab>('players');
  const [period, setPeriod] = useState<Period>('weekly');
  const [players, setPlayers] = useState<Player[]>([]);
  const [inviters, setInviters] = useState<Inviter[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-telegram-init-data': typeof WebApp !== 'undefined' ? WebApp.initData : '',
  }), []);

  const fetchPlayers = useCallback(async (p: Period) => {
    const res = await fetch(`${API_URL}/leaderboard/players?period=${p}`, { headers: headers() });
    if (res.ok) {
      const data = await res.json();
      setPlayers(data.players || []);
      setMyRank(data.my_rank);
    }
  }, [headers]);

  const fetchInviters = useCallback(async (p: Period) => {
    const res = await fetch(`${API_URL}/leaderboard/inviters?period=${p}`, { headers: headers() });
    if (res.ok) {
      const data = await res.json();
      setInviters(data.inviters || []);
      setMyRank(data.my_rank);
    }
  }, [headers]);

  const load = useCallback(async (t: Tab, p: Period, showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      if (t === 'players') await fetchPlayers(p);
      else await fetchInviters(p);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPlayers, fetchInviters]);

  useEffect(() => { load(tab, period); }, [tab, period]);

  const handleTab = (t: Tab) => { setTab(t); setMyRank(null); };
  const handlePeriod = (p: Period) => { setPeriod(p); };
  const handleRefresh = () => load(tab, period, true);

  const list = tab === 'players' ? players : inviters;
  const top3 = list.slice(0, 3);
  const rest = list.slice(3);
  const myTelegramId = user?.telegram_id;

  return (
    <div className="min-h-screen bg-white pb-24">

      {/* ── HEADER ── */}
      <div className="bg-white px-4 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-yellow-50 flex items-center justify-center">
              <Trophy size={20} className="text-yellow-500" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800">{t[language].leaderboard.title}</h1>
              <p className="text-xs text-slate-400 font-medium">{t[language].leaderboard.subtitle}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center active:scale-90 transition-all"
          >
            <RefreshCw size={16} className={`text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => handleTab('players')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === 'players'
                ? 'bg-white text-yellow-600 shadow-sm'
                : 'text-slate-400'
            }`}
          >
            <Trophy size={13} />
            {t[language].leaderboard.topPlayers}
            </button>
          <button
            onClick={() => handleTab('inviters')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === 'inviters'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-slate-400'
            }`}
          >
            <UserPlus size={13} />
            {t[language].leaderboard.topInviters}
            </button>
        </div>
      </div>

      {/* ── PERIOD FILTER ── */}
      <div className="px-3 pt-3 pb-1 grid grid-cols-5 gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePeriod(p.key)}
            className={`py-1.5 rounded-lg text-[10.5px] sm:text-[11px] font-bold transition-all text-center truncate ${
              period === p.key
                ? 'bg-yellow-400 text-white shadow-sm'
                : 'bg-slate-100 text-slate-400 hover:text-slate-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-sm font-medium">{t[language].leaderboard.loading}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
            <Trophy size={32} className="text-slate-300" />
          </div>
          <p className="font-black text-slate-600 text-base">{t[language].leaderboard.noData}</p>
          <p className="text-slate-400 text-sm mt-1">{t[language].leaderboard.noDataDesc}</p>
        </div>
      ) : (
        <>
          {/* ── PODIUM TOP 3 ── */}
          {top3.length >= 2 && (
            <div className="px-4 pt-5 pb-2">
              <div className="flex items-end justify-center gap-3">
                {RANK_PODIUM_ORDER.map(ri => {
                  const p = top3[ri];
                  if (!p) return <div key={ri} className="flex-1" />;
                  const isCenter = ri === 0;
                  const isMine = p.telegram_id === myTelegramId;
                  return (
                    <div key={ri} className={`flex-1 flex flex-col items-center ${isCenter ? '-mb-1' : ''}`}>
                      {/* Crown for #1 */}
                      {isCenter && (
                        <Crown size={18} className="text-yellow-400 mb-1 drop-shadow" />
                      )}
                      {/* Avatar */}
                      <div className={`relative ${isCenter ? 'w-16 h-16' : 'w-12 h-12'} rounded-full ${getAvatarColor(p.telegram_id)} flex items-center justify-center mb-1 shadow-md ${isMine ? 'ring-2 ring-yellow-400' : ''}`}>
                        <span className={`text-white font-black ${isCenter ? 'text-base' : 'text-sm'}`}>
                          {getInitials(p.first_name)}
                        </span>
                        {/* Medal badge */}
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow`}
                          style={{ background: MEDAL_COLORS[ri] }}>
                          {ri + 1}
                        </div>
                      </div>
                      {/* Name */}
                      <p className={`font-black text-slate-800 text-center leading-tight ${isCenter ? 'text-xs' : 'text-[10px]'} max-w-[70px] truncate`}>
                        {p.first_name}
                      </p>
                      <p className={`font-bold text-center mt-0.5 ${isCenter ? 'text-yellow-600 text-xs' : 'text-slate-500 text-[10px]'}`}>
                        {tab === 'players' ? `${(p as Player).wins} ${t[language].leaderboard.wins}` : `${(p as Inviter).invites} ${t[language].leaderboard.invites}`}
                      </p>
                      {/* Podium bar */}
                      <div className={`w-full mt-2 ${PODIUM_HEIGHTS[ri]} bg-gradient-to-b ${PODIUM_BG[ri]} rounded-t-xl opacity-80`} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── MY RANK BANNER ── */}
          {myRank && myRank > 3 && (
            <div className="mx-4 mb-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center">
                  <span className="text-white font-black text-xs">#{myRank}</span>
                </div>
                <span className="text-yellow-700 font-bold text-sm">{t[language].leaderboard.yourRank}</span>
              </div>
              <span className="text-yellow-600 text-xs font-bold">
                {tab === 'players'
                  ? `${players.find(p => p.telegram_id === myTelegramId)?.wins || 0} ${t[language].leaderboard.wins}`
                  : `${inviters.find(p => p.telegram_id === myTelegramId)?.invites || 0} ${t[language].leaderboard.invites}`}
              </span>
            </div>
          )}

          {/* ── FULL LIST ── */}
          <div className="mx-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center px-4 py-2.5 bg-slate-50 border-b border-gray-100">
              <span className="w-8 text-[10px] font-black text-slate-400 uppercase">{t[language].leaderboard.rank}</span>
              <span className="flex-1 text-[10px] font-black text-slate-400 uppercase">{t[language].leaderboard.player}</span>
              <span className="text-[10px] font-black text-slate-400 uppercase">
                {tab === 'players' ? t[language].leaderboard.wins : t[language].leaderboard.invites}
              </span>
            </div>

            {/* Top 3 rows */}
            {top3.map((p, i) => {
              const isMine = p.telegram_id === myTelegramId;
              return (
                <div key={p.telegram_id}
                  className={`flex items-center px-4 py-3 border-b border-gray-50 ${isMine ? 'bg-yellow-50' : ''}`}
                >
                  <div className="w-8">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white"
                      style={{ background: MEDAL_COLORS[i] }}>
                      {i + 1}
                    </div>
                  </div>
                  <div className={`w-7 h-7 rounded-full ${getAvatarColor(p.telegram_id)} flex items-center justify-center mr-2.5 shrink-0`}>
                    <span className="text-white font-black text-[10px]">{getInitials(p.first_name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${isMine ? 'text-yellow-700' : 'text-slate-800'}`}>
                      {p.first_name} {isMine && <span className="text-[10px] text-yellow-500">{t[language].leaderboard.you}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-sm ${i === 0 ? 'text-yellow-500' : 'text-slate-600'}`}>
                      {tab === 'players' ? (p as Player).wins : (p as Inviter).invites}
                    </p>
                    <p className="text-[10px] text-slate-400">{tab === 'players' ? t[language].leaderboard.wins : t[language].leaderboard.invites}</p>
                  </div>
                </div>
              );
            })}

            {/* Rest of the list */}
            {rest.map((p) => {
              const isMine = p.telegram_id === myTelegramId;
              return (
                <div key={p.telegram_id}
                  className={`flex items-center px-4 py-3 border-b border-gray-50 last:border-0 ${isMine ? 'bg-yellow-50' : ''}`}
                >
                  <div className="w-8">
                    <span className="text-xs font-black text-slate-400">#{p.rank}</span>
                  </div>
                  <div className={`w-7 h-7 rounded-full ${getAvatarColor(p.telegram_id)} flex items-center justify-center mr-2.5 shrink-0`}>
                    <span className="text-white font-black text-[10px]">{getInitials(p.first_name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${isMine ? 'text-yellow-700' : 'text-slate-800'}`}>
                      {p.first_name} {isMine && <span className="text-[10px] text-yellow-500">(You)</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-slate-600">
                      {tab === 'players' ? (p as Player).wins : (p as Inviter).invites}
                    </p>
                    <p className="text-[10px] text-slate-400">{tab === 'players' ? 'wins' : 'invites'}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="h-4" />
        </>
      )}
    </div>
  );
}
