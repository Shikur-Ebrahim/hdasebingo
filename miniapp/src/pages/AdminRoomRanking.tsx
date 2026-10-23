import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Trophy,
  Users,
  Gamepad2,
  Building2,
  TrendingUp,
  Percent,
  Medal,
} from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return (n || 0).toFixed(2);
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString();
}

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 Days' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All Time' },
];

interface RoomStat {
  id: string;
  room_name: string;
  agent_name: string | null;
  commission_rate: number;
  promoter_commission_rate: number;
  total_games_all_time: number;
  is_pinned: boolean;
  period_games: number;
  period_pot: number;
  period_room_commission: number;
  period_promoter_commission: number;
  period_platform_commission: number;
  period_winner_prizes: number;
  active_players: number;
}

interface Totals {
  total_games: number;
  total_pot: number;
  total_room_commission: number;
  total_promoter_commission: number;
  total_platform_commission: number;
}

const RANK_COLORS = [
  { medal: '🥇', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  { medal: '🥈', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-700' },
  { medal: '🥉', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
];

export default function AdminRoomRanking() {
  const navigate = useNavigate();
  const { user } = useGameStore();
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<RoomStat[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [sortBy, setSortBy] = useState<'commission' | 'games' | 'players' | 'pot'>('commission');

  const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';

  const fetchData = async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/room-ranking?period=${p}`, {
        headers: { 'x-telegram-init-data': initData },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setRooms(data.rooms || []);
      setTotals(data.totals || null);
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

  if (!user || user.role !== 'admin') {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied</div>;
  }

  const sortedRooms = [...rooms].sort((a, b) => {
    if (sortBy === 'commission') return b.period_room_commission - a.period_room_commission;
    if (sortBy === 'games') return b.period_games - a.period_games;
    if (sortBy === 'players') return b.active_players - a.active_players;
    if (sortBy === 'pot') return b.period_pot - a.period_pot;
    return 0;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center space-x-2">
          <Trophy size={17} className="text-amber-500" />
          <span className="font-bold text-slate-800 text-sm">Room Ranking</span>
        </div>
        <button
          onClick={() => fetchData(period)}
          disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 disabled:opacity-40"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
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

        {/* Grand Total Summary Cards */}
        {totals && (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Total Games (Period)</p>
                  <p className="text-2xl font-black text-slate-800">{fmtInt(totals.total_games)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Total Pot (Period)</p>
                  <p className="text-lg font-black text-slate-700">{fmt(totals.total_pot)} <span className="text-xs text-slate-400">ETB</span></p>
                </div>
              </div>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-3.5 border border-emerald-100 shadow-sm">
              <p className="text-[10px] text-emerald-600 font-semibold mb-0.5">Room Commission</p>
              <p className="text-lg font-black text-emerald-700">{fmt(totals.total_room_commission)}</p>
              <p className="text-[9px] text-slate-400">ETB</p>
            </div>
            <div className="bg-violet-50 rounded-2xl p-3.5 border border-violet-100 shadow-sm">
              <p className="text-[10px] text-violet-600 font-semibold mb-0.5">Promoter Commission</p>
              <p className="text-lg font-black text-violet-700">{fmt(totals.total_promoter_commission)}</p>
              <p className="text-[9px] text-slate-400">ETB</p>
            </div>
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-3.5 shadow-md col-span-2">
              <p className="text-[10px] text-white/70 font-semibold mb-0.5">Platform (System) Commission</p>
              <p className="text-2xl font-black text-white">{fmt(totals.total_platform_commission)} ETB</p>
            </div>
          </div>
        )}

        {/* Sort controls */}
        <div>
          <p className="text-[10px] text-slate-400 font-semibold mb-2">Sort Ranking By</p>
          <div className="flex space-x-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { key: 'commission', label: 'Room Commission', icon: <Percent size={11} /> },
              { key: 'games', label: 'Games', icon: <Gamepad2 size={11} /> },
              { key: 'players', label: 'Active Players', icon: <Users size={11} /> },
              { key: 'pot', label: 'Total Pot', icon: <TrendingUp size={11} /> },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key as typeof sortBy)}
                className={`shrink-0 flex items-center space-x-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border ${
                  sortBy === s.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {s.icon}
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Room Ranking Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-slate-400">Loading room rankings...</p>
          </div>
        ) : sortedRooms.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-2">
            <p className="text-3xl">🏠</p>
            <p className="text-xs font-bold text-slate-600">No room data found</p>
            <p className="text-[11px] text-slate-400">Try a different period or check back later</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Top 3 Podium Cards */}
            {sortedRooms.slice(0, 3).map((room, idx) => {
              const rc = RANK_COLORS[idx];
              return (
                <div
                  key={room.id}
                  className={`rounded-2xl border-2 ${rc.border} ${rc.bg} p-4 shadow-sm`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2.5">
                      <span className="text-2xl">{rc.medal}</span>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <p className="font-bold text-slate-800 text-sm leading-tight">{room.room_name}</p>
                          {room.is_pinned && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">📌 Pinned</span>}
                        </div>
                        {room.agent_name && (
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            <Building2 size={9} className="inline mr-0.5" />{room.agent_name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${rc.badge}`}>
                      Rank #{idx + 1}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white/70 rounded-xl p-2 text-center">
                      <p className="text-[9px] text-slate-400 font-semibold">Games</p>
                      <p className="text-sm font-black text-slate-800">{room.period_games}</p>
                    </div>
                    <div className="bg-white/70 rounded-xl p-2 text-center">
                      <p className="text-[9px] text-slate-400 font-semibold">Active Players</p>
                      <p className="text-sm font-black text-slate-800">{room.active_players}</p>
                    </div>
                    <div className="bg-white/70 rounded-xl p-2 text-center">
                      <p className="text-[9px] text-slate-400 font-semibold">All-Time Games</p>
                      <p className="text-sm font-black text-slate-800">{room.total_games_all_time}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-100 rounded-xl p-2.5">
                      <p className="text-[9px] text-emerald-700 font-semibold">Room Commission</p>
                      <p className="text-sm font-black text-emerald-800">{fmt(room.period_room_commission)} ETB</p>
                      <p className="text-[9px] text-emerald-600 font-medium">{room.commission_rate}% rate</p>
                    </div>
                    <div className="bg-violet-100 rounded-xl p-2.5">
                      <p className="text-[9px] text-violet-700 font-semibold">Promoter Commission</p>
                      <p className="text-sm font-black text-violet-800">{fmt(room.period_promoter_commission)} ETB</p>
                      <p className="text-[9px] text-violet-600 font-medium">{room.promoter_commission_rate}% rate</p>
                    </div>
                  </div>

                  <div className="mt-2 bg-indigo-600 rounded-xl p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] text-white/70 font-semibold">Platform Commission</p>
                      <p className="text-sm font-black text-white">{fmt(room.period_platform_commission)} ETB</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-white/70 font-semibold">Total Pot</p>
                      <p className="text-sm font-black text-white">{fmt(room.period_pot)} ETB</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Rest as table */}
            {sortedRooms.length > 3 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center space-x-2">
                  <Medal size={14} className="text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">All Rooms Ranking</span>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-12 gap-0 px-3 py-2 bg-slate-50 border-b border-slate-100">
                  <div className="col-span-1 text-[9px] font-bold text-slate-400">#</div>
                  <div className="col-span-4 text-[9px] font-bold text-slate-400">Room</div>
                  <div className="col-span-2 text-[9px] font-bold text-slate-400 text-center">Games</div>
                  <div className="col-span-2 text-[9px] font-bold text-slate-400 text-center">Players</div>
                  <div className="col-span-3 text-[9px] font-bold text-slate-400 text-right">Room Comm</div>
                </div>

                {/* Table rows */}
                {sortedRooms.map((room, idx) => (
                  <div
                    key={room.id}
                    className={`grid grid-cols-12 gap-0 px-3 py-3 items-center border-b border-slate-50 last:border-0 ${
                      idx < 3 ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <div className="col-span-1">
                      <span className="text-xs font-bold text-slate-400">
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                      </span>
                    </div>
                    <div className="col-span-4 min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 truncate leading-tight">{room.room_name}</p>
                      <p className="text-[9px] text-slate-400 font-medium truncate">{room.commission_rate}% comm</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-xs font-bold text-slate-700">{room.period_games}</p>
                      <p className="text-[8px] text-slate-400">period</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-xs font-bold text-slate-700">{room.active_players}</p>
                      <p className="text-[8px] text-slate-400">live</p>
                    </div>
                    <div className="col-span-3 text-right">
                      <p className="text-xs font-bold text-emerald-700">{fmt(room.period_room_commission)}</p>
                      <p className="text-[8px] text-slate-400">ETB</p>
                    </div>
                  </div>
                ))}

                {/* Table footer totals */}
                {totals && (
                  <div className="grid grid-cols-12 gap-0 px-3 py-3 bg-slate-800 items-center">
                    <div className="col-span-1">
                      <TrendingUp size={12} className="text-white/60" />
                    </div>
                    <div className="col-span-4">
                      <p className="text-[11px] font-bold text-white">Total</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-xs font-bold text-white">{fmtInt(totals.total_games)}</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-[9px] text-white/50">—</p>
                    </div>
                    <div className="col-span-3 text-right">
                      <p className="text-xs font-bold text-emerald-300">{fmt(totals.total_room_commission)}</p>
                      <p className="text-[8px] text-white/40">ETB</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Detailed Commission Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-700">Commission Breakdown by Room</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Room · Promoter · Platform commission per room</p>
              </div>
              <div className="divide-y divide-slate-50">
                {sortedRooms.map((room, idx) => (
                  <div key={room.id + '_detail'} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-bold text-slate-500 w-5">#{idx + 1}</span>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{room.room_name}</p>
                          {room.agent_name && (
                            <p className="text-[9px] text-slate-400">{room.agent_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {room.active_players > 0 && (
                          <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                            {room.active_players} live
                          </span>
                        )}
                        <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {room.period_games} games
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="bg-emerald-50 rounded-lg p-1.5">
                        <p className="text-[8px] text-emerald-600 font-semibold">Room</p>
                        <p className="text-[11px] font-bold text-emerald-800">{fmt(room.period_room_commission)}</p>
                        <p className="text-[8px] text-slate-400">{room.commission_rate}%</p>
                      </div>
                      <div className="bg-violet-50 rounded-lg p-1.5">
                        <p className="text-[8px] text-violet-600 font-semibold">Promoter</p>
                        <p className="text-[11px] font-bold text-violet-800">{fmt(room.period_promoter_commission)}</p>
                        <p className="text-[8px] text-slate-400">{room.promoter_commission_rate}%</p>
                      </div>
                      <div className="bg-indigo-50 rounded-lg p-1.5">
                        <p className="text-[8px] text-indigo-600 font-semibold">Platform</p>
                        <p className="text-[11px] font-bold text-indigo-800">{fmt(room.period_platform_commission)}</p>
                        <p className="text-[8px] text-slate-400">remain</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                      <span>Total Pot: <span className="font-bold text-slate-600">{fmt(room.period_pot)} ETB</span></span>
                      <span>All-Time: <span className="font-bold text-slate-600">{room.total_games_all_time} games</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
