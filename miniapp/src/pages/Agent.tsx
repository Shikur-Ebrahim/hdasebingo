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
  const [reportPeriod, setReportPeriod] = useState<'all' | 'today' | 'yesterday' | 'weekly' | 'monthly'>('all');
  const [reportStake, setReportStake] = useState<number | 'all'>('all');
  const [selectedLiveStake, setSelectedLiveStake] = useState<number | null>(null);

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

  const availableStakes = useMemo(() => {
    const set = new Set<number>();
    recentGames.forEach((g) => {
      if (g.stake) set.add(Number(g.stake));
    });
    const sorted = Array.from(set).sort((a, b) => a - b);
    return sorted.length > 0 ? sorted : [10, 20, 50, 100];
  }, [recentGames]);

  // Filtered games report by Search + Stake + Period Category
  const filteredReportGames = useMemo(() => {
    return recentGames.filter((g) => {
      // 1. Search filter
      if (reportSearchQuery.trim()) {
        const q = reportSearchQuery.toLowerCase();
        const matchSearch =
          g.winner_first_name.toLowerCase().includes(q) ||
          g.id.toLowerCase().includes(q) ||
          formatGameId(g.id).toLowerCase().includes(q) ||
          g.stake.toString().includes(q);
        if (!matchSearch) return false;
      }

      // 2. Stake filter
      if (reportStake !== 'all' && Number(g.stake) !== Number(reportStake)) {
        return false;
      }

      // 3. Period category filter
      if (reportPeriod !== 'all') {
        const gDate = new Date(g.finished_at || g.created_at);
        const now = new Date();

        if (reportPeriod === 'today') {
          const isToday =
            gDate.getDate() === now.getDate() &&
            gDate.getMonth() === now.getMonth() &&
            gDate.getFullYear() === now.getFullYear();
          if (!isToday) return false;
        } else if (reportPeriod === 'yesterday') {
          const yesterday = new Date();
          yesterday.setDate(now.getDate() - 1);
          const isYesterday =
            gDate.getDate() === yesterday.getDate() &&
            gDate.getMonth() === yesterday.getMonth() &&
            gDate.getFullYear() === yesterday.getFullYear();
          if (!isYesterday) return false;
        } else if (reportPeriod === 'weekly') {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          if (gDate < weekAgo) return false;
        } else if (reportPeriod === 'monthly') {
          const monthAgo = new Date();
          monthAgo.setDate(now.getDate() - 30);
          if (gDate < monthAgo) return false;
        }
      }

      return true;
    });
  }, [recentGames, reportSearchQuery, reportStake, reportPeriod]);

  const filteredCommissionSum = useMemo(() => {
    return filteredReportGames.reduce((acc, g) => acc + (Number(g.agent_commission) || 0), 0);
  }, [filteredReportGames]);

  const filteredPotSum = useMemo(() => {
    return filteredReportGames.reduce((acc, g) => acc + (Number(g.prize_pool) || 0), 0);
  }, [filteredReportGames]);

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

  // ─── LOADING SKELETON ───
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col select-none font-sans">
        {/* Skeleton top bar */}
        <div className="bg-white border-b border-gray-100 px-4 py-2.5 shadow-2xs">
          <div className="flex items-center justify-between max-w-md mx-auto">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 bg-slate-200 rounded-full animate-pulse" />
                <div className="h-2 w-16 bg-slate-100 rounded-full animate-pulse" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-8 w-16 bg-slate-200 rounded-xl animate-pulse" />
              <div className="w-8 h-8 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>

        {/* Skeleton body */}
        <div className="max-w-md mx-auto w-full p-4 space-y-3.5">
          {/* Tab nav skeleton */}
          <div className="h-10 bg-slate-200/80 rounded-2xl animate-pulse" />

          {/* Chart card skeleton */}
          <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-3.5">
            <div className="space-y-1.5">
              <div className="h-3 w-40 bg-slate-200 rounded-full animate-pulse" />
              <div className="h-2 w-28 bg-slate-100 rounded-full animate-pulse" />
            </div>
            <div className="h-8 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="h-36 flex items-end justify-between space-x-2 px-1 pt-2">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center h-full justify-end space-y-1.5">
                  <div
                    className="w-full max-w-[28px] bg-slate-200 rounded-lg animate-pulse"
                    style={{ height: `${20 + Math.random() * 60}%` }}
                  />
                  <div className="h-2 w-4 bg-slate-100 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          </div>

          {/* Card skeletons */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs space-y-2.5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-3/4 bg-slate-200 rounded-full animate-pulse" />
                  <div className="h-2 w-1/2 bg-slate-100 rounded-full animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-slate-100 rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Centered spinner badge */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-white px-4 py-2 rounded-full shadow-lg border border-orange-100">
          <RefreshCw size={14} className="animate-spin text-orange-500" />
          <span className="text-xs font-black text-slate-600">Loading your room...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 select-none pb-24 font-sans">

      {/* ─── STICKY TOP APP BAR (Mobile-First) ─── */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Agent Avatar & Profile / Room info */}
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-400 flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-orange-200 shrink-0">
              {(user?.first_name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-sm font-black text-slate-900 leading-tight truncate">
                  {room?.room_name || user?.first_name || 'Agent'}
                </span>
                <span className="inline-flex items-center space-x-0.5 text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <Zap size={10} className="text-emerald-500 fill-emerald-500" />
                  <span>{room?.commission_rate ?? 8}% Commission</span>
                </span>
              </div>

            </div>
          </div>

          {/* Right: Live Wallet Balance & Refresh */}
          <div className="flex items-center space-x-2.5 shrink-0">
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

      <div className="max-w-md mx-auto p-4 space-y-3.5">
        {/* Error notification */}
        {error && (
          <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 shadow-2xs">
            <AlertCircle size={15} className="text-rose-500 shrink-0" />
            <p className="text-xs text-rose-700 font-bold">{error}</p>
          </div>
        )}

        {!room && !loading && (
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
              {/* Header Title full width */}
              <div className="space-y-0.5">
                <div className="flex items-center space-x-1.5 text-slate-800">
                  <TrendingUp size={16} className="text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Room Activity & Trends
                  </h3>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">Last 7 Days Room Performance</p>
              </div>

              {/* Metric Selector 3 Horizontal Buttons Below the Text */}
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl text-[10px] font-black">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setChartMetric('games');
                  }}
                  className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                    chartMetric === 'games'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Gamepad2 size={12} />
                  <span>Games</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setChartMetric('commission');
                  }}
                  className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                    chartMetric === 'commission'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingUp size={12} />
                  <span>Comm (ETB)</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setChartMetric('volume');
                  }}
                  className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                    chartMetric === 'volume'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Trophy size={12} />
                  <span>Pot (ETB)</span>
                </button>
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
          </div>
        )}

        {/* ─── TAB 2: LIVE — STAKE PRESET ROOM MONITOR ─── */}
        {room && activeTab === 'live' && (() => {
          const STAKE_PRESETS = [10, 20, 50, 100];
          // Build full stake list: union of presets + any active game stakes
          const allStakes = Array.from(new Set([
            ...STAKE_PRESETS,
            ...activeGames.map((g) => Number(g.stake)),
          ])).sort((a, b) => a - b);

          // Find the active game for a given stake
          const gameForStake = (stk: number) =>
            activeGames.find((g) => Number(g.stake) === stk) || null;

          // If a stake is selected, show detail view
          if (selectedLiveStake !== null) {
            const detailGame = gameForStake(selectedLiveStake);
            const estPot = detailGame
              ? detailGame.prize_pool || detailGame.stake * (detailGame.total_players || 0)
              : 0;
            const estComm = (estPot * (room.commission_rate ?? 8)) / 100;
            const lastWin = recentGames.find((g) => Number(g.stake) === selectedLiveStake);

            return (
              <div className="space-y-3 animate-in fade-in duration-200">
                {/* Back button header */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => { triggerHaptic('light'); setSelectedLiveStake(null); }}
                    className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all shadow-2xs shrink-0"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                  </button>
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      {selectedLiveStake} ETB Table Monitor
                    </h3>
                    <p className="text-[10px] text-slate-400">Live room control panel</p>
                  </div>
                </div>

                {detailGame ? (
                  <>
                    {/* Live Status Header Card */}
                    <div className={`rounded-2xl p-4 space-y-3 border shadow-sm ${
                      detailGame.status === 'calling'
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400 text-white'
                        : 'bg-gradient-to-br from-amber-400 to-orange-500 border-amber-300 text-white'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-1.5">
                            {detailGame.status === 'calling'
                              ? <Wifi size={13} className="animate-pulse" />
                              : <Clock size={13} />
                            }
                            <span className="text-xs font-black uppercase tracking-wider">
                              {detailGame.status === 'calling' ? 'CALLING LIVE' : 'WAITING FOR PLAYERS'}
                            </span>
                          </div>
                          <p className="text-[10px] font-medium opacity-80 mt-0.5">
                            Game #{formatGameId(detailGame.id)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black leading-none">{selectedLiveStake}</p>
                          <p className="text-[10px] font-black opacity-80">ETB STAKE</p>
                        </div>
                      </div>

                      {/* 3 Quick Stats */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white/20 rounded-xl p-2 text-center">
                          <p className="text-base font-black leading-none">{detailGame.total_players}</p>
                          <p className="text-[9px] font-bold opacity-80 mt-0.5">Players</p>
                        </div>
                        <div className="bg-white/20 rounded-xl p-2 text-center">
                          <p className="text-base font-black leading-none">{detailGame.prize_pool || estPot}</p>
                          <p className="text-[9px] font-bold opacity-80 mt-0.5">Pot (ETB)</p>
                        </div>
                        <div className="bg-white/20 rounded-xl p-2 text-center">
                          <p className="text-base font-black leading-none">{Number(estComm.toFixed(1))}</p>
                          <p className="text-[9px] font-bold opacity-80 mt-0.5">Your Cut</p>
                        </div>
                      </div>
                    </div>

                    {/* Commission Earned Card */}
                    <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                            <TrendingUp size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Est. Agent Commission</p>
                            <p className="text-sm font-black text-emerald-600">+{Number(estComm.toFixed(2))} ETB</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-slate-400 font-medium">Rate</p>
                          <p className="text-xs font-black text-slate-800">{room.commission_rate ?? 8}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Game Status Info */}
                    <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs space-y-2">
                      <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Active Players</p>
                      <div className="flex items-center space-x-2">
                        <div className="flex -space-x-2">
                          {[...Array(Math.min(detailGame.total_players, 5))].map((_, i) => (
                            <div key={i} className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white ${
                              ['bg-orange-400', 'bg-emerald-400', 'bg-blue-400', 'bg-purple-400', 'bg-amber-400'][i % 5]
                            }`}>
                              {i + 1}
                            </div>
                          ))}
                          {detailGame.total_players > 5 && (
                            <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-300 flex items-center justify-center text-[9px] font-black text-slate-700">
                              +{detailGame.total_players - 5}
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-semibold">
                          {detailGame.total_players} player{detailGame.total_players !== 1 ? 's' : ''} registered for this game
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  /* No Active Game — Show Last Winner for this stake */
                  <div className="bg-white rounded-2xl p-4 border border-dashed border-slate-200 text-center space-y-2 shadow-2xs">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center">
                      <Gamepad2 size={24} className="text-slate-300" />
                    </div>
                    <p className="text-xs font-black text-slate-600">No Active Game at {selectedLiveStake} ETB</p>
                    <p className="text-[10px] text-slate-400">
                      Players join via your room link to start a new table.
                    </p>
                  </div>
                )}

                {/* Last Winner for this stake */}
                {lastWin && (
                  <div className="bg-white rounded-2xl p-3.5 border border-amber-100 shadow-2xs space-y-1.5">
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                      <Trophy size={11} className="text-amber-500" />
                      <span>Last Winner at {selectedLiveStake} ETB</span>
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-800">🏆 {lastWin.winner_first_name}</p>
                        {lastWin.winner_cartela && (
                          <p className="text-[10px] text-slate-400">Cartela #{lastWin.winner_cartela}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-amber-600">{lastWin.winner_prize} ETB</p>
                        <p className="text-[9px] text-emerald-600 font-bold">Your cut: +{lastWin.agent_commission} ETB</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // ── STAKE PRESET CARD GRID ──
          return (
            <div className="space-y-3 animate-in fade-in duration-200">
              {/* Header */}
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Room Live Monitor
                  </h3>
                  <p className="text-[10px] text-slate-400">Tap a stake table to monitor its game</p>
                </div>
                {activeGames.length > 0 && (
                  <span className="flex items-center space-x-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    <span>{activeGames.length} Live</span>
                  </span>
                )}
              </div>

              {/* Stake Preset Grid — 2×2 */}
              <div className="grid grid-cols-2 gap-2.5">
                {allStakes.map((stk) => {
                  const game = gameForStake(stk);
                  const isLive = !!game;
                  const estPot = game ? (game.prize_pool || stk * (game.total_players || 0)) : 0;
                  const estComm = (estPot * (room.commission_rate ?? 8)) / 100;
                  const lastW = recentGames.find((g) => Number(g.stake) === stk);

                  return (
                    <button
                      key={stk}
                      onClick={() => {
                        triggerHaptic('medium');
                        setSelectedLiveStake(stk);
                      }}
                      className={`rounded-2xl p-4 border text-left space-y-3 active:scale-[.97] transition-all shadow-sm ${
                        isLive
                          ? game?.status === 'calling'
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400 text-white'
                            : 'bg-gradient-to-br from-orange-400 to-amber-500 border-orange-300 text-white'
                          : 'bg-white border-slate-200 hover:border-orange-200'
                      }`}
                    >
                      {/* Stake label + status */}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className={`text-2xl font-black leading-none ${isLive ? 'text-white' : 'text-slate-800'}`}>
                            {stk}
                          </p>
                          <p className={`text-[9px] font-black ${isLive ? 'text-white/80' : 'text-slate-400'}`}>
                            ETB STAKE
                          </p>
                        </div>
                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-black border ${
                          isLive
                            ? game?.status === 'calling'
                              ? 'bg-white/20 text-white border-white/30'
                              : 'bg-white/20 text-white border-white/30'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {isLive
                            ? game?.status === 'calling' ? '🔴 LIVE' : '⏳ WAIT'
                            : '😴 IDLE'}
                        </div>
                      </div>

                      {/* Stats row */}
                      {isLive ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-white/70">Players</span>
                            <span className="text-xs font-black text-white">{game?.total_players ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-white/70">Est. Comm</span>
                            <span className="text-xs font-black text-white">+{Number(estComm.toFixed(1))} ETB</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400">Last Winner</span>
                            <span className="text-[9px] font-black text-slate-600 truncate max-w-[60px]">
                              {lastW ? lastW.winner_first_name : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400">Last Comm</span>
                            <span className="text-[9px] font-black text-emerald-600">
                              {lastW ? `+${lastW.agent_commission} ETB` : '—'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Arrow indicator */}
                      <div className={`flex items-center justify-end text-[9px] font-black ${isLive ? 'text-white/70' : 'text-slate-400'}`}>
                        <span>View Details</span>
                        <ChevronRight size={11} className="ml-0.5" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Quick Stats Strip */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs text-center">
                  <p className="text-sm font-black text-orange-500">{activeGames.length}</p>
                  <p className="text-[9px] text-slate-400 font-bold">Active Games</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs text-center">
                  <p className="text-sm font-black text-slate-800">
                    {activeGames.reduce((acc, g) => acc + (g.total_players || 0), 0)}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold">Live Players</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs text-center">
                  <p className="text-sm font-black text-emerald-600">
                    {activeGames.reduce((acc, g) => {
                      const pot = g.prize_pool || g.stake * (g.total_players || 0);
                      return acc + (pot * (room.commission_rate ?? 8)) / 100;
                    }, 0).toFixed(1)}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold">Est. Comm</p>
                </div>
              </div>
            </div>
          );
        })()}


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

            {/* Period Category Filter Pills */}
            <div className="flex space-x-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {[
                { key: 'all', label: 'All Time' },
                { key: 'today', label: 'Today' },
                { key: 'yesterday', label: 'Yesterday' },
                { key: 'weekly', label: 'This Week' },
                { key: 'monthly', label: 'This Month' },
              ].map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    triggerHaptic('light');
                    setReportPeriod(p.key as any);
                  }}
                  className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-black border transition-all ${
                    reportPeriod === p.key
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Stake Filter Pills */}
            <div className="flex space-x-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setReportStake('all');
                }}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black border transition-all ${
                  reportStake === 'all'
                    ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                }`}
              >
                All Stakes
              </button>
              {availableStakes.map((stk) => (
                <button
                  key={stk}
                  onClick={() => {
                    triggerHaptic('light');
                    setReportStake(stk);
                  }}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black border transition-all ${
                    reportStake === stk
                      ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                  }`}
                >
                  {stk} ETB
                </button>
              ))}
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

            {/* Filtered Summary Strip */}
            <div className="flex items-center justify-between bg-slate-100/90 px-3 py-1.5 rounded-xl text-[10px] text-slate-600 font-bold">
              <span>Showing {filteredReportGames.length} of {recentGames.length} games</span>
              <span className="text-emerald-700 font-black">
                Total Comm: +{filteredCommissionSum.toFixed(2)} ETB
              </span>
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


      </div>
    </div>
  );
}
