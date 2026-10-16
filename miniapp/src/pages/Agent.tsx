import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';
import {
  Home,
  Users,
  Gamepad2,
  Wifi,
  WifiOff,
  Clock,
  DollarSign,
  Trophy,
  RefreshCw,
  Building2,
  AlertCircle,
} from 'lucide-react';

interface AgentRoom {
  id: string;
  room_name: string;
  agent_id: string;
  agent_name: string;
  total_players: number;
  total_games: number;
  status: 'active' | 'inactive' | 'paused';
  commission_rate?: number;
  is_pinned?: boolean;
  created_at: string;
}

interface ActiveGame {
  id: string;
  stake: number;
  prize_pool: number;
  total_players: number;
  status: string;
  start_at: string | null;
}

const API = import.meta.env.VITE_API_URL || '/api';

export default function Agent() {
  const { user } = useGameStore();
  const [room, setRoom] = useState<AgentRoom | null>(null);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  if (user?.role !== 'agent') {
    return <Navigate to="/" replace />;
  }

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/player/agent-room`, {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      if (!res.ok) throw new Error('Failed to load room data');
      const data = await res.json();
      setRoom(data.room || null);
      setActiveGames(data.active_games || []);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (status: string) => {
    if (status === 'active') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (status === 'paused') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const statusIcon = (status: string) => {
    if (status === 'active') return <Wifi size={12} />;
    if (status === 'paused') return <Clock size={12} />;
    return <WifiOff size={12} />;
  };

  const gameStatusLabel = (status: string) => {
    if (status === 'waiting') return 'Waiting';
    if (status === 'calling') return 'Live';
    return status;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white select-none">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-600/20 via-yellow-500/10 to-transparent pointer-events-none" />
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative px-5 pt-14 pb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Building2 size={22} className="text-slate-900" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-400/70 uppercase tracking-widest">Agent Portal</p>
                <h1 className="text-xl font-black text-white">
                  {user?.first_name || 'Agent'}
                </h1>
              </div>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="w-9 h-9 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center active:scale-95 transition-all"
            >
              <RefreshCw size={15} className={`text-amber-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Room status pill */}
          {room && (
            <div className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${statusColor(room.status)}`}>
              {statusIcon(room.status)}
              <span>{room.status.charAt(0).toUpperCase() + room.status.slice(1)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-12 space-y-5">
        {/* Error */}
        {error && (
          <div className="flex items-center space-x-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
            <AlertCircle size={16} className="text-rose-400 flex-shrink-0" />
            <p className="text-sm text-rose-300 font-medium">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !room && (
          <div className="space-y-3 animate-pulse">
            <div className="h-28 bg-slate-800/60 rounded-3xl" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-24 bg-slate-800/60 rounded-2xl" />
              <div className="h-24 bg-slate-800/60 rounded-2xl" />
            </div>
          </div>
        )}

        {/* No room assigned */}
        {!loading && !room && !error && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
            <div className="w-20 h-20 rounded-3xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center">
              <Home size={32} className="text-slate-500" />
            </div>
            <div>
              <p className="text-white font-black text-lg">No Room Assigned</p>
              <p className="text-slate-400 text-sm mt-1 max-w-xs">
                You haven't been assigned to a room yet. Contact your administrator.
              </p>
            </div>
          </div>
        )}

        {/* Room card */}
        {room && (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800/80 to-slate-800/40 border border-slate-700/50 p-5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-start justify-between relative">
              <div className="flex-1">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Your Room</p>
                <div className="flex items-center space-x-2">
                  <h2 className="text-2xl font-black text-white">{room.room_name}</h2>
                  {room.is_pinned && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black">
                      📌 Pinned
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2 mt-1">
                  {room.agent_name && (
                    <span className="text-xs text-amber-400/80 font-medium">{room.agent_name}</span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
                    💰 {room.commission_rate ?? 8}% Commission per game
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Building2 size={20} className="text-amber-400" />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-black text-white">{room.total_players ?? 0}</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Total Players</p>
              </div>
              <div className="text-center border-l border-slate-700/50">
                <p className="text-2xl font-black text-white">{room.total_games ?? 0}</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Total Games</p>
              </div>
            </div>
          </div>
        )}

        {/* Stat cards */}
        {room && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Gamepad2 size={18} className="text-emerald-400" />
              </div>
              <p className="text-2xl font-black text-white">{activeGames.length}</p>
              <p className="text-xs text-slate-400 font-medium">Active Games</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Users size={18} className="text-blue-400" />
              </div>
              <p className="text-2xl font-black text-white">
                {activeGames.reduce((sum, g) => sum + (g.total_players || 0), 0)}
              </p>
              <p className="text-xs text-slate-400 font-medium">Live Players</p>
            </div>
          </div>
        )}

        {/* Active games list */}
        {room && activeGames.length > 0 && (
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Active Games</p>
            <div className="space-y-2.5">
              {activeGames.map((game) => (
                <div
                  key={game.id}
                  className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <DollarSign size={15} className="text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">
                        Stake: {game.stake} ETB
                      </p>
                      <p className="text-xs text-slate-400">
                        {game.total_players} players
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <Trophy size={12} className="text-amber-400" />
                      <span className="text-xs font-bold text-amber-400">
                        {game.prize_pool} ETB
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        game.status === 'calling'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {gameStatusLabel(game.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {room && activeGames.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center bg-slate-800/30 border border-slate-700/30 rounded-3xl">
            <Gamepad2 size={28} className="text-slate-600" />
            <p className="text-slate-400 text-sm font-medium">No active games right now</p>
          </div>
        )}

        {/* Last refresh timestamp */}
        <p className="text-center text-[11px] text-slate-600 font-medium">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
