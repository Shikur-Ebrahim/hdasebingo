import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Trophy, Target, TrendingUp, Coins, Gamepad2, Crown, XCircle, Clock, RefreshCw, ChevronDown, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface GameRecord {
  game_id: string;
  game_number: string | null;
  stake: number;
  status: string;
  prize_pool: number;
  cartela_number: number | null;
  created_at: string | null;
  finished_at: string | null;
  start_at: string | null;
  is_winner: boolean;
  winner_name: string | null;
  winner_prize: number;
  total_calls: number;
}

interface Stats {
  total: number;
  wins: number;
  total_wagered: number;
  total_won: number;
  win_rate: number;
}

const STAKE_COLORS: Record<number, string> = {
  10:  'from-blue-400 to-blue-600',
  20:  'from-green-400 to-green-600',
  50:  'from-purple-400 to-purple-600',
  100: 'from-rose-400 to-rose-600',
};

function getStakeGradient(stake: number): string {
  return STAKE_COLORS[stake] || 'from-slate-400 to-slate-600';
}

function timeAgo(dateStr: string | null, lang: 'en' | 'am'): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return t[lang].gamesReport.daysAgo.replace('{d}', d.toString());
  if (h > 0) return t[lang].gamesReport.hoursAgo.replace('{h}', h.toString());
  if (m > 0) return t[lang].gamesReport.minutesAgo.replace('{m}', m.toString());
  return t[lang].gamesReport.justNow;
}

