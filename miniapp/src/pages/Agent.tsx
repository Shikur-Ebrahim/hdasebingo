import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';
import {
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
  DoorOpen,
  Share2,
  Copy,
  Check,
  Sparkles,
  Play,
  Wallet,
  Gift
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
  const { user, fetchUser } = useGameStore();
  const navigate = useNavigate();
  const [room, setRoom] = useState<AgentRoom | null>(null);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  if (user?.role !== 'agent') {
    return <Navigate to="/" replace />;
  }

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  const roomInviteLink = room
    ? `https://t.me/${botUsername}?start=room_${room.id}`
    : `https://t.me/${botUsername}?start=ref_${user?.telegram_id}`;

  const fetchData = async () => {
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
      setRefreshing(false);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), fetchUser()]);
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('light');
  };

  useEffect(() => {
    fetchData();
    fetchUser();
    const interval = setInterval(() => {
      fetchData();
      fetchUser();
    }, 20000); // Auto-refresh balance and room every 20s
    return () => clearInterval(interval);
  }, []);

  const handleCopyRoomLink = () => {
    navigator.clipboard.writeText(roomInviteLink).then(() => {
      setCopiedLink(true);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleShareRoom = () => {
    const text = `🎮 Come play Bingo in my official room "${room?.room_name || 'HDASE BINGO'}"! Join now:\n\n${roomInviteLink}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(roomInviteLink)}&text=${encodeURIComponent(text)}`);
    } else if (navigator.share) {
      navigator.share({
        title: room?.room_name || 'HDASE BINGO Room',
        text,
        url: roomInviteLink,
      }).catch(() => {});
    } else {
      handleCopyRoomLink();
    }
  };

  const statusColor = (status: string) => {
    if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'paused') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const statusIcon = (status: string) => {
    if (status === 'active') return <Wifi size={12} className="text-emerald-500" />;
    if (status === 'paused') return <Clock size={12} className="text-amber-500" />;
    return <WifiOff size={12} className="text-slate-400" />;
  };

  const gameStatusLabel = (status: string) => {
    if (status === 'waiting') return 'Waiting';
    if (status === 'calling') return 'Live';
    return status;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 select-none pb-20">
      {/* ─── TOP BAR (Exact styling from Home page) ─── */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center justify-between">
          {/* Agent Avatar & Profile info */}
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black text-sm shadow-xs">
              {(user?.first_name || 'A').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-sm font-black text-slate-900 leading-tight">
                  {user?.first_name || 'Agent'}
                </span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700">
                  agent
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                {user?.username ? `@${user.username}` : `ID: ${user?.telegram_id}`}
              </p>
            </div>
          </div>

          {/* Right: Live Wallet Balance from users table */}
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <div className="flex items-center justify-end space-x-1">
                <Wallet size={12} className="text-slate-400" />
                <span className="text-[10px] text-slate-400 font-bold uppercase">Wallet</span>
              </div>
              <p className="text-sm font-black text-emerald-600 leading-tight">
                {(user?.main_balance ?? 0).toLocaleString()} <span className="text-[10px]">ETB</span>
              </p>
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-all shadow-2xs"
              title="Refresh Balance & Games"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-orange-500' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Error notification */}
        {error && (
          <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
            <AlertCircle size={16} className="text-rose-500 shrink-0" />
            <p className="text-xs text-rose-700 font-bold">{error}</p>
          </div>
        )}

        {/* ─── HERO BANNER: WARM ORANGE / AMBER STYLE (Circled like in Home) ─── */}
        {room ? (
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border-2 border-orange-200 rounded-3xl p-5 shadow-sm">
            {/* Soft decorative glow */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-orange-400/10 rounded-full blur-2xl pointer-events-none" />

            {/* Top row: tags */}
            <div className="flex items-center justify-between mb-3 relative">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">Live Agent Room</span>
                {room.is_pinned && (
                  <span className="inline-flex items-center space-x-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-2xs">
                    <span>📌</span>
                    <span>TOP</span>
                  </span>
                )}
              </div>

              <div className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusColor(room.status)}`}>
                {statusIcon(room.status)}
                <span>{room.status.toUpperCase()}</span>
              </div>
            </div>

            {/* Room Title */}
            <div className="text-center py-2 relative">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-600">
                Official Room
              </p>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mt-0.5">
                {room.room_name}
              </h2>

              {/* Commission Highlight Pill */}
              <div className="mt-2.5 inline-flex items-center space-x-1.5 bg-white border border-orange-300 shadow-xs px-3 py-1 rounded-full">
                <DollarSign size={13} className="text-orange-500" />
                <span className="text-xs font-black text-orange-600">
                  {room.commission_rate ?? 8}% Commission on Every Game Pot
                </span>
              </div>
            </div>

            {/* Room stats inside banner */}
            <div className="mt-4 pt-3 border-t border-orange-200/80 grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-xl font-black text-slate-900">{room.total_players ?? 0}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Total Players</p>
              </div>
              <div className="border-l border-orange-200/80">
                <p className="text-xl font-black text-orange-600">{room.total_games ?? 0}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Total Games</p>
              </div>
            </div>

            {/* Enter & Share Actions */}
            <div className="mt-4 flex space-x-2">
              <button
                onClick={() => navigate(`/bingo/live?room=${room.id}`)}
                className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-orange-500/25 active:scale-98 transition-all"
              >
                <Play size={14} fill="currentColor" />
                <span>Enter Room & Play</span>
              </button>
              <button
                onClick={handleShareRoom}
                className="px-3.5 py-3 bg-white border border-orange-300 text-orange-700 rounded-2xl font-black text-xs flex items-center justify-center space-x-1 hover:bg-orange-50 active:scale-95 transition-all shadow-xs"
                title="Share Room link"
              >
                <Share2 size={15} />
                <span>Share</span>
              </button>
            </div>
          </div>
        ) : !loading && (
          <div className="bg-white rounded-3xl p-8 border border-gray-100 text-center space-y-3 shadow-sm">
            <Building2 size={36} className="mx-auto text-slate-300" />
            <p className="text-sm font-black text-slate-800">No Room Assigned Yet</p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              You haven't been assigned to an official room yet. Contact the system administrator to link your room!
            </p>
          </div>
        )}

        {/* ─── LIVE AGENT METRIC CARDS ─── */}
        {room && (
          <div className="grid grid-cols-2 gap-3">
            {/* Active Games */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-2xs">
                <Gamepad2 size={20} />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900 leading-none">{activeGames.length}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Active Games</p>
              </div>
            </div>

            {/* Live Players */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-2xs">
                <Users size={20} />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900 leading-none">
                  {activeGames.reduce((sum, g) => sum + (g.total_players || 0), 0)}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Live Players</p>
              </div>
            </div>

            {/* Agent Commission Wallet */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-2xs">
                <Wallet size={20} />
              </div>
              <div>
                <p className="text-xl font-black text-emerald-600 leading-none">
                  {(user?.main_balance ?? 0).toLocaleString()} <span className="text-[10px]">ETB</span>
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Wallet Balance</p>
              </div>
            </div>

            {/* Bonus Balance */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center shadow-2xs">
                <Gift size={20} />
              </div>
              <div>
                <p className="text-xl font-black text-purple-600 leading-none">
                  {((user as any)?.bonus_balance ?? 0).toLocaleString()} <span className="text-[10px]">ETB</span>
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Bonus Balance</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── QUICK LINK BOX ─── */}
        {room && (
          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-xs flex items-center justify-between">
            <div className="flex items-center space-x-2 truncate mr-2">
              <DoorOpen size={16} className="text-orange-500 shrink-0" />
              <span className="font-mono text-xs text-slate-600 truncate select-all">{roomInviteLink}</span>
            </div>
            <button
              onClick={handleCopyRoomLink}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1 transition-all active:scale-95 ${
                copiedLink
                  ? 'bg-emerald-600 text-white'
                  : 'bg-orange-500 hover:bg-orange-600 text-white shadow-xs'
              }`}
            >
              {copiedLink ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        )}

        {/* ─── ACTIVE GAMES IN ROOM ─── */}
        {room && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                Games in {room.room_name} ({activeGames.length})
              </h3>
              <span className="text-[10px] font-bold text-orange-600">Auto-Managed</span>
            </div>

            {activeGames.length > 0 ? (
              <div className="space-y-2">
                {activeGames.map((game) => (
                  <div
                    key={game.id}
                    className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm flex items-center justify-between hover:border-orange-200 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-xs shrink-0">
                        {game.stake}
                        <span className="text-[8px] font-bold">ETB</span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <p className="text-xs font-black text-slate-800">
                            Stake: {game.stake} ETB
                          </p>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.2 rounded-full border ${
                              game.status === 'calling'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {gameStatusLabel(game.status)}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                          👥 {game.total_players} players joined
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <Trophy size={13} className="text-amber-500" />
                        <span className="text-xs font-black text-slate-800">
                          {game.prize_pool} ETB
                        </span>
                      </div>
                      <p className="text-[9px] text-emerald-600 font-bold mt-0.5">
                        +{Number(((game.prize_pool || game.stake * game.total_players) * (room.commission_rate ?? 8) / 100).toFixed(1))} ETB est. comm.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 border border-dashed border-slate-200 text-center space-y-1.5">
                <Gamepad2 size={24} className="mx-auto text-slate-300" />
                <p className="text-xs font-black text-slate-600">No active games right now</p>
                <p className="text-[10px] text-slate-400">New games will automatically start as players join your room</p>
              </div>
            )}
          </div>
        )}

        {/* ─── FOOTER INFO ─── */}
        <div className="flex flex-col items-center space-y-1 pt-3 text-center">
          <p className="text-[10px] text-slate-400 font-medium">
            Last synced: {lastRefresh.toLocaleTimeString()} · Auto-refresh active
          </p>
          <p className="text-[9px] text-slate-400 font-semibold">
            🇪🇹 HDASE BINGO • Agent Room Network
          </p>
        </div>
      </div>
    </div>
  );
}
