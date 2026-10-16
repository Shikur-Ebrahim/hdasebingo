import { useEffect, useState, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';
import { QRCodeCanvas } from 'qrcode.react';
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
  Gift,
  TrendingUp,
  BarChart3,
  Calendar,
  Zap,
  ArrowUpRight,
  ShieldCheck,
  Search,
  QrCode,
  Flame,
  ChevronRight,
  Info
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
  created_at?: string;
}

interface FinishedGame {
  id: string;
  stake: number;
  total_players: number;
  prize_pool: number;
  winner_prize: number;
  winner_first_name: string;
  winner_cartela?: number | null;
  agent_commission: number;
  commission_rate: number;
  created_at: string;
  finished_at: string;
  status: string;
}

interface ChartDay {
  date: string;
  label: string;
  games_count: number;
  commission: number;
  volume: number;
}

interface RoomStats {
  today_games: number;
  today_commission: number;
  total_games_finished: number;
  total_commission_all_time: number;
  total_volume_all_time: number;
  total_referred_players: number;
  commission_rate: number;
}

const API = import.meta.env.VITE_API_URL || '/api';

const formatGameId = (id: string | null | undefined): string => {
  if (!id) return '';
  return id.replace(/-/g, '').substring(0, 8).toUpperCase();
};

export default function Agent() {
  const { user, fetchUser } = useGameStore();
  const navigate = useNavigate();

  const [room, setRoom] = useState<AgentRoom | null>(null);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [recentGames, setRecentGames] = useState<FinishedGame[]>([]);
  const [stats, setStats] = useState<RoomStats | null>(null);
  const [chartData, setChartData] = useState<ChartDay[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Interactive UI state
  const [activeTab, setActiveTab] = useState<'overview' | 'live' | 'report' | 'qr'>('overview');
  const [chartMetric, setChartMetric] = useState<'games' | 'commission' | 'volume'>('games');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [reportSearchQuery, setReportSearchQuery] = useState('');

  if (user?.role !== 'agent') {
    return <Navigate to="/" replace />;
  }

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  const roomInviteLink = room
    ? `https://t.me/${botUsername}?start=room_${room.id}`
    : `https://t.me/${botUsername}?start=ref_${user?.telegram_id}`;

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
      WebApp.HapticFeedback.impactOccurred(style);
    }
  };

  const triggerSuccessHaptic = () => {
    if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
      WebApp.HapticFeedback.notificationOccurred('success');
    }
  };

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
      setRecentGames(data.recent_games || []);
      setStats(data.stats || null);
      setChartData(data.chart_data || []);
      setLastRefresh(new Date());

      // Default selected day in chart to today (last item)
      if (data.chart_data && data.chart_data.length > 0) {
        setSelectedDayIndex(data.chart_data.length - 1);
      }
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleManualRefresh = async () => {
    triggerHaptic('medium');
    setRefreshing(true);
    await Promise.all([fetchData(), fetchUser()]);
  };

  useEffect(() => {
    fetchData();
    fetchUser();
    const interval = setInterval(() => {
      fetchData();
      fetchUser();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyRoomLink = () => {
    navigator.clipboard.writeText(roomInviteLink).then(() => {
      setCopiedLink(true);
      triggerSuccessHaptic();
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleShareRoom = () => {
    triggerHaptic('medium');
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

  // Filtered games report
  const filteredReportGames = useMemo(() => {
    if (!reportSearchQuery.trim()) return recentGames;
    const q = reportSearchQuery.toLowerCase();
    return recentGames.filter(
      (g) =>
        g.winner_first_name.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q) ||
        formatGameId(g.id).toLowerCase().includes(q) ||
        g.stake.toString().includes(q)
    );
  }, [recentGames, reportSearchQuery]);

  // Chart computations
  const maxChartValue = useMemo(() => {
    if (!chartData || chartData.length === 0) return 10;
    const values = chartData.map((d) => {
      if (chartMetric === 'games') return d.games_count;
      if (chartMetric === 'commission') return d.commission;
      return d.volume;
    });
    const max = Math.max(...values, 0);
    return max === 0 ? 10 : max;
  }, [chartData, chartMetric]);

  const selectedDay = useMemo(() => {
    if (selectedDayIndex === null || !chartData[selectedDayIndex]) {
      return chartData[chartData.length - 1] || null;
    }
    return chartData[selectedDayIndex];
  }, [selectedDayIndex, chartData]);

  const statusColor = (status: string) => {
    if (status === 'active') return 'bg-emerald-500/15 text-emerald-700 border-emerald-300';
    if (status === 'paused') return 'bg-amber-500/15 text-amber-700 border-amber-300';
    return 'bg-slate-200 text-slate-700 border-slate-300';
  };

  const statusIcon = (status: string) => {
    if (status === 'active') return <Wifi size={11} className="text-emerald-600 animate-pulse" />;
    if (status === 'paused') return <Clock size={11} className="text-amber-600" />;
    return <WifiOff size={11} className="text-slate-400" />;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 select-none pb-24 font-sans">
      {/* ─── STICKY TOP APP BAR (Mobile-First) ─── */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Agent Avatar & Profile info */}
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-400 flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-orange-200">
              {(user?.first_name || 'A').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-sm font-black text-slate-900 leading-tight">
                  {user?.first_name || 'Agent'}
                </span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center space-x-0.5">
                  <ShieldCheck size={10} />
                  <span>AGENT</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium truncate max-w-[130px]">
                {user?.username ? `@${user.username}` : `ID: ${user?.telegram_id}`}
              </p>
            </div>
          </div>

          {/* Right: Live Wallet Balance from users table */}
          <div className="flex items-center space-x-2.5">
            <div className="text-right">
              <div className="flex items-center justify-end space-x-1 text-slate-400">
                <Wallet size={11} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Wallet</span>
              </div>
              <p className="text-sm font-black text-emerald-600 leading-tight">
                {(user?.main_balance ?? 0).toLocaleString()} <span className="text-[10px] font-extrabold">ETB</span>
              </p>
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-all shadow-2xs"
              title="Refresh Balance & Games"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-orange-500' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Error notification */}
        {error && (
          <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 shadow-2xs">
            <AlertCircle size={15} className="text-rose-500 shrink-0" />
            <p className="text-xs text-rose-700 font-bold">{error}</p>
          </div>
        )}

        {/* ─── REDESIGNED HERO SECTION: ADVANCED OFFICIAL ROOM BANNER ─── */}
        {room ? (
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-yellow-500/15 border-2 border-orange-200 rounded-3xl p-4.5 shadow-sm space-y-3.5">
            {/* Ambient background glows */}
            <div className="absolute -top-12 -right-12 w-44 h-44 bg-gradient-to-br from-orange-400/20 to-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-amber-400/15 rounded-full blur-2xl pointer-events-none" />

            {/* Top Badge Strip */}
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-200" />
                <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">
                  Live Agent Room
                </span>
                {room.is_pinned && (
                  <span className="inline-flex items-center space-x-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-2xs">
                    <span>📌</span>
                    <span>PINNED</span>
                  </span>
                )}
              </div>

              <div className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${statusColor(room.status)}`}>
                {statusIcon(room.status)}
                <span>{room.status.toUpperCase()}</span>
              </div>
            </div>

            {/* Room Name & Profile Title */}
            <div className="relative z-10 text-center space-y-1 py-0.5">
              <div className="inline-flex items-center space-x-1 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <Building2 size={11} className="text-orange-500" />
                <span>Official Partner Room</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                {room.room_name}
              </h2>

              {/* Commission Highlight Pill */}
              <div className="pt-1 flex justify-center">
                <div className="inline-flex items-center space-x-1.5 bg-white/95 border border-orange-300 shadow-2xs px-3 py-1 rounded-full backdrop-blur-xs">
                  <Zap size={13} className="text-amber-500 fill-amber-500" />
                  <span className="text-xs font-black text-orange-600">
                    {room.commission_rate ?? 8}% Commission
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">• Pot House Cut</span>
                </div>
              </div>
            </div>

            {/* 4-Column Room Stats Grid inside Hero */}
            <div className="relative z-10 grid grid-cols-4 gap-1.5 bg-white/80 p-2.5 rounded-2xl border border-orange-200/70 backdrop-blur-xs text-center shadow-2xs">
              <div className="space-y-0.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Players</p>
                <p className="text-xs font-black text-slate-900">{stats?.total_referred_players ?? room.total_players ?? 0}</p>
              </div>
              <div className="space-y-0.5 border-l border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Total Games</p>
                <p className="text-xs font-black text-slate-900">{stats?.total_games_finished ?? room.total_games ?? 0}</p>
              </div>
              <div className="space-y-0.5 border-l border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Today</p>
                <p className="text-xs font-black text-orange-600">{stats?.today_games ?? 0} gms</p>
              </div>
              <div className="space-y-0.5 border-l border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Earnings</p>
                <p className="text-xs font-black text-emerald-600">+{stats?.total_commission_all_time ?? 0}</p>
              </div>
            </div>

            {/* Enter Room & Share Action Buttons */}
            <div className="relative z-10 flex space-x-2 pt-0.5">
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  navigate(`/bingo/live?room=${room.id}`);
                }}
                className="flex-1 py-3 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-orange-500/25 active:scale-98 transition-all"
              >
                <Play size={14} fill="currentColor" />
                <span>Enter Room & Play</span>
              </button>

              <button
                onClick={handleShareRoom}
                className="px-3.5 py-3 bg-white hover:bg-orange-50 border border-orange-300 text-orange-700 rounded-2xl font-black text-xs flex items-center justify-center space-x-1 active:scale-95 transition-all shadow-2xs"
                title="Share Room link"
              >
                <Share2 size={14} />
                <span>Share</span>
              </button>

              <button
                onClick={handleCopyRoomLink}
                className={`px-3.5 py-3 rounded-2xl font-black text-xs flex items-center justify-center space-x-1 border transition-all active:scale-95 shadow-2xs ${
                  copiedLink
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-orange-50 text-slate-700 border-orange-200'
                }`}
                title="Copy Room Link"
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedLink ? 'Copied' : 'Link'}</span>
              </button>
            </div>
          </div>
        ) : !loading && (
          <div className="bg-white rounded-3xl p-8 border border-gray-100 text-center space-y-3 shadow-sm">
            <Building2 size={36} className="mx-auto text-slate-300" />
            <p className="text-sm font-black text-slate-800">No Room Assigned Yet</p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              You haven't been assigned an official partner room yet. Contact the system administrator to configure your room!
            </p>
          </div>
        )}

        {/* ─── TAB NAVIGATION BAR (Mobile-First Pills) ─── */}
        {room && (
          <div className="flex bg-slate-200/80 p-1 rounded-2xl space-x-1 text-[11px] font-black">
            <button
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('overview');
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                activeTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 size={13} className={activeTab === 'overview' ? 'text-orange-500' : ''} />
              <span>Analytics</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('live');
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1 relative ${
                activeTab === 'live'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Gamepad2 size={13} className={activeTab === 'live' ? 'text-orange-500' : ''} />
              <span>Live ({activeGames.length})</span>
              {activeGames.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('report');
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                activeTab === 'report'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Trophy size={13} className={activeTab === 'report' ? 'text-amber-500' : ''} />
              <span>Report</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('qr');
              }}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                activeTab === 'qr'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="QR & Invite"
            >
              <QrCode size={13} className={activeTab === 'qr' ? 'text-orange-500' : ''} />
            </button>
          </div>
        )}

        {/* ─── TAB 1: OVERVIEW & ADVANCED PERFORMANCE GRAPH ─── */}
        {room && activeTab === 'overview' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* ADVANCED PERFORMANCE GRAPH CARD */}
            <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-1 text-slate-800">
                    <TrendingUp size={15} className="text-orange-500" />
                    <h3 className="text-xs font-black uppercase tracking-wider">
                      Room Activity & Trends
                    </h3>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">Last 7 Days Room Performance</p>
                </div>

                {/* Metric Selector Pills */}
                <div className="flex bg-slate-100 p-0.5 rounded-xl space-x-0.5 text-[9px] font-black">
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setChartMetric('games');
                    }}
                    className={`px-2 py-1 rounded-lg transition-all ${
                      chartMetric === 'games' ? 'bg-orange-500 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Games
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setChartMetric('commission');
                    }}
                    className={`px-2 py-1 rounded-lg transition-all ${
                      chartMetric === 'commission' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Comm (ETB)
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setChartMetric('volume');
                    }}
                    className={`px-2 py-1 rounded-lg transition-all ${
                      chartMetric === 'volume' ? 'bg-slate-800 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Pot (ETB)
                  </button>
                </div>
              </div>

              {/* Interactive SVG Bar & Trend Chart */}
              <div className="pt-2">
                <div className="h-36 flex items-end justify-between space-x-2 px-1">
                  {chartData.map((d, idx) => {
                    const val =
                      chartMetric === 'games'
                        ? d.games_count
                        : chartMetric === 'commission'
                        ? d.commission
                        : d.volume;

                    const heightPercent = maxChartValue > 0 ? Math.max(10, Math.round((val / maxChartValue) * 100)) : 10;
                    const isSelected = selectedDayIndex === idx;

                    return (
                      <div
                        key={d.date}
                        onClick={() => {
                          triggerHaptic('light');
                          setSelectedDayIndex(idx);
                        }}
                        className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                      >
                        {/* Bar Value Tooltip on top */}
                        <span
                          className={`text-[8px] font-black mb-1 transition-all ${
                            isSelected
                              ? 'text-slate-900 scale-110'
                              : 'text-slate-400 opacity-70 group-hover:opacity-100'
                          }`}
                        >
                          {chartMetric === 'games' ? val : Math.round(val)}
                        </span>

                        {/* Bar Pillar */}
                        <div className="w-full max-w-[28px] bg-slate-100 rounded-xl overflow-hidden flex flex-col justify-end h-[100px] p-0.5">
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={`w-full rounded-lg transition-all duration-300 ${
                              chartMetric === 'games'
                                ? isSelected
                                  ? 'bg-gradient-to-t from-orange-600 to-amber-400 shadow-xs'
                                  : 'bg-gradient-to-t from-orange-300 to-amber-200 group-hover:from-orange-400 group-hover:to-amber-300'
                                : chartMetric === 'commission'
                                ? isSelected
                                  ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-xs'
                                  : 'bg-gradient-to-t from-emerald-300 to-teal-200 group-hover:from-emerald-400 group-hover:to-teal-300'
                                : isSelected
                                ? 'bg-gradient-to-t from-slate-900 to-slate-700 shadow-xs'
                                : 'bg-gradient-to-t from-slate-300 to-slate-200 group-hover:from-slate-400 group-hover:to-slate-300'
                            }`}
                          />
                        </div>

                        {/* Day Label on X Axis */}
                        <span
                          className={`text-[9px] mt-1.5 font-black uppercase transition-colors ${
                            isSelected ? 'text-orange-600' : 'text-slate-400'
                          }`}
                        >
                          {d.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day Details Tooltip Strip */}
              {selectedDay && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-[10px]">
                      {selectedDay.label}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">
                        {selectedDay.date}
                      </p>
                      <p className="text-xs font-black text-slate-800 mt-0.5">
                        {selectedDay.games_count} {selectedDay.games_count === 1 ? 'Game' : 'Games'} Finished
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Commission</p>
                    <p className="text-xs font-black text-emerald-600 mt-0.5">
                      +{selectedDay.commission} ETB
                    </p>
                  </div>
                </div>
              )}

              {/* Summary Strip */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-center">
                <div className="bg-slate-50/70 p-2 rounded-xl">
                  <span className="text-[9px] text-slate-400 font-bold uppercase">Today's Earned:</span>{' '}
                  <span className="text-xs font-black text-emerald-600">+{stats?.today_commission ?? 0} ETB</span>
                </div>
                <div className="bg-slate-50/70 p-2 rounded-xl">
                  <span className="text-[9px] text-slate-400 font-bold uppercase">7-Day Total Pot:</span>{' '}
                  <span className="text-xs font-black text-slate-800">
                    {chartData.reduce((acc, c) => acc + c.volume, 0).toLocaleString()} ETB
                  </span>
                </div>
              </div>
            </div>

            {/* 4 LIVE AGENT METRIC CARDS */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Active Games */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-2xs shrink-0">
                  <Gamepad2 size={18} />
                </div>
                <div>
                  <p className="text-lg font-black text-slate-900 leading-none">{activeGames.length}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Active Games</p>
                </div>
              </div>

              {/* Live Players */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-2xs shrink-0">
                  <Users size={18} />
                </div>
                <div>
                  <p className="text-lg font-black text-slate-900 leading-none">
                    {activeGames.reduce((sum, g) => sum + (g.total_players || 0), 0)}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Live Players</p>
                </div>
              </div>

              {/* Main Wallet Balance */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-2xs shrink-0">
                  <Wallet size={18} />
                </div>
                <div>
                  <p className="text-lg font-black text-emerald-600 leading-none">
                    {(user?.main_balance ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Wallet (ETB)</p>
                </div>
              </div>

              {/* Total Room Volume */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shadow-2xs shrink-0">
                  <Trophy size={18} />
                </div>
                <div>
                  <p className="text-lg font-black text-purple-600 leading-none">
                    {(stats?.total_volume_all_time ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Pot Volume</p>
                </div>
              </div>
            </div>

            {/* QUICK INVITE LINK BANNER */}
            <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs flex items-center justify-between space-x-2">
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <DoorOpen size={16} className="text-orange-500 shrink-0" />
                <span className="font-mono text-[11px] text-slate-600 truncate select-all">{roomInviteLink}</span>
              </div>
              <button
                onClick={handleCopyRoomLink}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1 transition-all active:scale-95 ${
                  copiedLink
                    ? 'bg-emerald-600 text-white'
                    : 'bg-orange-500 hover:bg-orange-600 text-white shadow-xs'
                }`}
              >
                {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ─── TAB 2: LIVE GAMES IN ROOM ─── */}
        {room && activeTab === 'live' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  Active Tables ({activeGames.length})
                </h3>
                <p className="text-[10px] text-slate-400">Games currently open for players in your room</p>
              </div>
              <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                Auto-Managed
              </span>
            </div>

            {activeGames.length > 0 ? (
              <div className="space-y-2.5">
                {activeGames.map((game) => {
                  const estPot = game.prize_pool || game.stake * (game.total_players || 0);
                  const estComm = (estPot * (room.commission_rate ?? 8)) / 100;
                  return (
                    <div
                      key={game.id}
                      className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-2.5 hover:border-orange-200 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex flex-col items-center justify-center font-black leading-none shrink-0">
                            <span className="text-xs">{game.stake}</span>
                            <span className="text-[8px] font-bold">ETB</span>
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-xs font-black text-slate-800">
                                Stake: {game.stake} ETB
                              </span>
                              <span
                                className={`text-[9px] font-black px-1.5 py-0.2 rounded-full border ${
                                  game.status === 'calling'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                {game.status === 'calling' ? 'Calling Live' : 'Waiting Players'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                              👥 {game.total_players} players registered
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center justify-end space-x-1 text-slate-800">
                            <Trophy size={13} className="text-amber-500" />
                            <span className="text-xs font-black">{game.prize_pool || 0} ETB</span>
                          </div>
                          <p className="text-[9px] text-emerald-600 font-bold mt-0.5">
                            +{Number(estComm.toFixed(1))} ETB est. cut
                          </p>
                        </div>
                      </div>

                      {/* Direct Play/Spectate Button */}
                      <button
                        onClick={() => {
                          triggerHaptic('light');
                          navigate(`/bingo/live?game=${game.id}&room=${room.id}`);
                        }}
                        className="w-full py-2 bg-slate-50 hover:bg-orange-50 text-slate-700 hover:text-orange-600 border border-slate-200 rounded-xl text-xs font-black flex items-center justify-center space-x-1 transition-all active:scale-98"
                      >
                        <Play size={12} fill="currentColor" />
                        <span>Enter This Table</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-8 border border-dashed border-slate-200 text-center space-y-2 shadow-2xs">
                <Gamepad2 size={32} className="mx-auto text-slate-300" />
                <p className="text-xs font-black text-slate-600">No active tables right now</p>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                  New games are auto-created when players join your room or enter through your invite link.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: GAMES & COMMISSION REPORT (The Full Room Game History) ─── */}
        {room && activeTab === 'report' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  Finished Games Report
                </h3>
                <p className="text-[10px] text-slate-400">
                  Every game pot and commission earned in your room
                </p>
              </div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {recentGames.length} Finished
              </span>
            </div>

            {/* Search Games Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by game ID, winner name, stake..."
                value={reportSearchQuery}
                onChange={(e) => setReportSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-orange-500 shadow-2xs"
              />
            </div>

            {filteredReportGames.length > 0 ? (
              <div className="space-y-2">
                {filteredReportGames.map((game) => {
                  const finishedDate = new Date(game.finished_at || game.created_at);
                  const formattedTime = finishedDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={game.id}
                      className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs space-y-2 hover:border-orange-200 transition-all"
                    >
                      {/* Top line: Game ID & Time */}
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-black text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md">
                            #{formatGameId(game.id)}
                          </span>
                          <span className="text-slate-400">{formattedTime}</span>
                        </div>

                        {/* Commission Badge */}
                        <div className="inline-flex items-center space-x-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-emerald-700 font-black">
                          <DollarSign size={11} className="text-emerald-600" />
                          <span>+{game.agent_commission} ETB</span>
                          <span className="text-[8px] font-bold text-emerald-500">
                            ({game.commission_rate ?? 8}%)
                          </span>
                        </div>
                      </div>

                      {/* Middle line: Winner & Pot details */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl text-[10px]">
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Winner</p>
                          <p className="font-black text-slate-800 truncate">
                            🏆 {game.winner_first_name}
                            {game.winner_cartela && (
                              <span className="text-[9px] font-normal text-slate-500"> (#{game.winner_cartela})</span>
                            )}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Pot / Stake</p>
                          <p className="font-black text-slate-800">
                            {game.prize_pool} ETB <span className="text-slate-400 font-normal">(@{game.stake})</span>
                          </p>
                        </div>
                      </div>

                      {/* Bottom line: player count & verified cut */}
                      <div className="flex items-center justify-between text-[9px] text-slate-400 pt-0.5 px-0.5">
                        <span>👥 {game.total_players} players participating</span>
                        <span className="text-emerald-600 font-bold">Credited to Wallet ✅</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 border border-slate-100 text-center space-y-1.5 shadow-2xs">
                <Trophy size={24} className="mx-auto text-slate-300" />
                <p className="text-xs font-black text-slate-600">No games found</p>
                <p className="text-[10px] text-slate-400">
                  {reportSearchQuery ? `No results for "${reportSearchQuery}"` : 'Games played in your room will be logged here.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 4: ROOM LINK & QR CODE MODAL / TAB ─── */}
        {room && activeTab === 'qr' && (
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 animate-in fade-in duration-200 text-center">
            <div className="space-y-1">
              <div className="inline-flex p-2 rounded-2xl bg-orange-100 text-orange-600 mb-1">
                <QrCode size={24} />
              </div>
              <h3 className="text-base font-black text-slate-800">
                Invite Players to {room.room_name}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Players who scan this QR code or click your link will automatically enter your room and earn you continuous game commission!
              </p>
            </div>

            {/* QR Code Canvas */}
            <div className="flex justify-center p-4 bg-slate-50 border-2 border-orange-100 rounded-3xl w-fit mx-auto shadow-inner">
              <QRCodeCanvas
                value={roomInviteLink}
                size={180}
                bgColor="#f8fafc"
                fgColor="#0f172a"
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Link display & copy */}
            <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
              <span className="font-mono text-[11px] text-slate-600 truncate mr-2 select-all">
                {roomInviteLink}
              </span>
              <button
                onClick={handleCopyRoomLink}
                className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all active:scale-95 ${
                  copiedLink ? 'bg-emerald-600 text-white' : 'bg-orange-500 text-white'
                }`}
              >
                {copiedLink ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Share to Telegram button */}
            <button
              onClick={handleShareRoom}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-2 shadow-md shadow-orange-500/20 active:scale-98 transition-all"
            >
              <Share2 size={15} />
              <span>Share to Telegram Chat / Channels</span>
            </button>

            {/* Commission Rule Info */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 text-left space-y-1.5">
              <div className="flex items-center space-x-1.5 text-amber-800 font-black text-[11px]">
                <Info size={13} className="text-amber-600" />
                <span>How Your Agent Commission Works</span>
              </div>
              <ul className="text-[10px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                <li>Winner always takes <b>80% of the game pot</b> (standard bingo prize).</li>
                <li>From the platform's 20% house fee, you receive <b>{room.commission_rate ?? 8}% directly credited</b> to your Main Wallet.</li>
                <li>Commission is awarded automatically at the moment each game finishes.</li>
              </ul>
            </div>
          </div>
        )}

        {/* ─── FOOTER SYNC BAR ─── */}
        <div className="flex flex-col items-center space-y-1 pt-2 text-center">
          <p className="text-[10px] text-slate-400 font-medium">
            Last synced: {lastRefresh.toLocaleTimeString()} · Realtime Auto-Refresh Active
          </p>
          <p className="text-[9px] text-slate-400 font-semibold">
            🇪🇹 HDASE BINGO • Official Agent Room Network
          </p>
        </div>
      </div>
    </div>
  );
}
