import { useEffect, useState, useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Gamepad2,
  Clock,
  Trophy,
  RefreshCw,
  Building2,
  AlertCircle,
  Share2,
  Copy,
  Check,
  Wallet,
  TrendingUp,
  BarChart3,
  Zap,
  Search,
  QrCode,
  Flame,
  ChevronRight,
  ChevronLeft,
  Download,
  CheckCircle2,
  Send,
  X,
  Layers,
  DoorOpen,
} from 'lucide-react';

interface PromotedRoom {
  id: string;
  room_name: string;
  agent_id?: string;
  agent_name?: string;
  total_players: number;
  total_games: number;
  status: 'active' | 'inactive' | 'paused';
  commission_rate?: number;
  promoter_commission_rate?: number;
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
  room_id?: string;
  room_name?: string;
  stake: number;
  total_players: number;
  prize_pool: number;
  winner_prize: number;
  winner_first_name: string;
  winner_cartela?: number | null;
  agent_commission: number; // promoter commission earned
  commission_rate: number; // promoter commission rate (3%)
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

interface PromoterStats {
  today_games: number;
  today_commission: number;
  total_games_finished: number;
  total_commission_all_time: number;
  total_volume_all_time: number;
  total_referred_players: number;
  promoter_commission_rate: number;
  total_promoted_rooms: number;
}

const API = import.meta.env.VITE_API_URL || '/api';

const formatGameId = (id: string | null | undefined): string => {
  if (!id) return '';
  return id.replace(/-/g, '').substring(0, 8).toUpperCase();
};

const formatAmount = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null || isNaN(Number(num))) return '0';
  const val = Number(num);
  if (Math.abs(val) >= 1_000_000) {
    const formatted = (val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 1);
    return `${formatted}M`;
  }
  if (Math.abs(val) >= 1_000) {
    const formatted = (val / 1_000).toFixed(val % 1_000 === 0 ? 0 : 1);
    return `${formatted}k`;
  }
  return val % 1 === 0 ? val.toString() : Number(val.toFixed(2)).toString();
};