export default function GamesReport() {
  const navigate = useNavigate();
  const { language } = useGameStore();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-telegram-init-data': typeof WebApp !== 'undefined' ? WebApp.initData : '',
  }), []);

  const fetchReport = useCallback(async (p: number, replace = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch(`${API_URL}/games-report?page=${p}`, { headers: headers() });
      if (!res.ok) return;
      const data = await res.json();
      setGames(prev => replace ? (data.games || []) : [...prev, ...(data.games || [])]);
      setStats(data.stats);
      setHasMore(data.has_more);
      setPage(p);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [headers]);

  useEffect(() => { fetchReport(1, true); }, []);

  const filtered = games.filter(g => {
    if (filter === 'wins') return g.is_winner;
    if (filter === 'losses') return !g.is_winner && g.status === 'finished';
    return true;
  });

  const winsCount = games.filter(g => g.is_winner).length;
  const lossesCount = games.filter(g => !g.is_winner && g.status === 'finished').length;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">

      {/* ── HEADER ── */}
      <div className="bg-white sticky top-0 z-10 px-4 pt-5 pb-4 border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 transition-all shrink-0">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black text-slate-800 leading-tight">{t[language].gamesReport.title}</h1>
            <p className="text-xs text-slate-400">{t[language].gamesReport.subtitle}</p>
          </div>
          <button onClick={() => fetchReport(1, true)}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 transition-all shrink-0">
            <RefreshCw size={15} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400 font-medium text-sm">{t[language].gamesReport.loading}</p>
        </div>
      ) : (
        <>
          {/* ── STATS ── */}
          {stats && (
            <div className="px-4 pt-4 pb-3 space-y-3">

              {/* Big wins + win rate row */}
              <div className="flex gap-3">
                <div className="flex-1 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-2xl p-4 shadow-sm">
                  <p className="text-white/80 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Trophy size={10} /> {t[language].gamesReport.totalWins}
                  </p>
                  <p className="text-4xl font-black text-white leading-none">{stats.wins}</p>
                  <p className="text-white/70 text-[10px] mt-1">{t[language].gamesReport.totalGames.replace('{total}', stats.total.toString())}</p>
                </div>
                <div className="flex-1 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl p-4 shadow-sm">
                  <p className="text-white/80 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                    <TrendingUp size={10} /> {t[language].gamesReport.winRate}
                  </p>
                  <p className="text-4xl font-black text-white leading-none">{stats.win_rate}<span className="text-lg">%</span></p>
                  <p className="text-white/70 text-[10px] mt-1">{t[language].gamesReport.ofFinished}</p>
                </div>
              </div>

              {/* Bottom row */}
              <div className="flex gap-3">
                <div className="flex-1 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Coins size={10} /> {t[language].gamesReport.played}
                  </p>
                  <p className="text-2xl font-black text-slate-800 leading-none">{stats.total_wagered.toLocaleString()}</p>
                  <p className="text-slate-400 text-[10px] mt-1">{t[language].gamesReport.wagered}</p>
                </div>
                <div className="flex-1 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Target size={10} /> {t[language].gamesReport.won}
                  </p>
                  <p className="text-2xl font-black text-emerald-600 leading-none">{stats.total_won.toLocaleString()}</p>
                  <p className="text-slate-400 text-[10px] mt-1">{t[language].gamesReport.prizeTotal}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── FILTER ── */}
          <div className="px-4 pb-3 flex gap-2">
            <button onClick={() => setFilter('all')}
              className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all ${filter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-400 border border-gray-100'}`}>
              {t[language].gamesReport.filterAll} ({stats?.total || 0})
            </button>
            <button onClick={() => setFilter('wins')}
              className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all ${filter === 'wins' ? 'bg-yellow-400 text-white shadow-sm' : 'bg-white text-slate-400 border border-gray-100'}`}>
              🏆 {t[language].gamesReport.filterWins} ({winsCount})
            </button>
            <button onClick={() => setFilter('losses')}
              className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all ${filter === 'losses' ? 'bg-rose-500 text-white shadow-sm' : 'bg-white text-slate-400 border border-gray-100'}`}>
              ❌ {t[language].gamesReport.filterLoss} ({lossesCount})
            </button>
          </div>

          {/* ── GAME LIST ── */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-4 shadow-sm border border-gray-100">
                <Gamepad2 size={36} className="text-slate-300" />
              </div>
              <p className="font-black text-slate-700 text-base">{t[language].gamesReport.noGames}</p>
              <p className="text-slate-400 text-sm mt-1">{t[language].gamesReport.joinGame}</p>
            </div>
          ) : (
            <div className="px-4 space-y-3">
              {filtered.map(g => {
                const isFinished = g.status === 'finished';
                const isOngoing  = g.status === 'waiting' || g.status === 'calling';
                const grad = getStakeGradient(g.stake);

                return (
                  <div key={g.game_id}
                    className={`bg-white rounded-2xl overflow-hidden shadow-sm border ${g.is_winner ? 'border-yellow-200' : isOngoing ? 'border-blue-100' : 'border-gray-100'}`}>

                    {/* Stake color bar */}
                    <div className={`bg-gradient-to-r ${grad} px-4 py-3 flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <Gamepad2 size={15} className="text-white/80" />
                        <span className="text-white font-black text-sm">{g.stake} ETB</span>
                        {g.game_number && (
                          <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                            <Hash size={8} />{g.game_number}
                          </span>
                        )}
                      </div>
                      <div>
                        {g.is_winner && (
                          <span className="bg-yellow-300 text-yellow-900 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                            <Crown size={10} /> {t[language].gamesReport.youWon}
                          </span>
                        )}
                        {isFinished && !g.is_winner && (
                          <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{t[language].gamesReport.finished}</span>
                        )}
                        {isOngoing && (
                          <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock size={9} /> {t[language].gamesReport.live}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="px-4 py-3 grid grid-cols-3 divide-x divide-gray-100">
                      <div className="pr-3">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{t[language].gamesReport.cartela}</p>
                        <p className="font-black text-slate-800 text-lg leading-none">
                          {g.cartela_number ? `#${g.cartela_number}` : '—'}
                        </p>
                      </div>
                      <div className="px-3">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{t[language].gamesReport.prizePool}</p>
                        <p className="font-black text-slate-700 text-lg leading-none">
                          {g.prize_pool.toLocaleString()}
                          <span className="text-[10px] text-slate-400 font-bold"> ETB</span>
                        </p>
                      </div>
                      <div className="pl-3">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{t[language].gamesReport.calls}</p>
                        <p className="font-black text-slate-700 text-lg leading-none">{g.total_calls}</p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-4 pb-3 flex items-center justify-between gap-2">
                      {g.is_winner ? (
                        <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-1.5 flex-1">
                          <Trophy size={13} className="text-yellow-500 shrink-0" />
                          <span className="text-yellow-700 font-black text-xs">{t[language].gamesReport.wonAmount.replace('{amount}', g.winner_prize.toLocaleString())}</span>
                        </div>
                      ) : isFinished ? (
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-gray-100 rounded-xl px-3 py-1.5 flex-1">
                          <XCircle size={13} className="text-slate-400 shrink-0" />
                          <span className="text-slate-500 font-bold text-xs truncate">
                            {t[language].gamesReport.wonBy.replace('{name}', g.winner_name || t[language].gamesReport.anotherPlayer)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 flex-1">
                          <Clock size={13} className="text-blue-500 shrink-0" />
                          <span className="text-blue-600 font-bold text-xs">{t[language].gamesReport.inProgress}</span>
                        </div>
                      )}
                      <span className="text-[10px] text-slate-400 font-medium shrink-0">
                        {timeAgo(g.finished_at || g.created_at, language)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <button onClick={() => fetchReport(page + 1)} disabled={loadingMore}
                  className="w-full py-3.5 rounded-2xl bg-white border border-gray-100 text-slate-500 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm">
                  {loadingMore
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    : <><ChevronDown size={16} /> {t[language].gamesReport.loadMore}</>
                  }
                </button>
              )}
              <div className="h-2" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
