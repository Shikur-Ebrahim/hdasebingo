import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trophy, ChevronUp, ChevronDown } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return (n || 0).toFixed(2);
}

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 Days' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All Time' },
];

type SortKey = 'rank' | 'games' | 'players' | 'pot' | 'room_comm' | 'promo_comm' | 'platform_comm';

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

const MEDAL = ['🥇', '🥈', '🥉'];

export default function AdminRoomRanking() {
  const navigate = useNavigate();
  const { user } = useGameStore();
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<RoomStat[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('room_comm');
  const [sortAsc, setSortAsc] = useState(false);

  const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';

  const fetchData = async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/room-ranking?period=${p}`, {
        headers: { 'x-telegram-init-data': initData },
      });
      if (!res.ok) throw new Error('Failed');
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

  // Sort
  const sorted = [...rooms].sort((a, b) => {
    let av = 0, bv = 0;
    if (sortKey === 'games')        { av = a.period_games; bv = b.period_games; }
    else if (sortKey === 'players') { av = a.active_players; bv = b.active_players; }
    else if (sortKey === 'pot')     { av = a.period_pot; bv = b.period_pot; }
    else if (sortKey === 'room_comm')     { av = a.period_room_commission; bv = b.period_room_commission; }
    else if (sortKey === 'promo_comm')    { av = a.period_promoter_commission; bv = b.period_promoter_commission; }
    else if (sortKey === 'platform_comm') { av = a.period_platform_commission; bv = b.period_platform_commission; }
    return sortAsc ? av - bv : bv - av;
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp size={9} className="text-slate-300" />;
    return sortAsc
      ? <ChevronUp size={9} className="text-indigo-500" />
      : <ChevronDown size={9} className="text-indigo-500" />;
  }

  function Th({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    return (
      <th
        onClick={() => handleSort(col)}
        className={`px-2 py-2.5 text-[10px] font-bold text-slate-500 cursor-pointer select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      >
        <span className="inline-flex items-center gap-0.5">
          {label}<SortIcon col={col} />
        </span>
      </th>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center space-x-2">
          <Trophy size={16} className="text-amber-500" />
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

      <div className="p-4 space-y-3">
        {/* Period selector */}
        <div className="flex gap-2">
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

        {/* Summary totals */}
        {totals && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-5 divide-x divide-slate-100">
              <div className="p-2.5 text-center">
                <p className="text-[9px] text-slate-400 font-semibold leading-tight mb-0.5">Games</p>
                <p className="text-sm font-black text-slate-800">{totals.total_games}</p>
              </div>
              <div className="p-2.5 text-center">
                <p className="text-[9px] text-slate-400 font-semibold leading-tight mb-0.5">Pot</p>
                <p className="text-sm font-black text-slate-700">{fmt(totals.total_pot)}</p>
              </div>
              <div className="p-2.5 text-center">
                <p className="text-[9px] text-emerald-600 font-semibold leading-tight mb-0.5">Room</p>
                <p className="text-sm font-black text-emerald-700">{fmt(totals.total_room_commission)}</p>
              </div>
              <div className="p-2.5 text-center">
                <p className="text-[9px] text-violet-600 font-semibold leading-tight mb-0.5">Promo</p>
                <p className="text-sm font-black text-violet-700">{fmt(totals.total_promoter_commission)}</p>
              </div>
              <div className="p-2.5 text-center">
                <p className="text-[9px] text-indigo-600 font-semibold leading-tight mb-0.5">Platform</p>
                <p className="text-sm font-black text-indigo-700">{fmt(totals.total_platform_commission)}</p>
              </div>
            </div>
            <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-center">
              <span className="text-[9px] text-slate-400 font-medium">All amounts in ETB · tap column header to sort</span>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-14 space-y-2">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-slate-400">Loading rankings…</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center space-y-2">
            <p className="text-3xl">🏠</p>
            <p className="text-xs font-bold text-slate-600">No room data for this period</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] border-collapse text-left">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2.5 text-[10px] font-bold text-slate-500 text-left w-8">#</th>
                    <th className="px-2 py-2.5 text-[10px] font-bold text-slate-500 text-left">Room</th>
                    <Th col="games" label="Games" />
                    <Th col="players" label="Players" />
                    <Th col="pot" label="Pot (ETB)" right />
                    <Th col="room_comm" label="Room" right />
                    <Th col="promo_comm" label="Promo" right />
                    <Th col="platform_comm" label="Platform" right />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sorted.map((room, idx) => (
                    <tr
                      key={room.id}
                      className={`transition-colors ${
                        idx === 0 ? 'bg-amber-50' : idx === 1 ? 'bg-slate-50/60' : idx === 2 ? 'bg-orange-50/40' : 'bg-white'
                      }`}
                    >
                      {/* Rank */}
                      <td className="px-2 py-3 text-center">
                        <span className="text-xs font-bold text-slate-500">
                          {idx < 3 ? MEDAL[idx] : idx + 1}
                        </span>
                      </td>

                      {/* Room name */}
                      <td className="px-2 py-3 min-w-[110px] max-w-[130px]">
                        <p className="text-[11px] font-bold text-slate-800 truncate leading-tight">{room.room_name}</p>
                        <p className="text-[9px] text-slate-400 font-medium truncate">
                          {room.commission_rate}% · {room.promoter_commission_rate}% promo
                          {room.agent_name ? ` · ${room.agent_name}` : ''}
                        </p>
                      </td>

                      {/* Games */}
                      <td className="px-2 py-3 text-center">
                        <p className="text-xs font-bold text-slate-700">{room.period_games}</p>
                        <p className="text-[8px] text-slate-400">{room.total_games_all_time} all</p>
                      </td>

                      {/* Active players */}
                      <td className="px-2 py-3 text-center">
                        {room.active_players > 0 ? (
                          <span className="inline-block bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {room.active_players}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-medium">—</span>
                        )}
                      </td>

                      {/* Pot */}
                      <td className="px-2 py-3 text-right">
                        <p className="text-xs font-bold text-slate-700">{fmt(room.period_pot)}</p>
                      </td>

                      {/* Room commission */}
                      <td className="px-2 py-3 text-right">
                        <p className="text-xs font-bold text-emerald-700">{fmt(room.period_room_commission)}</p>
                      </td>

                      {/* Promoter commission */}
                      <td className="px-2 py-3 text-right">
                        <p className="text-xs font-bold text-violet-700">{fmt(room.period_promoter_commission)}</p>
                      </td>

                      {/* Platform commission */}
                      <td className="px-2 py-3 text-right">
                        <p className="text-xs font-bold text-indigo-700">{fmt(room.period_platform_commission)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Footer totals row */}
                {totals && (
                  <tfoot>
                    <tr className="bg-slate-800 border-t border-slate-700">
                      <td className="px-2 py-3 text-center">
                        <span className="text-[9px] text-white/40 font-bold">Σ</span>
                      </td>
                      <td className="px-2 py-3">
                        <p className="text-[11px] font-bold text-white">Total ({sorted.length} rooms)</p>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <p className="text-xs font-bold text-white">{totals.total_games}</p>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className="text-[9px] text-white/30">—</span>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <p className="text-xs font-bold text-white">{fmt(totals.total_pot)}</p>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <p className="text-xs font-bold text-emerald-300">{fmt(totals.total_room_commission)}</p>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <p className="text-xs font-bold text-violet-300">{fmt(totals.total_promoter_commission)}</p>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <p className="text-xs font-bold text-indigo-300">{fmt(totals.total_platform_commission)}</p>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
