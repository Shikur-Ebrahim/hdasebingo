import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Trophy,
  Target,
  TrendingUp,
  Coins,
  Gamepad2,
  Crown,
  XCircle,
  Clock,
  RefreshCw,
  ChevronDown,
  BarChart3,
  TableProperties,
} from 'lucide-react';
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

interface DayBucket {
  label: string;
  date: string;
  games: number;
  wins: number;
  wagered: number;
  won: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildDayBuckets(games: GameRecord[]): DayBucket[] {
  const buckets: DayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({
      label: DAY_LABELS[d.getDay()],
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      games: 0,
      wins: 0,
      wagered: 0,
      won: 0,
    });
  }
  games.forEach(g => {
    const dt = new Date(g.finished_at || g.created_at || '');
    const diffDays = Math.floor((Date.now() - dt.getTime()) / 86400000);
    if (diffDays < 7) {
      const idx = 6 - diffDays;
      if (idx >= 0 && idx < 7) {
        buckets[idx].games++;
        buckets[idx].wagered += g.stake;
        if (g.is_winner) {
          buckets[idx].wins++;
          buckets[idx].won += g.winner_prize;
        }
      }
    }
  });
  return buckets;
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

type ChartMetric = 'games' | 'wagered' | 'won';

const STAKE_COLORS: Record<number, string> = {
  10:  'from-blue-400 to-blue-600',
  20:  'from-green-400 to-green-600',
  50:  'from-purple-400 to-purple-600',
  100: 'from-rose-400 to-rose-600',
};
function getStakeGradient(stake: number): string {
  return STAKE_COLORS[stake] || 'from-slate-400 to-slate-600';
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
  const [chartMetric, setChartMetric] = useState<ChartMetric>('games');
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

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

  const winsCount  = games.filter(g => g.is_winner).length;
  const lossesCount = games.filter(g => !g.is_winner && g.status === 'finished').length;

  const dayBuckets = useMemo(() => buildDayBuckets(games), [games]);

  const maxChartValue = useMemo(() => {
    const vals = dayBuckets.map(b =>
      chartMetric === 'games' ? b.games : chartMetric === 'wagered' ? b.wagered : b.won
    );
    return Math.max(...vals, 1);
  }, [dayBuckets, chartMetric]);

  const selectedDay = selectedDayIdx !== null ? dayBuckets[selectedDayIdx] : dayBuckets[dayBuckets.length - 1];

  return (
    <div className="min-h-screen bg-gray-50 pb-10">

      {/* ── HEADER ── */}
      <div className="bg-white sticky top-0 z-10 px-4 pt-5 pb-3 border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 transition-all shrink-0">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-800 leading-tight">{t[language].gamesReport.title}</h1>
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
          {/* ── STATS SUMMARY ROW ── */}
          {stats && (
            <div className="px-4 pt-4 pb-3 grid grid-cols-4 gap-2">
              <div className="bg-gradient-to-br from-yellow-400 to-orange-400 rounded-2xl p-3 col-span-2 shadow-sm">
                <p className="text-white/80 text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Trophy size={9} /> {t[language].gamesReport.totalWins}
                </p>
                <p className="text-3xl font-black text-white leading-none">{stats.wins}</p>
                <p className="text-white/70 text-[9px] mt-0.5">{t[language].gamesReport.totalGames.replace('{total}', stats.total.toString())}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl p-3 col-span-2 shadow-sm">
                <p className="text-white/80 text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                  <TrendingUp size={9} /> {t[language].gamesReport.winRate}
                </p>
                <p className="text-3xl font-black text-white leading-none">{stats.win_rate}<span className="text-base">%</span></p>
                <p className="text-white/70 text-[9px] mt-0.5">{t[language].gamesReport.ofFinished}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 col-span-2 border border-gray-100 shadow-sm">
                <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Coins size={9} /> {t[language].gamesReport.played}
                </p>
                <p className="text-xl font-black text-slate-800 leading-none">{stats.total_wagered.toLocaleString()}</p>
                <p className="text-slate-400 text-[9px] mt-0.5">{t[language].gamesReport.wagered}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 col-span-2 border border-gray-100 shadow-sm">
                <p className="text-emerald-500 text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Target size={9} /> {t[language].gamesReport.won}
                </p>
                <p className="text-xl font-black text-emerald-600 leading-none">{stats.total_won.toLocaleString()}</p>
                <p className="text-slate-400 text-[9px] mt-0.5">{t[language].gamesReport.prizeTotal}</p>
              </div>
            </div>
          )}

          {/* ── ANALYTICS CHART ── */}
          <div className="px-4 pb-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              {/* Chart Header */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-slate-800">
                  <TrendingUp size={14} className="text-orange-500" />
                  <h3 className="text-xs font-bold">Activity & Trends</h3>
                </div>
                <p className="text-[10px] text-slate-400">Last 7 days performance</p>
              </div>

              {/* Metric Selector */}
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl text-[10px] font-bold">
                <button
                  onClick={() => setChartMetric('games')}
                  className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                    chartMetric === 'games'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  <Gamepad2 size={11} />
                  Games
                </button>
                <button
                  onClick={() => setChartMetric('wagered')}
                  className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                    chartMetric === 'wagered'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  <Coins size={11} />
                  Wagered
                </button>
                <button
                  onClick={() => setChartMetric('won')}
                  className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                    chartMetric === 'won'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  <Trophy size={11} />
                  Won
                </button>
              </div>

              {/* Bar Chart */}
              <div className="h-36 flex items-end justify-between gap-1.5 px-1">
                {dayBuckets.map((b, idx) => {
                  const val = chartMetric === 'games' ? b.games : chartMetric === 'wagered' ? b.wagered : b.won;
                  const pct = maxChartValue > 0 ? Math.max(8, Math.round((val / maxChartValue) * 100)) : 8;
                  const isSelected = selectedDayIdx === idx || (selectedDayIdx === null && idx === dayBuckets.length - 1);

                  return (
                    <div
                      key={b.date}
                      onClick={() => setSelectedDayIdx(idx)}
                      className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                    >
                      <span className={`text-[8px] font-bold mb-1 transition-all ${
                        isSelected ? 'text-slate-900 scale-110' : 'text-slate-400 opacity-60 group-hover:opacity-100'
                      }`}>
                        {chartMetric === 'games' ? val : val > 0 ? `${val}` : '0'}
                      </span>
                      <div className="w-full max-w-[26px] bg-slate-100 rounded-xl overflow-hidden flex flex-col justify-end h-[90px] p-0.5">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-lg transition-all duration-300 ${
                            chartMetric === 'games'
                              ? isSelected
                                ? 'bg-gradient-to-t from-orange-600 to-amber-400'
                                : 'bg-gradient-to-t from-orange-300 to-amber-200 group-hover:from-orange-400 group-hover:to-amber-300'
                              : chartMetric === 'wagered'
                              ? isSelected
                                ? 'bg-gradient-to-t from-blue-600 to-blue-400'
                                : 'bg-gradient-to-t from-blue-300 to-blue-200 group-hover:from-blue-400 group-hover:to-blue-300'
                              : isSelected
                              ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                              : 'bg-gradient-to-t from-emerald-300 to-emerald-200 group-hover:from-emerald-400 group-hover:to-emerald-300'
                          }`}
                        />
                      </div>
                      <span className={`text-[9px] mt-1.5 font-bold uppercase transition-colors ${
                        isSelected ? 'text-orange-600' : 'text-slate-400'
                      }`}>
                        {b.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Selected day detail strip */}
              {selectedDay && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-[9px]">
                      {selectedDay.label}
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">{selectedDay.date}</p>
                      <p className="text-xs font-bold text-slate-800 mt-0.5">
                        {selectedDay.games} {selectedDay.games === 1 ? 'Game' : 'Games'}
                        {selectedDay.wins > 0 && ` · ${selectedDay.wins} Win${selectedDay.wins > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Won</p>
                    <p className="text-xs font-bold text-emerald-600 mt-0.5">+{selectedDay.won.toLocaleString()} ETB</p>
                  </div>
                </div>
              )}

              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100 text-center">
                <div className="bg-slate-50 p-2 rounded-xl">
                  <p className="text-[9px] text-slate-400 font-bold">7-Day Games</p>
                  <p className="text-xs font-black text-slate-800">{dayBuckets.reduce((a, b) => a + b.games, 0)}</p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl">
                  <p className="text-[9px] text-slate-400 font-bold">7-Day Wins</p>
                  <p className="text-xs font-black text-emerald-600">{dayBuckets.reduce((a, b) => a + b.wins, 0)}</p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl">
                  <p className="text-[9px] text-slate-400 font-bold">7-Day Won</p>
                  <p className="text-xs font-black text-emerald-600">{dayBuckets.reduce((a, b) => a + b.won, 0).toLocaleString()} ETB</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── FILTER TABS ── */}
          <div className="px-4 pb-3 flex gap-2">
            <button onClick={() => setFilter('all')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-400 border border-gray-100'}`}>
              {t[language].gamesReport.filterAll} ({stats?.total || 0})
            </button>
            <button onClick={() => setFilter('wins')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'wins' ? 'bg-yellow-400 text-white shadow-sm' : 'bg-white text-slate-400 border border-gray-100'}`}>
              🏆 {t[language].gamesReport.filterWins} ({winsCount})
            </button>
            <button onClick={() => setFilter('losses')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'losses' ? 'bg-rose-500 text-white shadow-sm' : 'bg-white text-slate-400 border border-gray-100'}`}>
              ❌ {t[language].gamesReport.filterLoss} ({lossesCount})
            </button>
          </div>

          {/* ── VIEW TOGGLE (Table / Cards) ── */}
          <div className="px-4 pb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500">
              {filtered.length} {filtered.length === 1 ? 'game' : 'games'} shown
            </p>
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                  viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'
                }`}
              >
                <TableProperties size={12} />
                Table
              </button>
              <button
                onClick={() => setViewMode('chart')}
                className={`px-3 py-1 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                  viewMode === 'chart' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'
                }`}
              >
                <BarChart3 size={12} />
                Cards
              </button>
            </div>
          </div>

          {/* ── GAME LIST ── */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-4 shadow-sm border border-gray-100">
                <Gamepad2 size={36} className="text-slate-300" />
              </div>
              <p className="font-bold text-slate-700 text-base">{t[language].gamesReport.noGames}</p>
              <p className="text-slate-400 text-sm mt-1">{t[language].gamesReport.joinGame}</p>
            </div>
          ) : viewMode === 'table' ? (
            /* ── TABLE VIEW ── */
            <div className="px-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-100 px-3 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  <div className="col-span-1">#</div>
                  <div className="col-span-2">Stake</div>
                  <div className="col-span-2">Cartela</div>
                  <div className="col-span-2">Pool</div>
                  <div className="col-span-2">Calls</div>
                  <div className="col-span-2">Result</div>
                  <div className="col-span-1 text-right">Time</div>
                </div>
                {/* Table Rows */}
                <div className="divide-y divide-slate-50">
                  {filtered.map((g, idx) => {
                    const isFinished = g.status === 'finished';
                    const isOngoing  = g.status === 'waiting' || g.status === 'calling';
                    return (
                      <div key={g.game_id}
                        className={`grid grid-cols-12 px-3 py-2.5 items-center text-xs ${
                          g.is_winner ? 'bg-yellow-50/60' : ''
                        }`}
                      >
                        <div className="col-span-1 text-slate-400 font-medium text-[10px]">{idx + 1}</div>
                        <div className="col-span-2">
                          <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded-lg bg-gradient-to-r ${getStakeGradient(g.stake)}`}>
                            {g.stake}
                          </span>
                        </div>
                        <div className="col-span-2 font-bold text-slate-700 text-[10px]">
                          {g.cartela_number ? `#${g.cartela_number}` : '—'}
                        </div>
                        <div className="col-span-2 text-slate-600 text-[10px] font-medium">
                          {g.prize_pool.toLocaleString()}
                          <span className="text-slate-400 text-[8px]"> ETB</span>
                        </div>
                        <div className="col-span-2 text-slate-600 text-[10px] font-medium">{g.total_calls}</div>
                        <div className="col-span-2">
                          {g.is_winner ? (
                            <span className="text-[9px] font-black text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 w-fit">
                              <Crown size={9} /> Won
                            </span>
                          ) : isOngoing ? (
                            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg w-fit">Live</span>
                          ) : isFinished ? (
                            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 w-fit">
                              <XCircle size={9} /> Loss
                            </span>
                          ) : null}
                        </div>
                        <div className="col-span-1 text-[9px] text-slate-400 text-right">
                          {timeAgo(g.finished_at || g.created_at, language)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Load More */}
              {hasMore && (
                <button onClick={() => fetchReport(page + 1)} disabled={loadingMore}
                  className="w-full mt-3 py-3 rounded-2xl bg-white border border-gray-100 text-slate-500 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm">
                  {loadingMore
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    : <><ChevronDown size={16} /> {t[language].gamesReport.loadMore}</>
                  }
                </button>
              )}
              <div className="h-4" />
            </div>
          ) : (
            /* ── CARD VIEW ── */
            <div className="px-4 space-y-3">
              {filtered.map(g => {
                const isFinished = g.status === 'finished';
                const isOngoing  = g.status === 'waiting' || g.status === 'calling';
                const grad = getStakeGradient(g.stake);
                return (
                  <div key={g.game_id}
                    className={`bg-white rounded-2xl overflow-hidden shadow-sm border ${g.is_winner ? 'border-yellow-200' : isOngoing ? 'border-blue-100' : 'border-gray-100'}`}>

                    {/* Stake header bar */}
                    <div className={`bg-gradient-to-r ${grad} px-4 py-2.5 flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <Gamepad2 size={14} className="text-white/80" />
                        <span className="text-white font-bold text-sm">{g.stake} ETB</span>
                        {g.game_number && (
                          <span className="bg-white/20 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                            #{g.game_number}
                          </span>
                        )}
                      </div>
                      <div>
                        {g.is_winner && (
                          <span className="bg-yellow-300 text-yellow-900 text-[9px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <Crown size={9} /> {t[language].gamesReport.youWon}
                          </span>
                        )}
                        {isFinished && !g.is_winner && (
                          <span className="bg-white/20 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                            {t[language].gamesReport.finished}
                          </span>
                        )}
                        {isOngoing && (
                          <span className="bg-white/20 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock size={8} /> {t[language].gamesReport.live}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="px-4 py-2.5 grid grid-cols-3 divide-x divide-gray-100">
                      <div className="pr-3">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{t[language].gamesReport.cartela}</p>
                        <p className="font-bold text-slate-800 text-base leading-none">
                          {g.cartela_number ? `#${g.cartela_number}` : '—'}
                        </p>
                      </div>
                      <div className="px-3">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{t[language].gamesReport.prizePool}</p>
                        <p className="font-bold text-slate-700 text-base leading-none">
                          {g.prize_pool.toLocaleString()}
                          <span className="text-[9px] text-slate-400 font-medium"> ETB</span>
                        </p>
                      </div>
                      <div className="pl-3">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{t[language].gamesReport.calls}</p>
                        <p className="font-bold text-slate-700 text-base leading-none">{g.total_calls}</p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-4 pb-3 flex items-center justify-between gap-2">
                      {g.is_winner ? (
                        <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-1.5 flex-1">
                          <Trophy size={12} className="text-yellow-500 shrink-0" />
                          <span className="text-yellow-700 font-bold text-xs">
                            {t[language].gamesReport.wonAmount.replace('{amount}', g.winner_prize.toLocaleString())}
                          </span>
                        </div>
                      ) : isFinished ? (
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-gray-100 rounded-xl px-3 py-1.5 flex-1">
                          <XCircle size={12} className="text-slate-400 shrink-0" />
                          <span className="text-slate-500 font-medium text-xs truncate">
                            {t[language].gamesReport.wonBy.replace('{name}', g.winner_name || t[language].gamesReport.anotherPlayer)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 flex-1">
                          <Clock size={12} className="text-blue-500 shrink-0" />
                          <span className="text-blue-600 font-medium text-xs">{t[language].gamesReport.inProgress}</span>
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