export default function Promoter() {
  const { user, fetchUser } = useGameStore();
  const [promotedRooms, setPromotedRooms] = useState<PromotedRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<PromotedRoom | null>(null);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [recentGames, setRecentGames] = useState<FinishedGame[]>([]);
  const [stats, setStats] = useState<PromoterStats | null>(null);
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Tab navigation: 'analytics' | 'rooms' | 'report' | 'qr'
  const [activeTab, setActiveTab] = useState<'analytics' | 'rooms' | 'report' | 'qr'>('rooms');

  // When on 'rooms' tab: null = show all room cards; non-null = viewing that room's live stake tables!
  const [roomDetailMode, setRoomDetailMode] = useState<boolean>(false);

  // Analytics chart metric: 'games' (orange) | 'commission' (emerald green) | 'volume' (slate/black)
  const [chartMetric, setChartMetric] = useState<'games' | 'commission' | 'volume'>('games');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  // Report filter: Room category filter ('all' or specific room_id)
  const [reportRoomFilter, setReportRoomFilter] = useState<string>('all');
  const [reportSearchQuery, setReportSearchQuery] = useState('');

  // Live stake details modal
  const [selectedLiveStake, setSelectedLiveStake] = useState<number | null>(null);

  // Flyer actions
  const [downloadedQR, setDownloadedQR] = useState(false);
  const [isSavingFlyer, setIsSavingFlyer] = useState(false);
  const [flyerSentToTg, setFlyerSentToTg] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  if (user?.role !== 'promoter') {
    return <Navigate to="/" replace />;
  }

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  // Promoter's permanent invitation referral link (ALWAYS used for QR code!)
  const promoterRefCode = `ref_${user?.telegram_id || 'promoter'}`;
  const promoterInviteLink = `https://t.me/${botUsername}?start=${promoterRefCode}`;

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

  const fetchDashboardData = async (roomIdToFetch?: string) => {
    setError('');
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const targetRoomId = roomIdToFetch || selectedRoom?.id || '';
      const url = targetRoomId
        ? `${API}/player/promoter-dashboard?room_id=${targetRoomId}`
        : `${API}/player/promoter-dashboard`;

      const res = await fetch(url, {
        headers: { 'x-telegram-init-data': initData },
      });
      if (!res.ok) throw new Error('Failed to load promoter dashboard');
      const data = await res.json();

      setPromotedRooms(data.rooms || []);
      const active = data.selected_room || (data.rooms && data.rooms[0]) || null;
      setSelectedRoom(active);
      setActiveGames(data.active_games || []);
      setRecentGames(data.recent_games || []);
      setStats(data.stats || null);
      setChartData(data.chart_data || []);

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

  useEffect(() => {
    if (typeof WebApp !== 'undefined' && WebApp.BackButton) {
      WebApp.BackButton.hide();
    }
    fetchDashboardData();
    fetchUser();
    const interval = setInterval(() => {
      fetchDashboardData();
      fetchUser();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    triggerHaptic('medium');
    setRefreshing(true);
    await Promise.all([fetchDashboardData(selectedRoom?.id), fetchUser()]);
  };

  const handleOpenRoomDetail = (room: PromotedRoom) => {
    triggerHaptic('light');
    setSelectedRoom(room);
    setRoomDetailMode(true);
    fetchDashboardData(room.id);
  };

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(promoterInviteLink).then(() => {
      setCopiedLink(true);
      triggerSuccessHaptic();
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleShareInvite = () => {
    triggerHaptic('medium');
    const text = `🎮 Join HDASE BINGO with my official promoter invite!\n\n${promoterInviteLink}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(promoterInviteLink)}&text=${encodeURIComponent(text)}`);
    } else if (navigator.share) {
      navigator.share({ title: 'HDASE BINGO Promoter Invite', text, url: promoterInviteLink }).catch(() => {});
    } else {
      handleCopyInviteLink();
    }
  };

  // High-Res Flyer Generation using Promoter's Permanent Invitation Link
  const generateFlyerImage = (): string | null => {
    const qrCanvas = qrCanvasRef.current;
    if (!qrCanvas) return null;

    const width = 800;
    const height = 1150;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Double Gold Border
    ctx.strokeStyle = '#c59b27';
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, width - 44, height - 44);
    ctx.strokeStyle = '#e6c875';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(32, 32, width - 64, height - 64);

    // Monogram
    const emblemX = width / 2;
    const emblemY = 85;
    ctx.fillStyle = '#1a1409';
    ctx.beginPath();
    ctx.arc(emblemX, emblemY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#e5c158';
    ctx.font = 'bold 15px "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HB', emblemX, emblemY);
    ctx.textBaseline = 'alphabetic';

    // Title
    ctx.fillStyle = '#140f09';
    ctx.font = '900 40px "Times New Roman", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('HDASE BINGO', width / 2, 142);

    // Subtitle: Official Promoter Invitation
    ctx.fillStyle = '#8a6a1d';
    ctx.font = 'bold 13px sans-serif';
    const subText = `OFFICIAL PROMOTER • ${(user?.first_name || 'PROMOTER').toUpperCase()}`;
    ctx.fillText(subText, width / 2, 172);

    // Scan to Play
    ctx.fillStyle = '#17120a';
    ctx.font = '900 35px "Times New Roman", Georgia, sans-serif';
    ctx.fillText('SCAN TO PLAY', width / 2, 224);

    // Gold Ribbon
    const ribY = 248;
    const ribW = 540;
    const ribH = 36;
    const ribX = (width - ribW) / 2;
    const ribGrad = ctx.createLinearGradient(ribX, ribY, ribX + ribW, ribY);
    ribGrad.addColorStop(0, '#be942f');
    ribGrad.addColorStop(0.5, '#f3d98b');
    ribGrad.addColorStop(1, '#be942f');
    ctx.fillStyle = ribGrad;
    ctx.fillRect(ribX, ribY, ribW, ribH);
    ctx.strokeStyle = '#856118';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ribX, ribY, ribW, ribH);

    ctx.fillStyle = '#2a1a04';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('SCAN THE QR CODE TO PLAY & WIN CASH!', width / 2, ribY + 23);

    // QR Code
    const qrSize = 420;
    const qrX = (width - qrSize) / 2;
    const qrY = 310;
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // Bottom Badge
    const botY = 820;
    ctx.fillStyle = '#1a1409';
    ctx.font = '900 24px "Times New Roman", Georgia, serif';
    ctx.fillText('HDASE BINGO', width / 2, botY);
    ctx.fillStyle = '#8a6a1d';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('75-BALL MULTIPLAYER LIVE ETHIOPIAN BINGO', width / 2, botY + 22);

    return canvas.toDataURL('image/png');
  };

  const handleDownloadFlyer = () => {
    const dataUrl = generateFlyerImage();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `hdasebingo-promoter-${user?.first_name || 'invite'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloadedQR(true);
    triggerSuccessHaptic();
    setTimeout(() => setDownloadedQR(false), 2500);
  };

  const handleSendFlyerToTelegram = async () => {
    const dataUrl = generateFlyerImage();
    if (!dataUrl) return;
    setIsSavingFlyer(true);
    try {
      const res = await fetch(`${API}/player/send-flyer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({
          image_base64: dataUrl,
          room_name: `Promoter ${user?.first_name || 'Official'}`,
        }),
      });
      if (res.ok) {
        setFlyerSentToTg(true);
        triggerSuccessHaptic();
        setTimeout(() => setFlyerSentToTg(false), 3500);
      }
    } catch {} finally {
      setIsSavingFlyer(false);
    }
  };

  // Calculate max for proportional 7-day chart bars
  const maxChartValue = useMemo(() => {
    if (!chartData || chartData.length === 0) return 1;
    const vals = chartData.map((d) => {
      if (chartMetric === 'games') return d.games_count;
      if (chartMetric === 'commission') return d.commission;
      return d.volume;
    });
    return Math.max(...vals, 1);
  }, [chartData, chartMetric]);

  // Filter Finished Games Report by ROOM CATEGORY and search query
  const filteredRecentGames = useMemo(() => {
    return recentGames.filter((g) => {
      // Room category filter
      if (reportRoomFilter !== 'all' && g.room_id !== reportRoomFilter) return false;
      // Search query filter
      if (reportSearchQuery.trim()) {
        const q = reportSearchQuery.toLowerCase();
        const matchesId = g.id.toLowerCase().includes(q);
        const matchesWinner = g.winner_first_name.toLowerCase().includes(q);
        const matchesRoom = (g.room_name || '').toLowerCase().includes(q);
        const matchesStake = String(g.stake).includes(q);
        if (!matchesId && !matchesWinner && !matchesRoom && !matchesStake) return false;
      }
      return true;
    });
  }, [recentGames, reportRoomFilter, reportSearchQuery]);

  const reportTotalCommission = useMemo(() => {
    return filteredRecentGames.reduce((acc, g) => acc + (g.agent_commission || 0), 0);
  }, [filteredRecentGames]);

  const liveStakes = [10, 20, 50, 100];
  const promoterRate = selectedRoom?.promoter_commission_rate ?? stats?.promoter_commission_rate ?? 3;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 select-none pb-20 font-sans">
      {/* ─── STICKY TOP APP BAR (Profile: "Promoter" + First Name + 3% Commission) ─── */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Avatar & Promoter Identification (NO Room Name here!) */}
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-amber-200 shrink-0">
              {(user?.first_name || 'P').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-sm font-black text-slate-900 leading-tight">
                  Promoter
                </span>
                <span className="inline-flex items-center space-x-0.5 text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <Zap size={10} className="text-emerald-500 fill-emerald-500" />
                  <span>{promoterRate}% Commission</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-bold truncate">
                {user?.first_name || user?.username || 'Promoter'}
              </p>
            </div>
          </div>

          {/* Right: Wallet Balance & Refresh */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="text-right">
              <div className="flex items-center justify-end space-x-1 text-slate-400">
                <Wallet size={11} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Wallet</span>
              </div>
              <p className="text-sm font-black text-emerald-600 leading-tight">
                {((user as any)?.main_balance ?? 0).toLocaleString()} <span className="text-[10px] font-extrabold">ETB</span>
              </p>
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-all shadow-2xs"
              title="Refresh"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-amber-500' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-3.5">
        {/* Error banner */}
        {error && (
          <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 shadow-2xs">
            <AlertCircle size={15} className="text-rose-500 shrink-0" />
            <p className="text-xs text-rose-700 font-bold">{error}</p>
          </div>
        )}

        {/* ─── GOLDEN HERO CARD ─── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-amber-100/90 via-amber-50/70 to-white border border-amber-200/80 p-5 shadow-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400/20 to-orange-400/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center text-center space-y-3">
            <div className="inline-flex items-center space-x-1.5 text-[10px] font-black tracking-wider uppercase text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE BINGO • PROMOTER</span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-wider">
                HDASE <span className="text-amber-500">BINGO</span>
              </h2>
              <p className="text-xs font-bold text-slate-500 mt-0.5">
                Earn 3% commission on every game played in your invited rooms
              </p>
            </div>

            <button
              onClick={() => {
                triggerHaptic('medium');
                setActiveTab('rooms');
                setRoomDetailMode(false);
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-full text-xs font-black tracking-wider uppercase shadow-md shadow-orange-500/25 active:scale-95 transition-all flex items-center space-x-1.5"
            >
              <span>VIEW ROOMS →</span>
            </button>
          </div>
        </div>

        {/* ─── 4 SEGMENT TABS (Analytics, Rooms, Report, QR) ─── */}
        <div className="grid grid-cols-4 gap-1.5 bg-slate-200/60 p-1 rounded-2xl">
          <button
            onClick={() => { triggerHaptic('light'); setActiveTab('analytics'); }}
            className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1 ${
              activeTab === 'analytics' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart3 size={13} />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('rooms');
            }}
            className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1 relative ${
              activeTab === 'rooms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 size={13} />
            <span>Rooms ({promotedRooms.length})</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          </button>

          <button
            onClick={() => { triggerHaptic('light'); setActiveTab('report'); }}
            className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1 ${
              activeTab === 'report' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Trophy size={13} />
            <span>Report</span>
          </button>

          <button
            onClick={() => { triggerHaptic('light'); setActiveTab('qr'); }}
            className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1 ${
              activeTab === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <QrCode size={13} />
          </button>
        </div>

        {/* ════════════ TAB 1: ANALYTICS (Green & Black Chart Colors) ════════════ */}
        {activeTab === 'analytics' && (
          <div className="space-y-3.5">
            {/* 7-Day Performance Chart Card */}
            <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center space-x-1.5">
                    <TrendingUp size={14} className="text-amber-500" />
                    <span>Room Activity & Trends</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">Last 7 Days Room Performance</p>
                </div>
              </div>

              {/* Metric Toggle 3 Buttons: Games (Orange) | Comm (Emerald Green) | Pot (Slate/Black) */}
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

              {/* Interactive SVG Bar & Trend Chart with Proper Pillar Colors */}
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
                        {/* Bar Value on top */}
                        <span
                          className={`text-[8px] font-black mb-1 transition-all ${
                            isSelected
                              ? chartMetric === 'commission'
                                ? 'text-emerald-700 font-extrabold scale-110'
                                : 'text-slate-900 font-extrabold scale-110'
                              : 'text-slate-400 opacity-70 group-hover:opacity-100'
                          }`}
                        >
                          {chartMetric === 'games' ? val : formatAmount(val)}
                        </span>

                        {/* Bar Pillar */}
                        <div className="w-full max-w-[28px] bg-slate-100 rounded-xl overflow-hidden flex flex-col justify-end h-[100px] p-0.5">
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={`w-full rounded-lg transition-all duration-300 ${
                              chartMetric === 'games'
                                ? isSelected
                                  ? 'bg-gradient-to-t from-orange-600 to-amber-400 shadow-xs'
                                  : 'bg-gradient-to-t from-orange-300 to-amber-200 group-hover:from-orange-400'
                                : chartMetric === 'commission'
                                ? isSelected
                                  ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-xs'
                                  : 'bg-gradient-to-t from-emerald-300 to-teal-200 group-hover:from-emerald-400'
                                : isSelected
                                ? 'bg-gradient-to-t from-slate-900 to-slate-700 shadow-xs'
                                : 'bg-gradient-to-t from-slate-300 to-slate-200 group-hover:from-slate-400'
                            }`}
                          />
                        </div>

                        {/* Day Label on X Axis */}
                        <span
                          className={`text-[9px] mt-1.5 font-black uppercase transition-colors ${
                            isSelected
                              ? chartMetric === 'commission'
                                ? 'text-emerald-600'
                                : 'text-orange-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {d.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day Summary Card */}
              {selectedDayIndex !== null && chartData[selectedDayIndex] && (
                <div className={`rounded-2xl p-3 flex items-center justify-between border ${
                  chartMetric === 'commission'
                    ? 'bg-emerald-50/60 border-emerald-200/70'
                    : 'bg-amber-50/60 border-amber-200/70'
                }`}>
                  <div className="flex items-center space-x-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                      chartMetric === 'commission' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {chartData[selectedDayIndex].label}
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-mono">{chartData[selectedDayIndex].date}</p>
                      <p className="text-xs font-black text-slate-800">
                        {chartData[selectedDayIndex].games_count} Games Finished
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Commission</p>
                    <p className="text-xs font-black text-emerald-600">
                      +{formatAmount(chartData[selectedDayIndex].commission)} ETB
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Today's Earned</span>
                <p className="text-xl font-black text-emerald-600">
                  +{formatAmount(stats?.today_commission ?? 0)} <span className="text-xs font-bold text-slate-400">ETB</span>
                </p>
                <span className="text-[9px] text-slate-400">{stats?.today_games ?? 0} games played today</span>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">All-Time Comm</span>
                <p className="text-xl font-black text-amber-600">
                  {formatAmount(stats?.total_commission_all_time ?? 0)} <span className="text-xs font-bold text-slate-400">ETB</span>
                </p>
                <span className="text-[9px] text-slate-400">{stats?.total_games_finished ?? 0} total games</span>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Promoted Rooms</span>
                <p className="text-xl font-black text-violet-600">
                  {promotedRooms.length}
                </p>
                <span className="text-[9px] text-slate-400">{selectedRoom?.room_name || 'No room selected'}</span>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Referred Players</span>
                <p className="text-xl font-black text-slate-800">
                  {stats?.total_referred_players ?? 0}
                </p>
                <span className="text-[9px] text-slate-400">Invited by your link</span>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ TAB 2: ROOMS (GRID OF USER-SECTION STYLE ROOM CARDS + LIVE STAKE VIEW) ════════════ */}
        {activeTab === 'rooms' && (
          <div className="space-y-3.5">
            {!roomDetailMode ? (
              /* ─── VIEW A: ALL INVITED ROOM CARDS (Exact match with Image 2) ─── */
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center space-x-1.5">
                      <Building2 size={14} className="text-amber-500" />
                      <span>Your Invited Rooms</span>
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {promotedRooms.length} active rooms linked to you • Tap a room to monitor live
                    </p>
                  </div>
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{promotedRooms.length} Active</span>
                  </span>
                </div>

                {promotedRooms.length === 0 ? (
                  <div className="bg-white rounded-3xl p-8 border border-dashed border-slate-200 text-center space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto">
                      <DoorOpen size={28} />
                    </div>
                    <p className="text-xs font-black text-slate-800">No Invited Rooms Linked Yet</p>
                    <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                      Share your promoter referral link to invite users. When an invited user creates a room, it will appear here!
                    </p>
                    <button
                      onClick={() => setActiveTab('qr')}
                      className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all shadow-sm"
                    >
                      Get Your Invitation Link
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {promotedRooms.map((rm) => (
                      <div
                        key={rm.id}
                        onClick={() => handleOpenRoomDetail(rm)}
                        className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col cursor-pointer active:scale-95 transition-all hover:shadow-md"
                      >
                        {/* Dark Header matching Image 2 */}
                        <div className="h-16 bg-black flex flex-col items-center justify-center relative px-2 text-center">
                          {rm.is_pinned && (
                            <div className="absolute top-2 left-2 flex items-center justify-center bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 text-[10px] w-5 h-5 rounded-full shadow-sm">
                              <span>📌</span>
                            </div>
                          )}
                          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm" />
                          <span className="text-white font-black text-sm leading-tight line-clamp-2 px-1">
                            {rm.room_name}
                          </span>
                        </div>

                        {/* Stats Section matching Image 2 */}
                        <div className="p-3 bg-white flex-1 flex flex-col justify-between space-y-2.5">
                          <div className="grid grid-cols-2 gap-1.5 text-center">
                            <div className="bg-slate-50 p-1.5 rounded-lg">
                              <span className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase">Players</span>
                              <span className="text-sm font-black text-emerald-600">
                                {rm.total_players || 0}
                              </span>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded-lg">
                              <span className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase">Total Games</span>
                              <span className="text-sm font-black text-purple-600">
                                {rm.total_games || 0}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-center text-[10px] font-bold text-amber-600 bg-amber-50 py-1 rounded-lg border border-amber-200/60">
                            <span>⚡ {rm.promoter_commission_rate ?? 3}% Commission Cut</span>
                          </div>

                          <button
                            type="button"
                            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-lg transition-colors flex items-center justify-center space-x-1"
                          >
                            <span>Monitor Room</span>
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ─── VIEW B: INSIDE SELECTED ROOM (4 Live Stake Cards) ─── */
              <div className="space-y-3.5">
                {/* Back button & Room header */}
                <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                  <button
                    onClick={() => setRoomDetailMode(false)}
                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black active:scale-95 transition-all"
                  >
                    <ChevronLeft size={14} />
                    <span>All Rooms</span>
                  </button>

                  <div className="text-right">
                    <p className="text-xs font-black text-slate-900 truncate">{selectedRoom?.room_name}</p>
                    <span className="text-[10px] font-bold text-emerald-600">
                      ⚡ {promoterRate}% Promoter Cut
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1">
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                      Live Stake Tables
                    </h3>
                    <p className="text-[10px] text-slate-400">Tap a table to monitor its active game</p>
                  </div>
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>4 Live</span>
                  </span>
                </div>

                {/* 4 Stake Cards (10, 20, 50, 100 ETB) */}
                <div className="grid grid-cols-2 gap-2.5">
                  {liveStakes.map((stake) => {
                    const game = activeGames.find((g) => Number(g.stake) === stake);
                    const isCalling = game?.status === 'calling';
                    const playerCount = game?.total_players || 0;
                    const estPot = (playerCount >= 3 && game?.prize_pool)
                      ? game.prize_pool
                      : stake * playerCount;
                    const estComm = (estPot * promoterRate) / 100;

                    return (
                      <div
                        key={stake}
                        onClick={() => setSelectedLiveStake(stake)}
                        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white p-4 shadow-md shadow-orange-500/15 cursor-pointer active:scale-98 transition-all flex flex-col justify-between h-40"
                      >
                        {/* Top Row: Stake & Status Badge */}
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-3xl font-black tracking-tight leading-none">{stake}</span>
                            <p className="text-[9px] font-black uppercase tracking-wider text-amber-100">ETB STAKE</p>
                          </div>
                          <span className={`inline-flex items-center space-x-1 text-[9px] font-black px-2 py-0.5 rounded-full backdrop-blur-xs ${
                            isCalling ? 'bg-emerald-400/90 text-slate-900' : 'bg-black/20 text-white border border-white/20'
                          }`}>
                            {isCalling ? <Flame size={9} /> : <Clock size={9} />}
                            <span>{isCalling ? 'LIVE' : 'WAIT'}</span>
                          </span>
                        </div>

                        {/* Middle: Player count & Est. Comm */}
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[11px] text-amber-100">
                            <span>Players</span>
                            <span className="font-black text-white">{playerCount}</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-amber-100">
                            <span>Est. Comm</span>
                            <span className="font-black text-white">+{formatAmount(estComm)} ETB</span>
                          </div>
                        </div>

                        {/* Bottom: View Details link */}
                        <div className="pt-2 border-t border-white/20 flex items-center justify-between text-[10px] font-bold text-amber-100">
                          <span>View Details</span>
                          <ChevronRight size={13} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB 3: REPORT (ROOM CATEGORY FILTER) ════════════ */}
        {activeTab === 'report' && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    Finished Games Report
                  </h3>
                  <p className="text-[10px] text-slate-400">Games and 3% commission earned across your rooms</p>
                </div>
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {filteredRecentGames.length} Finished
                </span>
              </div>
            </div>

            {/* ─── ROOM CATEGORY FILTER PILLS ─── */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center space-x-1 px-1">
                <Layers size={11} className="text-amber-500" />
                <span>Filter by Room:</span>
              </span>
              <div className="flex space-x-1.5 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setReportRoomFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
                    reportRoomFilter === 'all'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-300'
                  }`}
                >
                  All Rooms ({promotedRooms.length})
                </button>
                {promotedRooms.map((rm) => (
                  <button
                    key={rm.id}
                    type="button"
                    onClick={() => setReportRoomFilter(rm.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all flex items-center space-x-1 ${
                      reportRoomFilter === rm.id
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-300'
                    }`}
                  >
                    <span>{rm.room_name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by game ID, winner name, room..."
                value={reportSearchQuery}
                onChange={(e) => setReportSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-amber-500"
              />
            </div>

            {/* Summary Bar */}
            <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-500">
              <span>Showing {filteredRecentGames.length} of {recentGames.length} games</span>
              <span className="text-emerald-600 font-black">
                Total Comm: +{formatAmount(reportTotalCommission)} ETB
              </span>
            </div>

            {/* List of Finished Game Cards */}
            {filteredRecentGames.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center text-slate-400">
                <Trophy size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-black text-slate-700">No Finished Games Found</p>
                <p className="text-[10px] text-slate-400 mt-1">Games played in your rooms will appear here with your commission.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRecentGames.map((game) => (
                  <div
                    key={game.id}
                    className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-[10px] font-black text-slate-700">
                          #{formatGameId(game.id)}
                        </span>
                        {game.room_name && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                            🏢 {game.room_name}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {new Date(game.finished_at || game.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black">
                        +{formatAmount(game.agent_commission)} ETB ({game.commission_rate}%)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase font-bold">Winner</p>
                        <p className="font-black text-slate-900 flex items-center space-x-1">
                          <span>🏆 {game.winner_first_name}</span>
                          {game.winner_cartela && <span className="text-slate-400 font-normal">(#{game.winner_cartela})</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-slate-400 uppercase font-bold">Pot / Stake</p>
                        <p className="font-black text-slate-900">
                          {formatAmount(game.prize_pool)} ETB <span className="text-[10px] text-slate-400">(@{game.stake})</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[10px]">
                      <span className="text-slate-400">👥 {game.total_players} players participating</span>
                      <span className="text-emerald-600 font-bold flex items-center space-x-1">
                        <span>Credited to Wallet</span>
                        <span>✅</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB 4: QR FLYER (PROMOTER'S PERMANENT INVITATION LINK) ════════════ */}
        {activeTab === 'qr' && (
          <div className="space-y-3">
            {/* Table Flyer Card — Promotes the Promoter's Unique Invitation Link */}
            <div className="bg-white rounded-3xl p-5 border-2 border-amber-300 shadow-md space-y-4 text-center relative overflow-hidden">
              <div className="space-y-1">
                <div className="w-10 h-10 rounded-full bg-slate-900 text-amber-400 mx-auto flex items-center justify-center font-black text-xs border-2 border-amber-400">
                  HB
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-wider">HDASE BINGO</h3>
                <p className="text-[10px] font-black tracking-widest uppercase text-amber-700">
                  OFFICIAL PROMOTER • {user?.first_name || 'PROMOTER'}
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="text-lg font-black text-slate-900 tracking-wide">SCAN TO PLAY</h4>
                <div className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 text-slate-900 font-bold text-[10px] py-1 px-3 rounded-full uppercase tracking-wider inline-block">
                  SCAN THE QR CODE TO Play & Win Cash!
                </div>
              </div>

              {/* QR Canvas — ALWAYS Promoter Referral Link (ref_${telegram_id}) */}
              <div className="p-3 bg-white border border-amber-200 rounded-2xl inline-block shadow-sm relative">
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={promoterInviteLink}
                  size={200}
                  level="H"
                  includeMargin={false}
                  fgColor="#1e293b"
                  bgColor="#ffffff"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-gradient-to-r from-amber-500 to-yellow-400 border-2 border-white shadow-md rounded-xl px-2 py-0.5 flex flex-col items-center">
                    <span className="text-[7px] font-black text-white leading-none">HDASE</span>
                    <span className="text-[9px] font-black text-white leading-none">BINGO</span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  onClick={handleDownloadFlyer}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 active:scale-95 transition-all"
                >
                  {downloadedQR ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Download size={14} />}
                  <span>{downloadedQR ? 'Saved!' : 'Save Flyer'}</span>
                </button>
                <button
                  onClick={handleSendFlyerToTelegram}
                  disabled={isSavingFlyer}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-sm"
                >
                  <Send size={14} className={isSavingFlyer ? 'animate-spin' : ''} />
                  <span>{flyerSentToTg ? 'Sent to Bot!' : 'Send to Bot'}</span>
                </button>
              </div>
            </div>

            {/* Direct Promoter Share Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800">Your Permanent Promoter Invite Link</span>
                <span className="text-[10px] font-bold text-violet-600">⚡ 3% Commission</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Anyone who joins with this link is linked to you. When they become an agent and are assigned a room, you automatically earn 3% commission on every game!
              </p>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="font-mono text-xs text-slate-600 truncate mr-2 select-all">
                  {promoterInviteLink}
                </span>
                <button
                  onClick={handleCopyInviteLink}
                  className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black flex items-center space-x-1 active:scale-95 transition-all"
                >
                  {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <button
                onClick={handleShareInvite}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Share2 size={14} />
                <span>Share Invite on Telegram</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── LIVE STAKE DETAILS MODAL ─── */}
      {selectedLiveStake !== null && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-3.5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center space-x-2">
                <Flame size={16} className="text-amber-500" />
                <h3 className="text-sm font-black text-slate-900">{selectedLiveStake} ETB Stake Table</h3>
              </div>
              <button
                onClick={() => setSelectedLiveStake(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X size={14} />
              </button>
            </div>

            {(() => {
              const liveGame = activeGames.find(g => Number(g.stake) === selectedLiveStake);
              const pCount = liveGame?.total_players || 0;
              const estPot = (pCount >= 3 && liveGame?.prize_pool)
                ? liveGame.prize_pool
                : selectedLiveStake * pCount;
              const estComm = (estPot * promoterRate) / 100;

              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Status</p>
                      <p className="font-black text-xs text-amber-600 uppercase">
                        {liveGame?.status === 'calling' ? 'Calling Numbers' : 'Waiting Players'}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Active Players</p>
                      <p className="font-black text-xs text-slate-800">{pCount}</p>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Est. Pot</p>
                      <p className="font-black text-xs text-slate-800">{formatAmount(estPot)} ETB</p>
                    </div>
                    <div className="bg-emerald-50 p-2.5 rounded-2xl border border-emerald-100">
                      <p className="text-[10px] text-emerald-600 uppercase font-bold">Est. Promoter Comm</p>
                      <p className="font-black text-xs text-emerald-700">+{formatAmount(estComm)} ETB ({promoterRate}%)</p>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 text-center">
                    Promoter automatically earns {promoterRate}% from every completed game pot in this room.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
