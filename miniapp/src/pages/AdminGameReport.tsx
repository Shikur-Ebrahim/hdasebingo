import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Gamepad2,
  Trophy,
  Building2,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(2);
}
function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function shortId(id: string) {
  return id ? id.replace(/-/g, '').substring(0, 8).toUpperCase() : '—';
}

interface GameRow {
  id: string;
  stake: number;
  room_id: string;
  room_name: string;
  agent_name: string | null;
  commission_rate: number;
  promoter_commission_rate: number;
  players_count: number;
  pot: number;
  winner_prize: number;
  room_commission: number;
  promoter_commission: number;
  platform_commission: number;
  winner_first_name: string | null;
  winner_cartela: string | null;
  created_at: string;
  finished_at: string | null;
}

interface ChartDay {
  date: string;
  label: string;
  games_count: number;
  room_commission: number;
  platform_commission: number;
  pot: number;
}

interface Stats {
  total_games: number;
  total_pot: number;
  total_room_commission: number;
  total_promoter_commission: number;
  total_platform_commission: number;
}

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 Days' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
];

export default function AdminGameReport() {
  const navigate = useNavigate();
  const { user } = useGameStore();
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [chartMetric, setChartMetric] = useState<'games' | 'room_comm' | 'platform_comm'>('games');
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);
  const [showCount, setShowCount] = useState(20);

  const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';

  const fetchData = async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/game-report?period=${p}`, {
        headers: { 'x-telegram-init-data': initData },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setStats(data.stats);
      setGames(data.games || []);
      setChartData(data.chart_data || []);
      setSelectedDayIdx(null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role !== 'admin') return;
    fetchData(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const maxChartVal = useMemo(() => {
    if (!chartData.length) return 10;
    const vals = chartData.map((d) => {
      if (chartMetric === 'games') return d.games_count;
      if (chartMetric === 'room_comm') return d.room_commission;
      return d.platform_commission;
    });
    const m = Math.max(...vals, 0);
    return m === 0 ? 10 : m;
  }, [chartData, chartMetric]);

  const selectedDay = useMemo(
    () =>
      selectedDayIdx !== null && chartData[selectedDayIdx]
        ? chartData[selectedDayIdx]
        : chartData[chartData.length - 1] || null,
    [selectedDayIdx, chartData]
  );

  if (!user || user.role !== 'admin') {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied</div>;
  }

  const visibleGames = games.slice(0, showCount);

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center space-x-2">
          <BarChart3 size={17} className="text-indigo-600" />
          <span className="font-bold text-slate-800 text-sm">Game Report</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/room-ranking')}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200"
          >
            🏠 Rooms
          </button>
          <button
            onClick={() => fetchData(period)}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Period Selector */}
        <div className="flex space-x-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                period === p.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Stat Cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
              <p className="text-[10px] text-slate-400 font-semibold mb-1">Total Games</p>
              <p className="text-xl font-black text-slate-800">{stats.total_games}</p>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
              <p className="text-[10px] text-slate-400 font-semibold mb-1">Total Pot (ETB)</p>
              <p className="text-xl font-black text-slate-800">{fmt(stats.total_pot)}</p>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-emerald-100 shadow-sm">
              <p className="text-[10px] text-emerald-600 font-semibold mb-1">Room Commission</p>
              <p className="text-xl font-black text-emerald-700">{fmt(stats.total_room_commission)}</p>
              <p className="text-[9px] text-slate-400">ETB</p>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-violet-100 shadow-sm">
              <p className="text-[10px] text-violet-600 font-semibold mb-1">Promoter Commission</p>
              <p className="text-xl font-black text-violet-700">{fmt(stats.total_promoter_commission)}</p>
              <p className="text-[9px] text-slate-400">ETB</p>
            </div>
            <div className="col-span-2 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-2xl p-3.5 shadow-sm">
              <p className="text-[10px] text-indigo-100 font-semibold mb-1">Platform (System) Commission</p>
              <p className="text-2xl font-black text-white">{fmt(stats.total_platform_commission)} ETB</p>
            </div>
          </div>
        )}

        {/* Activity Chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            {/* Chart header */}
            <div className="space-y-0.5">
              <div className="flex items-center space-x-1.5 text-slate-800">
                <TrendingUp size={15} className="text-indigo-500" />
                <h3 className="text-xs font-bold text-slate-800">Game Activity Trends</h3>
              </div>
              <p className="text-[10px] text-slate-400">14-Day Commission & Game Performance</p>
            </div>

            {/* Metric selector */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl text-[10px] font-bold">
              <button
                onClick={() => setChartMetric('games')}
                className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                  chartMetric === 'games'
                    ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <Gamepad2 size={11} />
                <span>Games</span>
              </button>
              <button
                onClick={() => setChartMetric('room_comm')}
                className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                  chartMetric === 'room_comm'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <Building2 size={11} />
                <span>Room Comm</span>
              </button>
              <button
                onClick={() => setChartMetric('platform_comm')}
                className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                  chartMetric === 'platform_comm'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <Trophy size={11} />
                <span>Platform</span>
              </button>
            </div>

            {/* Bars */}
            <div className="pt-1">
              <div className="h-36 flex items-end justify-between space-x-1 px-0.5">
                {chartData.map((d, idx) => {
                  const val =
                    chartMetric === 'games'
                      ? d.games_count
                      : chartMetric === 'room_comm'
                      ? d.room_commission
                      : d.platform_commission;
                  const hp = maxChartVal > 0 ? Math.max(8, Math.round((val / maxChartVal) * 100)) : 8;
                  const isSelected = selectedDayIdx === idx;

                  return (
                    <div
                      key={d.date}
                      onClick={() => setSelectedDayIdx(idx)}
                      className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                    >
                      <span
                        className={`text-[8px] font-bold mb-1 transition-all ${
                          isSelected ? 'text-slate-900' : 'text-slate-400 opacity-70'
                        }`}
                      >
                        {chartMetric === 'games' ? val : fmt(val)}
                      </span>
                      <div className="w-full max-w-[22px] bg-slate-100 rounded-lg overflow-hidden flex flex-col justify-end h-[96px] p-0.5">
                        <div
                          style={{ height: `${hp}%` }}
                          className={`w-full rounded-md transition-all duration-300 ${
                            chartMetric === 'games'
                              ? isSelected
                                ? 'bg-gradient-to-t from-indigo-600 to-blue-400 shadow-sm'
                                : 'bg-gradient-to-t from-indigo-300 to-blue-200 group-hover:from-indigo-400 group-hover:to-blue-300'
                              : chartMetric === 'room_comm'
                              ? isSelected
                                ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-sm'
                                : 'bg-gradient-to-t from-emerald-300 to-teal-200 group-hover:from-emerald-400 group-hover:to-teal-300'
                              : isSelected
                              ? 'bg-gradient-to-t from-slate-800 to-slate-600 shadow-sm'
                              : 'bg-gradient-to-t from-slate-300 to-slate-200 group-hover:from-slate-400 group-hover:to-slate-300'
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[8px] mt-1 font-bold transition-colors ${
                          isSelected ? 'text-indigo-600' : 'text-slate-400'
                        }`}
                      >
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected day strip */}
            {selectedDay && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-[10px]">
                    {selectedDay.label}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 leading-none">{selectedDay.date}</p>
                    <p className="text-xs font-bold text-slate-800 mt-0.5">
                      {selectedDay.games_count} {selectedDay.games_count === 1 ? 'Game' : 'Games'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 leading-none">Platform Comm</p>
                  <p className="text-xs font-bold text-indigo-600 mt-0.5">+{fmt(selectedDay.platform_commission)} ETB</p>
                </div>
              </div>
            )}

            {/* Summary row */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-center">
              <div className="bg-slate-50 p-2 rounded-xl">
                <span className="text-[9px] text-slate-400 font-semibold">14-Day Games:</span>{' '}
                <span className="text-xs font-bold text-slate-800">
                  {chartData.reduce((a, c) => a + c.games_count, 0)}
                </span>
              </div>
              <div className="bg-slate-50 p-2 rounded-xl">
                <span className="text-[9px] text-slate-400 font-semibold">14-Day Pot:</span>{' '}
                <span className="text-xs font-bold text-slate-800">
                  {fmt(chartData.reduce((a, c) => a + c.pot, 0))} ETB
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Games Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Gamepad2 size={15} className="text-indigo-600" />
              <span className="text-sm font-bold text-slate-800">Game Records</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">{games.length} games</span>
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : games.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No games found for this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 whitespace-nowrap">#</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 whitespace-nowrap">Game</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 whitespace-nowrap">Room</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-500 whitespace-nowrap">Stake</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-500 whitespace-nowrap">Players</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-500 whitespace-nowrap">Pot (ETB)</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-emerald-600 whitespace-nowrap">Room Comm</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-violet-600 whitespace-nowrap">Promo Comm</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-indigo-600 whitespace-nowrap">Platform</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 whitespace-nowrap">Winner</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 whitespace-nowrap">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGames.map((g, i) => (
                    <tr
                      key={g.id}
                      className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <td className="px-3 py-2.5 text-slate-400 font-semibold">{i + 1}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{shortId(g.id)}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap max-w-[90px] truncate">{g.room_name}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700 whitespace-nowrap">{g.stake}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-600">{g.players_count}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">{fmt(g.pot)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600 whitespace-nowrap">{fmt(g.room_commission)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-violet-600 whitespace-nowrap">{fmt(g.promoter_commission)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-indigo-600 whitespace-nowrap">{fmt(g.platform_commission)}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap max-w-[70px] truncate">
                        {g.winner_first_name || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-[10px]">{fmtDate(g.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Commission rate legend */}
              <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap gap-3">
                <span className="text-[10px] text-slate-400">
                  <span className="font-bold text-emerald-600">Room Comm</span> = Pot × room rate%
                </span>
                <span className="text-[10px] text-slate-400">
                  <span className="font-bold text-violet-600">Promo Comm</span> = Pot × promoter rate%
                </span>
                <span className="text-[10px] text-slate-400">
                  <span className="font-bold text-indigo-600">Platform</span> = Pot − Prize − Room − Promo
                </span>
              </div>

              {/* Load more */}
              {showCount < games.length && (
                <div className="px-4 pb-4 pt-2 flex justify-center">
                  <button
                    onClick={() => setShowCount((c) => c + 20)}
                    className="flex items-center space-x-1 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-bold border border-indigo-100"
                  >
                    <ChevronDown size={13} />
                    <span>Load more ({games.length - showCount} remaining)</span>
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
