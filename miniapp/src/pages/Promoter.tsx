import { useEffect, useState, useMemo, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { supabase } from '../lib/supabase';
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
  Wifi,
  Calendar,
  ChevronDown,
  Ticket,
  Crown,
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
  commission_rate: number; // promoter commission rate %
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
  const { user, fetchUser, rooms, fetchRooms, subscribeToRooms } = useGameStore();
  const navigate = useNavigate();

  // Instant cache retrieval to prevent any second loading flash
  const initialCache = useMemo(() => {
    try {
      const raw = localStorage.getItem('hdase_promoter_cache');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }, []);

  const [promotedRooms, setPromotedRooms] = useState<PromotedRoom[]>(initialCache?.rooms || []);
  const [selectedRoom, setSelectedRoom] = useState<PromotedRoom | null>(
    initialCache?.selected_room || (initialCache?.rooms && initialCache.rooms[0]) || null
  );
  const selectedRoomRef = useRef<PromotedRoom | null>(selectedRoom);
  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>(initialCache?.active_games || []);
  const [recentGames, setRecentGames] = useState<FinishedGame[]>(initialCache?.recent_games || []);
  const [stats, setStats] = useState<PromoterStats | null>(initialCache?.stats || null);
  const [chartData, setChartData] = useState<ChartDay[]>(initialCache?.chart_data || []);
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Tab navigation: 'analytics' | 'rooms' | 'report' | 'qr' — default is 'analytics'
  const [activeTab, setActiveTab] = useState<'analytics' | 'rooms' | 'report' | 'qr'>('analytics');

  // When on 'rooms' tab: null = show all room cards; non-null = viewing that room's live stake tables!
  const [roomDetailMode, setRoomDetailMode] = useState<boolean>(false);

  // Analytics chart metric: 'games' (orange) | 'commission' (emerald green) | 'volume' (slate/black)
  const [chartMetric, setChartMetric] = useState<'games' | 'commission' | 'volume'>('games');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(
    initialCache?.chart_data && initialCache.chart_data.length > 0
      ? initialCache.chart_data.length - 1
      : null
  );

  // Report filters: Room category filter ('all' or specific room_id) + Advanced Date/Period filter
  const [reportRoomFilter, setReportRoomFilter] = useState<string>('all');
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'all' | 'today' | 'yesterday' | 'weekly' | 'monthly' | '3months' | 'yearly' | 'custom'>('all');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [customRangeText, setCustomRangeText] = useState('');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [expandedRoomIds, setExpandedRoomIds] = useState<Record<string, boolean>>({});

  // Live stake details modal
  const [selectedLiveStake, setSelectedLiveStake] = useState<number | null>(null);

  // Flyer actions
  const [downloadedQR, setDownloadedQR] = useState(false);
  const [isSavingFlyer, setIsSavingFlyer] = useState(false);
  const [flyerSentToTg, setFlyerSentToTg] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [supportPhoneUsa, setSupportPhoneUsa] = useState('+1 (984) 378-9510');
  const [supportPhoneEth, setSupportPhoneEth] = useState('+251999992524');

  const formatEthPhone = (phone: string) => {
    if (!phone) return '+251999992524';
    const clean = phone.trim();
    if ((clean.startsWith('09') || clean.startsWith('07')) && clean.length === 10) {
      return '+251' + clean.slice(1);
    }
    return clean;
  };

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
      const targetRoomId = roomIdToFetch || selectedRoomRef.current?.id || '';
      const url = targetRoomId
        ? `${API}/player/promoter-dashboard?room_id=${encodeURIComponent(targetRoomId)}`
        : `${API}/player/promoter-dashboard`;

      const res = await fetch(url, {
        headers: { 'x-telegram-init-data': initData },
      });
      if (!res.ok) throw new Error('Failed to load promoter dashboard');
      const data = await res.json();

      setPromotedRooms(data.rooms || []);
      const currentId = targetRoomId || selectedRoomRef.current?.id;
      const active = (currentId && data.rooms?.find((r: PromotedRoom) => String(r.id) === String(currentId)))
        || data.selected_room
        || (data.rooms && data.rooms[0])
        || null;
      setSelectedRoom(active);
      selectedRoomRef.current = active;
      setActiveGames(data.active_games || []);
      setRecentGames(data.recent_games || []);
      setStats(data.stats || null);
      setChartData(data.chart_data || []);

      if (data.chart_data && data.chart_data.length > 0) {
        setSelectedDayIndex(data.chart_data.length - 1);
      }

      if (data) {
        try {
          localStorage.setItem('hdase_promoter_cache', JSON.stringify(data));
        } catch {}
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
    fetchDashboardData(selectedRoomRef.current?.id);
    fetchUser();
    fetchRooms();
    const unsubRooms = subscribeToRooms();

    // Realtime channel on bingo_games & bingo_players so room player numbers and game numbers update instantly
    const channel = supabase
      .channel(`promoter-live-sync-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_games' }, () => {
        fetchDashboardData(selectedRoomRef.current?.id);
        fetchRooms();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_players' }, () => {
        fetchDashboardData(selectedRoomRef.current?.id);
        fetchRooms();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchDashboardData(selectedRoomRef.current?.id);
        fetchRooms();
      })
      .subscribe();

    // Fetch dynamic support phone numbers
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    fetch(`${API}/player/support-contact`, {
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
    })
      .then(r => r.json())
      .then(data => {
        if (data?.support_phone_usa) setSupportPhoneUsa(data.support_phone_usa);
        if (data?.support_phone_eth) setSupportPhoneEth(data.support_phone_eth);
      })
      .catch(() => {});

    const interval = setInterval(() => {
      fetchDashboardData(selectedRoomRef.current?.id);
      fetchUser();
      fetchRooms();
    }, 15000);

    return () => {
      unsubRooms();
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const handleManualRefresh = async () => {
    triggerHaptic('medium');
    setRefreshing(true);
    await Promise.all([fetchDashboardData(selectedRoomRef.current?.id), fetchUser(), fetchRooms()]);
  };

  const handleOpenRoomDetail = (room: PromotedRoom) => {
    triggerHaptic('light');
    setSelectedRoom(room);
    selectedRoomRef.current = room;
    setSelectedLiveStake(null);
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

  // High-Res Luxury Flyer Generation using Promoter's Permanent Invitation Link
  const generateFlyerImage = (): string | null => {
    const qrCanvas = qrCanvasRef.current;
    if (!qrCanvas) return null;

    try {
      const width = 800;
      const height = 1150;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const promoterName = (user?.first_name || user?.username || 'PROMOTER').toUpperCase();

      // 1. Warm ivory luxury background (matching restaurant poster)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#ffffff');
      bgGrad.addColorStop(0.3, '#fdfcf9');
      bgGrad.addColorStop(0.7, '#faf5ea');
      bgGrad.addColorStop(1, '#f5edd9');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Radial ambient lighting in center
      const radial = ctx.createRadialGradient(width / 2, 450, 50, width / 2, 450, 550);
      radial.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      radial.addColorStop(1, 'rgba(245, 235, 215, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // 2. Double gold ornate border frame
      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(20, 20, width - 40, height - 40);

      ctx.strokeStyle = '#e6c86e';
      ctx.lineWidth = 1;
      ctx.strokeRect(26, 26, width - 52, height - 52);

      // Corner diamond ornaments
      const drawDiamond = (x: number, y: number, s: number) => {
        ctx.fillStyle = '#b8860b';
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s, y);
        ctx.closePath();
        ctx.fill();
      };
      drawDiamond(26, 26, 4);
      drawDiamond(width - 26, 26, 4);
      drawDiamond(26, height - 26, 4);
      drawDiamond(width - 26, height - 26, 4);

      // 3. Top Royal Crown & Medallion Emblem
      const emblemY = 82;
      const emblemX = width / 2;

      // Gold Crown base
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.roundRect(emblemX - 22, emblemY - 34, 44, 7, 2);
      ctx.fill();

      // Crown spikes (5 peaks)
      ctx.beginPath();
      ctx.moveTo(emblemX - 22, emblemY - 34);
      ctx.lineTo(emblemX - 25, emblemY - 52);
      ctx.lineTo(emblemX - 12, emblemY - 40);
      ctx.lineTo(emblemX, emblemY - 56);
      ctx.lineTo(emblemX + 12, emblemY - 40);
      ctx.lineTo(emblemX + 25, emblemY - 52);
      ctx.lineTo(emblemX + 22, emblemY - 34);
      ctx.closePath();
      ctx.fill();

      // Crown pearls
      ctx.fillStyle = '#fef08a';
      [-25, -12, 0, 12, 25].forEach((px, idx) => {
        const py = idx === 2 ? emblemY - 57 : (idx === 0 || idx === 4) ? emblemY - 53 : emblemY - 41;
        ctx.beginPath();
        ctx.arc(emblemX + px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Medallion Circle with HB Monogram
      ctx.fillStyle = '#1c150c';
      ctx.beginPath();
      ctx.arc(emblemX, emblemY - 10, 24, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(emblemX, emblemY - 10, 20, 0, Math.PI * 2);
      ctx.stroke();

      // Monogram text HB
      ctx.fillStyle = '#fef08a';
      ctx.font = '900 18px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HB', emblemX, emblemY - 9);
      ctx.textBaseline = 'alphabetic';

      // Symmetrical scrolls
      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(emblemX - 35, emblemY - 10);
      ctx.bezierCurveTo(emblemX - 55, emblemY - 24, emblemX - 70, emblemY + 2, emblemX - 90, emblemY - 6);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(emblemX + 35, emblemY - 10);
      ctx.bezierCurveTo(emblemX + 55, emblemY - 24, emblemX + 70, emblemY + 2, emblemX + 90, emblemY - 6);
      ctx.stroke();

      // 4. Main Title "HDASE BINGO"
      ctx.fillStyle = '#140f09';
      ctx.font = '900 40px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('HDASE BINGO', width / 2, 142);

      // 5. Subtitle "OFFICIAL PROMOTER • [NAME]" with divider lines
      ctx.fillStyle = '#8a6a1d';
      ctx.font = 'bold 12.5px sans-serif';
      const subText = `OFFICIAL PROMOTER • ${promoterName}`;
      ctx.fillText(subText, width / 2, 172);

      const subWidth = ctx.measureText(subText).width;
      const lineY = 168;
      const lineLen = 65;
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2 - subWidth / 2 - 12 - lineLen, lineY);
      ctx.lineTo(width / 2 - subWidth / 2 - 12, lineY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(width / 2 + subWidth / 2 + 12, lineY);
      ctx.lineTo(width / 2 + subWidth / 2 + 12 + lineLen, lineY);
      ctx.stroke();

      // 6. Bold "SCAN TO PLAY" with wheat/arrow wings
      const scanY = 224;
      ctx.fillStyle = '#17120a';
      ctx.font = '900 35px "Times New Roman", Georgia, sans-serif';
      ctx.fillText('SCAN TO PLAY', width / 2, scanY);

      const scanWidth = ctx.measureText('SCAN TO PLAY').width;
      const wingLeftX = width / 2 - scanWidth / 2 - 25;
      const wingRightX = width / 2 + scanWidth / 2 + 25;

      const drawWing = (cx: number, cy: number, isRight: boolean) => {
        ctx.fillStyle = '#c59b27';
        const dir = isRight ? 1 : -1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(cx + dir * 10, cy + i * 8, 11, 4, (dir * (i * 25) * Math.PI) / 180, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(cx + dir * 26, cy);
        ctx.lineTo(cx + dir * 18, cy - 7);
        ctx.lineTo(cx + dir * 18, cy + 7);
        ctx.closePath();
        ctx.fill();
      };
      drawWing(wingLeftX, scanY - 11, false);
      drawWing(wingRightX, scanY - 11, true);

      // 7. Gold Ribbon Banner "SCAN THE QR CODE TO Play & Win Cash!"
      const ribbonW = 460;
      const ribbonH = 40;
      const ribbonX = (width - ribbonW) / 2;
      const ribbonY = 248;

      const ribGrad = ctx.createLinearGradient(ribbonX, ribbonY, ribbonX + ribbonW, ribbonY);
      ribGrad.addColorStop(0, '#ebd596');
      ribGrad.addColorStop(0.5, '#deb55b');
      ribGrad.addColorStop(1, '#ebd596');
      ctx.fillStyle = ribGrad;
      ctx.beginPath();
      ctx.roundRect(ribbonX, ribbonY, ribbonW, ribbonH, 20);
      ctx.fill();

      ctx.strokeStyle = '#a67718';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const midRibY = ribbonY + ribbonH / 2;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#3a2707';
      const part1 = 'SCAN THE QR CODE TO ';
      const p1W = ctx.measureText(part1).width;

      ctx.font = 'italic bold 18px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive';
      const part2 = 'Play & Win Cash!';
      const p2W = ctx.measureText(part2).width;

      const totalRibTextW = p1W + p2W;
      const startRibTextX = width / 2 - totalRibTextW / 2;

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#3a2707';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(part1, startRibTextX, midRibY);

      ctx.font = 'italic bold 19px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive';
      ctx.fillStyle = '#831414'; // Ruby red cursive text
      ctx.fillText(part2, startRibTextX + p1W, midRibY);
      ctx.textBaseline = 'alphabetic';

      // 8. Central White Card with Gold Border & QR Code
      const cardW = 530;
      const cardH = 530;
      const cardX = (width - cardW) / 2;
      const cardY = 308;
      const cardRadius = 32;

      ctx.shadowColor = 'rgba(120, 80, 20, 0.12)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      ctx.strokeStyle = '#fae596';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cardX + 4, cardY + 4, cardW - 8, cardH - 8, cardRadius - 4);
      ctx.stroke();

      // Draw QR Code
      const qrSize = 440;
      const qrX = cardX + (cardW - qrSize) / 2;
      const qrY = cardY + (cardH - qrSize) / 2;
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      // Central HDASE BINGO Badge on QR Code
      const centerBadgeW = 114;
      const centerBadgeH = 50;
      const centerBadgeX = width / 2 - centerBadgeW / 2;
      const centerBadgeY = qrY + qrSize / 2 - centerBadgeH / 2;

      const badgeGrad = ctx.createLinearGradient(centerBadgeX, centerBadgeY, centerBadgeX + centerBadgeW, centerBadgeY + centerBadgeH);
      badgeGrad.addColorStop(0, '#f59e0b');
      badgeGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = badgeGrad;
      ctx.beginPath();
      ctx.roundRect(centerBadgeX, centerBadgeY, centerBadgeW, centerBadgeH, 12);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 10.5px sans-serif';
      ctx.fillText('HDASE', width / 2, centerBadgeY + 18);
      ctx.font = '900 16px sans-serif';
      ctx.fillText('BINGO', width / 2, centerBadgeY + 38);

      // 9. Bottom Section: 4 feature icons + motto
      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(width / 2, 830, 360, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();

      const featY = 880;
      const feats = [
        { icon: '🏆', text: 'JACKPOT' },
        { icon: '⚡', text: 'INSTANT PAY' },
        { icon: '🎱', text: '75 BINGO' },
        { icon: '🛡️', text: 'VERIFIED' }
      ];

      const colW = (width - 120) / 4;
      feats.forEach((f, idx) => {
        const colX = 60 + idx * colW + colW / 2;

        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.icon, colX, featY);

        ctx.fillStyle = '#6b4f14';
        ctx.font = '900 10px sans-serif';
        ctx.fillText(f.text, colX, featY + 22);

        if (idx < 3) {
          const divX = 60 + (idx + 1) * colW;
          ctx.strokeStyle = '#d4af37';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(divX, featY - 14);
          ctx.lineTo(divX, featY + 24);
          ctx.stroke();
        }
      });

      // 10. Cursive Motto "Real Players • Good Luck • Big Wins"
      ctx.textAlign = 'center';
      ctx.fillStyle = '#221609';
      ctx.font = 'italic bold 23px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive';
      ctx.fillText('Real Players  •  Good Luck  •  Big Wins', width / 2, 955);

      // 11. Official Bot Link Box
      const codeBoxW = 280;
      const codeBoxH = 36;
      const codeBoxX = (width - codeBoxW) / 2;
      const codeBoxY = 988;

      ctx.fillStyle = '#fbf6ea';
      ctx.beginPath();
      ctx.roundRect(codeBoxX, codeBoxY, codeBoxW, codeBoxH, 10);
      ctx.fill();

      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#664a10';
      ctx.font = 'bold 15px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`@${botUsername}`, width / 2, codeBoxY + codeBoxH / 2);
      ctx.textBaseline = 'alphabetic';

      // 12. Footer
      ctx.fillStyle = '#9c8141';
      ctx.font = '600 11px sans-serif';
      ctx.fillText('Official Promoter Invitation • Powered by HDASE BINGO', width / 2, 1056);

      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error generating promoter flyer canvas', e);
      return null;
    }
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

  // Filter Finished Games Report by ROOM CATEGORY, ADVANCED DATE/PERIOD, and search query
  const filteredRecentGames = useMemo(() => {
    return recentGames.filter((g) => {
      // 1. Room category filter
      if (reportRoomFilter !== 'all' && g.room_id !== reportRoomFilter) return false;

      // 2. Period / Date filter
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
        } else if (reportPeriod === '3months') {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(now.getMonth() - 3);
          if (gDate < threeMonthsAgo) return false;
        } else if (reportPeriod === 'yearly') {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(now.getFullYear() - 1);
          if (gDate < oneYearAgo) return false;
        } else if (reportPeriod === 'custom') {
          const raw = customRangeText.trim();
          if (raw) {
            const parts = raw.split(/\s*-\s*|\s+to\s+/i);
            const partFrom = parts[0]?.trim() || '';
            const partTo = (parts[1] || parts[0])?.trim() || '';

            const parseDatePart = (input: string, isEnd: boolean): Date | null => {
              if (!input) return null;
              if (input.includes('/') || (input.includes('-') && input.length > 4)) {
                const sub = input.split(/[-/]/);
                const day = parseInt(sub[0]);
                const month = sub[1] ? parseInt(sub[1]) - 1 : now.getMonth();
                const year = sub[2] ? parseInt(sub[2]) : now.getFullYear();
                if (isNaN(day)) return null;
                const d = new Date(year, isNaN(month) ? now.getMonth() : month, day);
                if (isEnd) d.setHours(23, 59, 59, 999);
                else d.setHours(0, 0, 0, 0);
                return d;
              } else {
                const day = parseInt(input);
                if (isNaN(day) || day < 1 || day > 31) return null;
                const d = new Date(now.getFullYear(), now.getMonth(), day);
                if (isEnd) d.setHours(23, 59, 59, 999);
                else d.setHours(0, 0, 0, 0);
                return d;
              }
            };

            const from = parseDatePart(partFrom, false);
            const to = parseDatePart(partTo, true);

            if (from && gDate < from) return false;
            if (to && gDate > to) return false;
          }
        }
      }

      // 3. Search query filter
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
  }, [recentGames, reportRoomFilter, reportPeriod, customRangeText, reportSearchQuery]);

  const reportTotalCommission = useMemo(() => {
    return filteredRecentGames.reduce((acc, g) => acc + (g.agent_commission || 0), 0);
  }, [filteredRecentGames]);

  // Group filtered finished games by room for collapsible room sections
  const groupedRoomReports = useMemo(() => {
    const map = new Map<string, {
      roomId: string;
      roomName: string;
      games: typeof recentGames;
      totalCommission: number;
      totalPot: number;
      totalPlayers: number;
    }>();

    filteredRecentGames.forEach((game) => {
      const key = game.room_id || game.room_name || 'unassigned';
      if (!map.has(key)) {
        map.set(key, {
          roomId: key,
          roomName: game.room_name || 'Promoted Room',
          games: [],
          totalCommission: 0,
          totalPot: 0,
          totalPlayers: 0,
        });
      }
      const entry = map.get(key)!;
      entry.games.push(game);
      entry.totalCommission += (game.agent_commission || 0);
      entry.totalPot += (game.prize_pool || 0);
      entry.totalPlayers += (game.total_players || 0);
    });

    return Array.from(map.values());
  }, [filteredRecentGames]);

  const areAllRoomsExpanded = useMemo(() => {
    if (groupedRoomReports.length === 0) return false;
    return groupedRoomReports.every((g) => expandedRoomIds[g.roomId]);
  }, [groupedRoomReports, expandedRoomIds]);

  const toggleRoomExpanded = (roomId: string) => {
    triggerHaptic('light');
    setExpandedRoomIds((prev) => ({
      ...prev,
      [roomId]: !prev[roomId],
    }));
  };

  const toggleAllRooms = () => {
    triggerHaptic('medium');
    const newState = !areAllRoomsExpanded;
    const next: Record<string, boolean> = {};
    groupedRoomReports.forEach((g) => {
      next[g.roomId] = newState;
    });
    setExpandedRoomIds(next);
  };

  const liveStakes = [10, 20, 50, 100];
  const promoterRate =
    selectedRoom?.promoter_commission_rate ??
    stats?.promoter_commission_rate ??
    (user as any)?.commission_rate ??
    (user as any)?.promoter_commission_rate ??
    3;

  // Promoter moving horizontal ticker items
  const promoterMarqueeItems = useMemo(() => {
    const promoterName = (user?.first_name || user?.username || 'PROMOTER').toUpperCase();
    const items = [
      `🏆 PROMOTER • ${promoterName}`,
      `⚡ ${promoterRate}% COMMISSION PER MATCH`,
      '💰 PASSIVE DAILY EARNINGS',
      '🎱 HDASE BINGO NETWORK',
    ];
    if (promotedRooms && promotedRooms.length > 0) {
      promotedRooms.forEach((r) => {
        items.push(`🏢 ${r.room_name}`);
      });
    }
    return items;
  }, [user, promotedRooms, promoterRate]);

  // Agent-style branded loading screen — matches Agent.tsx exactly
  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between py-12 px-6 bg-gradient-to-b from-white via-slate-50 to-amber-50/30 text-slate-800 select-none overflow-hidden">
        {/* Ambient soft background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full" />

        {/* Center brand & animated bingo badge */}
        <div className="flex flex-col items-center text-center relative z-10 space-y-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 shadow-[0_12px_36px_rgba(245,158,11,0.25)] flex items-center justify-center p-1.5 animate-pulse">
              <div className="w-full h-full rounded-[20px] bg-gradient-to-b from-white to-amber-50/90 flex flex-col items-center justify-center border border-amber-300/40 shadow-inner">
                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-600 via-yellow-600 to-amber-700">
                  75
                </span>
                <span className="text-[9px] font-black tracking-widest text-amber-600 uppercase -mt-0.5">
                  BINGO
                </span>
              </div>
            </div>
            {/* Spinning decorative orbit ring */}
            <div className="absolute -inset-2.5 rounded-[32px] border border-amber-400/25 border-t-amber-500 animate-spin pointer-events-none" style={{ animationDuration: '3s' }} />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-3xl font-black tracking-wider text-slate-900 drop-shadow-sm">
              HDASE <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-yellow-600">BINGO</span>
            </h1>
            <p className="text-xs font-bold text-amber-700/80 tracking-widest uppercase mt-1">
              ሕዳሴ ቢንጎ • ይጫወቱ ያሸንፉ
            </p>
          </div>

          {/* Modern Glowing Loading Bar */}
          <div className="w-48 space-y-2.5 pt-2">
            <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden p-0.5 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 rounded-full shadow-sm"
                style={{ width: '100%', animation: 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium tracking-wide">
              በመጫን ላይ... Loading promoter room
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center relative z-10 text-[10px] text-slate-400 font-semibold tracking-wider">
          🇪🇹 Official Ethiopian Bingo Platform
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        setShowRoomDropdown(false);
        setShowPeriodDropdown(false);
      }}
      className="min-h-screen bg-slate-50 text-slate-800 select-none pb-20 font-sans"
    >
      {/* ─── STICKY TOP APP BAR ─── */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Avatar & Name */}
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-amber-400 ring-offset-1 ring-offset-white shrink-0">
              {(user?.first_name || 'P').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900 leading-tight truncate">
                {user?.first_name || user?.username || 'Promoter'}
              </p>
              <span className="inline-flex items-center space-x-0.5 text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Zap size={10} className="text-emerald-500 fill-emerald-500" />
                <span>{promoterRate}% Commission</span>
              </span>
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
                {formatAmount((user as any)?.main_balance ?? 0)} <span className="text-[10px] font-extrabold">ETB</span>
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

        {/* ─── HDASE BINGO HERO BANNER (With Moving Promoter Marquee) ─── */}
        <div
          onClick={() => {
            triggerHaptic('medium');
            setActiveTab('rooms');
            setRoomDetailMode(false);
          }}
          className="block relative rounded-3xl overflow-hidden shadow-md border border-amber-200/90 cursor-pointer active:scale-98 transition-all p-5 pt-7 pb-9"
          style={{
            background: 'linear-gradient(135deg, #fffbf0 0%, #fef3c7 40%, #fff8e8 70%, #fffbf0 100%)',
          }}
        >
          {/* Subtle radial glow in center */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 50% 60%, rgba(251,191,36,0.20) 0%, transparent 70%)',
            }}
          />
          {/* Top border accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

          {/* Scrolling marquee strip — live promoter info & rooms */}
          <div className="absolute top-1 left-0 right-0 overflow-hidden py-1.5 bg-amber-50/80 border-b border-amber-200/60" style={{ top: '4px' }}>
            <div className="flex whitespace-nowrap animate-marquee">
              {Array.from({ length: 6 }).flatMap(() => promoterMarqueeItems).map((item, i) => (
                <span key={i} className="text-amber-700 font-black text-[10px] uppercase tracking-[0.2em] px-4 shrink-0 flex items-center gap-1">
                  {item} &nbsp;·&nbsp;
                </span>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="relative z-10 flex flex-col items-center text-center space-y-2.5 pt-3">
            <div className="inline-flex items-center space-x-1.5 text-[10px] font-black tracking-wider uppercase text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE BINGO • PROMOTER</span>
            </div>

            <div>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-slate-900 font-black text-3xl tracking-wide leading-none drop-shadow-sm">HDASE</span>
                <span className="text-orange-500 font-black text-3xl tracking-wide leading-none drop-shadow-sm">BINGO</span>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-1 max-w-xs">
                Earn {promoterRate}% commission on every game played in your invited rooms
              </p>
            </div>

            <div className="px-6 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-full text-xs font-black tracking-wider uppercase shadow-md shadow-orange-500/25 active:scale-95 transition-all flex items-center space-x-1.5 mb-1">
              <span>VIEW ROOMS →</span>
            </div>
          </div>

          {/* ── Phone numbers & Support indicator — bottom corners ── */}
          <div className="absolute bottom-1 left-1.5 right-1.5 flex justify-between items-center pointer-events-none z-20">
            {/* USA — bottom left */}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                triggerHaptic('medium');
                window.location.href = `tel:${supportPhoneUsa.replace(/[\s()\-]/g, '')}`;
              }}
              className="pointer-events-auto flex items-center gap-1 p-0.5 rounded text-black active:scale-95 active:opacity-75 transition-all shrink-0"
            >
              <span className="text-[15px] leading-none" role="img" aria-label="USA">🇺🇸</span>
              <span className="text-[11px] font-black leading-none tracking-tight">{supportPhoneUsa}</span>
            </button>

            {/* Center "SUPPORT" badge with arrows pointing toward USA & Ethiopia */}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                triggerHaptic('medium');
                navigate('/support');
              }}
              className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-400 via-cyan-400 to-teal-400 text-slate-900 border border-cyan-200/90 shadow-sm active:scale-95 transition-all select-none"
            >
              <span className="text-xs font-black text-slate-900 leading-none">←</span>
              <span className="text-[9.5px] font-black tracking-widest uppercase leading-none">
                SUPPORT
              </span>
              <span className="text-xs font-black text-slate-900 leading-none">→</span>
            </button>

            {/* Ethiopia — bottom right */}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                triggerHaptic('medium');
                window.location.href = `tel:${formatEthPhone(supportPhoneEth).replace(/[\s()\-]/g, '')}`;
              }}
              className="pointer-events-auto flex items-center gap-1 p-0.5 rounded text-black active:scale-95 active:opacity-75 transition-all shrink-0"
            >
              <span className="text-[15px] leading-none" role="img" aria-label="Ethiopia">🇪🇹</span>
              <span className="text-[11px] font-black leading-none tracking-tight">{formatEthPhone(supportPhoneEth)}</span>
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
            <span>Rooms</span>
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
                    {promotedRooms.map((rm) => {
                      const storeRoom = rooms.find((r) => r.id === rm.id);
                      const displayPlayers = (rm.total_players !== undefined && rm.total_players > 0)
                        ? rm.total_players
                        : (storeRoom?.total_players ?? rm.total_players ?? 0);
                      const displayGames = Math.max(rm.total_games || 0, storeRoom?.total_games || 0);

                      return (
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
                                  {displayPlayers}
                                </span>
                              </div>
                              <div className="bg-slate-50 p-1.5 rounded-lg">
                                <span className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase">Games</span>
                                <span className="text-sm font-black text-purple-600">
                                  {displayGames}
                                </span>
                              </div>
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
                      );
                    })}
                  </div>
                )}
              </div>
            ) : selectedLiveStake !== null ? (
              /* ─── VIEW C: TABLE MONITOR / LIVE ROOM CONTROL PANEL (Matches Image 2 / Agent Section) ─── */
              (() => {
                const detailGame = activeGames.find((g) => Number(g.stake) === selectedLiveStake);
                const rawPool = Number(detailGame?.prize_pool || 0);
                const players = Number(detailGame?.total_players || 0);
                const estPot = detailGame
                  ? (players >= 3 && rawPool > 0
                      ? Math.round(rawPool / 0.8)
                      : (rawPool || detailGame.stake * players))
                  : 0;
                const estComm = (estPot * promoterRate) / 100;
                const lastWin = recentGames.find(
                  (g) => Number(g.stake) === selectedLiveStake && g.room_id === selectedRoom?.id
                ) || recentGames.find((g) => Number(g.stake) === selectedLiveStake);

                return (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    {/* Back button header */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => { triggerHaptic('light'); setSelectedLiveStake(null); }}
                        className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all shadow-2xs shrink-0"
                      >
                        <ChevronLeft size={16} />
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
                              <p className="text-2xl font-black leading-none">{formatAmount(selectedLiveStake)}</p>
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
                              <p className="text-base font-black leading-none">{formatAmount(estPot)}</p>
                              <p className="text-[9px] font-bold opacity-80 mt-0.5">Pot (ETB)</p>
                            </div>
                            <div className="bg-white/20 rounded-xl p-2 text-center">
                              <p className="text-base font-black leading-none">{formatAmount(estComm)}</p>
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
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Est. Promoter Commission</p>
                                <p className="text-sm font-black text-emerald-600">+{formatAmount(estComm)} ETB</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] text-slate-400 font-medium">Rate</p>
                              <p className="text-xs font-black text-slate-800">{promoterRate}%</p>
                            </div>
                          </div>
                        </div>

                        {/* Active Players Card */}
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
                          Players join via room link to start a new table.
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
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="text-sm font-black text-slate-800">🏆 {lastWin.winner_first_name}</span>
                              {lastWin.winner_cartela && (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black tracking-tight shadow-2xs">
                                  <Ticket size={11} className="text-amber-600" />
                                  <span>{lastWin.winner_cartela}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-amber-600">{formatAmount(lastWin.winner_prize)} ETB</p>
                            <p className="text-[9px] text-emerald-600 font-bold">Your cut: +{formatAmount(lastWin.agent_commission)} ETB</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              /* ─── VIEW B: INSIDE SELECTED ROOM (4 Live Stake Cards) ─── */
              <div className="space-y-3.5">
                {/* Back button & Room header */}
                <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                  <button
                    onClick={() => { triggerHaptic('light'); setSelectedLiveStake(null); setRoomDetailMode(false); }}
                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black active:scale-95 transition-all"
                  >
                    <ChevronLeft size={14} />
                    <span>All Rooms</span>
                  </button>

                  <div className="text-right min-w-0 ml-3">
                    <p className="text-sm font-black text-slate-900 truncate leading-tight">
                      {selectedRoom?.room_name}
                    </p>
                    <span className="inline-flex items-center space-x-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 mt-1">
                      <Zap size={10} className="text-emerald-500 fill-emerald-500" />
                      <span>{promoterRate}% Promoter Cut</span>
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
                {activeGames.filter(g => g.status === 'calling').length > 0 ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{activeGames.filter(g => g.status === 'calling').length} Live</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                    0 Live
                  </span>
                )}
                </div>

                {/* 4 Stake Cards (10, 20, 50, 100 ETB) */}
                <div className="grid grid-cols-2 gap-2.5">
                  {liveStakes.map((stake) => {
                    const game = activeGames.find((g) => Number(g.stake) === stake);
                    const isCalling = game?.status === 'calling';
                    const isWaiting = game?.status === 'waiting';
                    const hasGame = !!game;
                    const playerCount = game?.total_players || 0;
                    const estPot = (playerCount >= 3 && game?.prize_pool)
                      ? game.prize_pool
                      : stake * playerCount;
                    const estComm = (estPot * promoterRate) / 100;

                    // Card color: green when calling/live, orange when waiting, slate when no game
                    const cardGradient = isCalling
                      ? 'bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 shadow-emerald-500/20'
                      : isWaiting
                        ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 shadow-orange-500/15'
                        : 'bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700 shadow-slate-500/15';

                    const subtleText = isCalling ? 'text-emerald-100' : isWaiting ? 'text-amber-100' : 'text-slate-300';

                    return (
                      <div
                        key={stake}
                        onClick={() => { triggerHaptic('light'); setSelectedLiveStake(stake); }}
                        className={`relative overflow-hidden rounded-3xl ${cardGradient} text-white p-4 shadow-md cursor-pointer active:scale-98 transition-all flex flex-col justify-between h-40`}
                      >
                        {/* Green pulse ring when LIVE */}
                        {isCalling && (
                          <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-emerald-400/20 animate-ping pointer-events-none" />
                        )}

                        {/* Top Row: Stake & Status Badge */}
                        <div className="flex items-start justify-between relative z-10">
                          <div>
                            <span className="text-3xl font-black tracking-tight leading-none">{stake}</span>
                            <p className={`text-[9px] font-black uppercase tracking-wider ${subtleText}`}>ETB STAKE</p>
                          </div>
                          <span className={`inline-flex items-center space-x-1 text-[9px] font-black px-2 py-0.5 rounded-full ${
                            isCalling
                              ? 'bg-white/25 text-white border border-white/30'
                              : isWaiting
                                ? 'bg-black/20 text-white border border-white/20'
                                : 'bg-white/10 text-slate-200 border border-white/10'
                          }`}>
                            {isCalling ? <Flame size={9} className="animate-pulse" /> : <Clock size={9} />}
                            <span>{isCalling ? 'LIVE' : hasGame ? 'WAIT' : 'IDLE'}</span>
                          </span>
                        </div>

                        {/* Middle: Player count & Est. Comm */}
                        <div className="space-y-0.5 relative z-10">
                          <div className={`flex justify-between text-[11px] ${subtleText}`}>
                            <span>Players</span>
                            <span className="font-black text-white">{playerCount}</span>
                          </div>
                          <div className={`flex justify-between text-[11px] ${subtleText}`}>
                            <span>Est. Comm</span>
                            <span className="font-black text-white">+{formatAmount(estComm)} ETB</span>
                          </div>
                        </div>

                        {/* Bottom: View Details link */}
                        <div className={`pt-2 border-t border-white/20 flex items-center justify-between text-[10px] font-bold ${subtleText} relative z-10`}>
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
                  <p className="text-[10px] text-slate-400">Games and {promoterRate}% commission earned across your rooms</p>
                </div>
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {filteredRecentGames.length} Finished
                </span>
              </div>
            </div>

            {/* ─── PARALLEL FILTERS: Room Selector + Advanced Day/Period Selector on ONE Row ─── */}
            <div className="flex items-center space-x-2">
              {/* 1. ROOM SELECTOR DROPDOWN */}
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    setShowRoomDropdown((v) => !v);
                    setShowPeriodDropdown(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black border transition-all ${
                    reportRoomFilter !== 'all'
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : showRoomDropdown
                      ? 'bg-slate-100 text-slate-900 border-slate-300'
                      : 'bg-white text-slate-700 border-slate-200 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 truncate mr-1">
                    <Building2 size={13} className={reportRoomFilter !== 'all' ? 'text-white' : 'text-amber-500'} />
                    <span className="truncate">
                      {reportRoomFilter === 'all'
                        ? 'All Rooms'
                        : (promotedRooms.find((r) => r.id === reportRoomFilter)?.room_name || 'Selected Room')}
                    </span>
                  </div>
                  <ChevronDown size={13} className={`shrink-0 transition-transform ${showRoomDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Room Dropdown Menu */}
                {showRoomDropdown && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 top-full mt-1.5 z-40 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 space-y-1 w-full min-w-[190px] max-w-[260px] animate-in fade-in duration-150"
                  >
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-1">Filter by Room</p>
                    <div className="space-y-0.5 max-h-56 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setReportRoomFilter('all');
                          setShowRoomDropdown(false);
                        }}
                        className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-black border transition-all text-left flex items-center justify-between ${
                          reportRoomFilter === 'all'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-transparent hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">All Rooms ({promotedRooms.length})</span>
                        {reportRoomFilter === 'all' && <Check size={12} className="text-white shrink-0 ml-1" />}
                      </button>

                      {promotedRooms.map((rm) => (
                        <button
                          key={rm.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setReportRoomFilter(rm.id);
                            setShowRoomDropdown(false);
                          }}
                          className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-black border transition-all text-left flex items-center justify-between ${
                            reportRoomFilter === rm.id
                              ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-transparent hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">{rm.room_name}</span>
                          {reportRoomFilter === rm.id && <Check size={12} className="text-white shrink-0 ml-1" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. DATE / PERIOD SELECTOR DROPDOWN (PARALLEL) */}
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    setShowPeriodDropdown((v) => !v);
                    setShowRoomDropdown(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black border transition-all ${
                    reportPeriod !== 'all'
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : showPeriodDropdown
                      ? 'bg-slate-100 text-slate-900 border-slate-300'
                      : 'bg-white text-slate-700 border-slate-200 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 truncate mr-1">
                    <Calendar size={13} className={reportPeriod !== 'all' ? 'text-white' : 'text-slate-500'} />
                    <span className="truncate">
                      {reportPeriod === 'all' ? 'All Time' :
                       reportPeriod === 'today' ? 'Today' :
                       reportPeriod === 'yesterday' ? 'Yesterday' :
                       reportPeriod === 'weekly' ? 'This Week' :
                       reportPeriod === 'monthly' ? 'This Month' :
                       reportPeriod === '3months' ? '3 Months' :
                       reportPeriod === 'yearly' ? '1 Year' :
                       customRangeText ? `Days ${customRangeText}` : 'Custom'}
                    </span>
                  </div>
                  <ChevronDown size={13} className={`shrink-0 transition-transform ${showPeriodDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Period Dropdown Menu */}
                {showPeriodDropdown && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1.5 z-40 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 space-y-1 w-full min-w-[190px] max-w-[260px] animate-in fade-in duration-150"
                  >
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-1">Filter by Date</p>
                    <div className="space-y-0.5 max-h-56 overflow-y-auto">
                      {[
                        { key: 'all', label: 'All Time' },
                        { key: 'today', label: 'Today' },
                        { key: 'yesterday', label: 'Yesterday' },
                        { key: 'weekly', label: 'This Week' },
                        { key: 'monthly', label: 'This Month' },
                        { key: '3months', label: 'Last 3 Months' },
                        { key: 'yearly', label: 'Last 1 Year' },
                        { key: 'custom', label: 'Custom (e.g. 13-29)' },
                      ].map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setReportPeriod(p.key as any);
                            if (p.key !== 'custom') {
                              setCustomRangeText('');
                              setShowPeriodDropdown(false);
                            }
                          }}
                          className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-black border transition-all text-left flex items-center justify-between ${
                            reportPeriod === p.key
                              ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-transparent hover:bg-slate-100'
                          }`}
                        >
                          <span>{p.label}</span>
                          {reportPeriod === p.key && <Check size={12} className="text-amber-400 shrink-0 ml-1" />}
                        </button>
                      ))}
                    </div>

                    {/* Custom input */}
                    {reportPeriod === 'custom' && (
                      <div className="pt-2 border-t border-slate-100 space-y-1.5 px-0.5">
                        <p className="text-[9px] font-bold text-slate-500">
                          Day range (e.g. <span className="font-mono text-amber-600 font-bold">13-29</span>)
                        </p>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="text"
                            placeholder="e.g. 13-29 or 13"
                            value={customRangeText}
                            onChange={(e) => {
                              setCustomRangeText(e.target.value);
                              setReportPeriod('custom');
                            }}
                            className="flex-1 min-w-0 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setShowPeriodDropdown(false);
                            }}
                            className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-[10px] font-bold shadow-2xs shrink-0"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
              <div className="flex items-center space-x-1.5">
                <span>
                  {groupedRoomReports.length} {groupedRoomReports.length === 1 ? 'Room' : 'Rooms'} ({filteredRecentGames.length} {filteredRecentGames.length === 1 ? 'game' : 'games'})
                </span>
                {groupedRoomReports.length > 1 && (
                  <button
                    type="button"
                    onClick={toggleAllRooms}
                    className="text-[10px] text-amber-600 hover:text-amber-700 font-extrabold underline ml-1 active:scale-95 transition-all"
                  >
                    {areAllRoomsExpanded ? 'Collapse All' : 'Expand All'}
                  </button>
                )}
              </div>
              <span className="text-emerald-600 font-black">
                Total Comm: +{formatAmount(reportTotalCommission)} ETB
              </span>
            </div>

            {/* List of Collapsible Room Report Cards */}
            {groupedRoomReports.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center text-slate-400">
                <Trophy size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-black text-slate-700">No Finished Games Found</p>
                <p className="text-[10px] text-slate-400 mt-1">Games played in your rooms will appear here with your commission.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedRoomReports.map((group) => {
                  const isExpanded =
                    reportSearchQuery.trim().length > 0 ||
                    reportRoomFilter !== 'all' ||
                    !!expandedRoomIds[group.roomId];

                  return (
                    <div
                      key={group.roomId}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all duration-200"
                    >
                      {/* Clickable Room Header Banner (Click to toggle details) */}
                      <button
                        type="button"
                        onClick={() => toggleRoomExpanded(group.roomId)}
                        className={`w-full text-left p-3.5 transition-colors flex flex-col space-y-2.5 active:bg-amber-50/40 ${
                          isExpanded
                            ? 'bg-gradient-to-r from-amber-50/70 via-orange-50/30 to-white'
                            : 'bg-white hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                                isExpanded
                                  ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white border-amber-300 shadow-xs'
                                  : 'bg-amber-50 text-amber-700 border-amber-200/80'
                              }`}
                            >
                              <Building2 size={18} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-black text-slate-900 truncate tracking-tight">
                                {group.roomName}
                              </h4>
                              <p className="text-[10px] font-bold text-slate-400 flex items-center space-x-1.5 mt-0.5">
                                <span className="text-amber-700 font-extrabold">
                                  {group.games.length} finished {group.games.length === 1 ? 'game' : 'games'}
                                </span>
                                <span>•</span>
                                <span>👥 {group.totalPlayers} total players</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            <div className="text-right">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Earned</p>
                              <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg inline-block">
                                +{formatAmount(group.totalCommission)} ETB
                              </span>
                            </div>
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-transform duration-200 ${
                                isExpanded ? 'bg-amber-100 text-amber-800 rotate-180' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              <ChevronDown size={15} />
                            </div>
                          </div>
                        </div>

                        {/* Room Mini Stat Bar */}
                        <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/90 rounded-xl py-1.5 px-1 border border-slate-100">
                          <div className="text-center px-1">
                            <span className="text-[8px] font-bold text-slate-400 uppercase">Games</span>
                            <p className="text-[11px] font-black text-slate-800 leading-tight">
                              {group.games.length}
                            </p>
                          </div>
                          <div className="text-center px-1">
                            <span className="text-[8px] font-bold text-slate-400 uppercase">Pot Pool</span>
                            <p className="text-[11px] font-black text-slate-800 leading-tight">
                              {formatAmount(group.totalPot)} ETB
                            </p>
                          </div>
                          <div className="text-center px-1">
                            <span className="text-[8px] font-bold text-emerald-600 uppercase">Commission</span>
                            <p className="text-[11px] font-black text-emerald-600 leading-tight">
                              +{formatAmount(group.totalCommission)} ETB
                            </p>
                          </div>
                        </div>

                        {/* Expand / Collapse Indicator Hint */}
                        <div className="flex items-center justify-between text-[9px] font-bold px-0.5 pt-0.5">
                          <span className={isExpanded ? 'text-amber-700' : 'text-slate-400'}>
                            {isExpanded ? '▲ Hide room games report' : '▼ Click to view detailed room games'}
                          </span>
                          <span className="text-amber-600 font-extrabold">
                            {isExpanded ? 'Collapse' : 'Details →'}
                          </span>
                        </div>
                      </button>

                      {/* Expanded Section: Individual Finished Games for this Room */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/60 p-2.5 space-y-2 animate-in fade-in duration-200">
                          {group.games.map((game) => (
                            <div
                              key={game.id}
                              className="bg-white rounded-xl border border-slate-200/70 shadow-2xs overflow-hidden"
                            >
                              {/* Top bar: Game ID + Time */}
                              <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-[10px] font-black text-slate-700">
                                  #{formatGameId(game.id)}
                                </span>
                                <span className="text-[9px] text-slate-400 shrink-0">
                                  {new Date(game.finished_at || game.created_at).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>

                              {/* Middle: Winner row */}
                              <div className="px-3 pb-2 flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-xs shrink-0">
                                    🏆
                                  </div>
                                  <div>
                                    <p className="text-[8.5px] text-slate-400 font-bold uppercase leading-none">
                                      Winner
                                    </p>
                                    <div className="flex items-center space-x-1.5 mt-0.5 flex-wrap">
                                      <span className="text-xs font-black text-slate-900 leading-tight">
                                        {game.winner_first_name}
                                      </span>
                                      {game.winner_cartela && (
                                        <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[9.5px] font-black tracking-tight shadow-2xs">
                                          <Ticket size={9} className="text-amber-600" />
                                          <span>{game.winner_cartela}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[9.5px] text-slate-400 font-medium">
                                  👥 {game.total_players} players
                                </span>
                              </div>

                              {/* Bottom: 3-chip horizontal stats row */}
                              <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
                                {/* Commission */}
                                <div className="flex flex-col items-center py-2 px-1 bg-emerald-50">
                                  <p className="text-[7.5px] font-black text-emerald-600 uppercase tracking-wide">
                                    Commission
                                  </p>
                                  <p className="text-xs font-black text-emerald-700 leading-tight">
                                    +{formatAmount(game.agent_commission)}
                                  </p>
                                  <p className="text-[7.5px] text-emerald-500 font-bold">{game.commission_rate}% ETB</p>
                                </div>
                                {/* Pot */}
                                <div className="flex flex-col items-center py-2 px-1">
                                  <p className="text-[7.5px] font-black text-slate-500 uppercase tracking-wide">Pot</p>
                                  <p className="text-xs font-black text-slate-800 leading-tight">
                                    {formatAmount(game.prize_pool)}
                                  </p>
                                  <p className="text-[7.5px] text-slate-400 font-bold">ETB</p>
                                </div>
                                {/* Stake */}
                                <div className="flex flex-col items-center py-2 px-1 bg-slate-50">
                                  <p className="text-[7.5px] font-black text-slate-500 uppercase tracking-wide">Stake</p>
                                  <p className="text-xs font-black text-amber-600 leading-tight">
                                    {formatAmount(game.stake)}
                                  </p>
                                  <p className="text-[7.5px] text-slate-400 font-bold">ETB ✅</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB 4: QR FLYER (PROMOTER'S PERMANENT INVITATION LINK) ════════════ */}
        {activeTab === 'qr' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Table Flyer Card — Promotes the Promoter's Unique Invitation Link */}
            <div
              className="relative overflow-hidden rounded-3xl border-2 border-[#c59b27] p-4 text-center shadow-md"
              style={{
                background: 'linear-gradient(180deg, #ffffff 0%, #fdfcf9 40%, #faf4e8 100%)',
              }}
            >
              {/* Inner thin gold accent border */}
              <div className="border border-[#e6c86e]/70 rounded-2xl p-3.5 space-y-2.5">
                {/* 1. Royal Crown & Medallion Emblem */}
                <div className="flex flex-col items-center justify-center">
                  <div className="flex items-center space-x-1.5 text-[#b8860b]">
                    <span className="w-8 h-px bg-[#d4af37]" />
                    <Crown size={22} className="text-[#d4af37] fill-[#d4af37]/20 drop-shadow-xs" />
                    <span className="w-8 h-px bg-[#d4af37]" />
                  </div>
                  {/* Circular Medallion */}
                  <div className="w-9 h-9 rounded-full bg-[#1b140c] border-2 border-[#d4af37] ring-1 ring-[#fef08a] flex items-center justify-center mt-1 shadow-sm">
                    <span className="font-serif font-black text-xs text-[#fef08a] tracking-wider">HB</span>
                  </div>
                </div>

                {/* 2. Main Title "HDASE BINGO" */}
                <div>
                  <h3 className="font-serif font-black text-2xl tracking-[0.15em] text-[#140f09] uppercase drop-shadow-2xs">
                    HDASE BINGO
                  </h3>
                  <div className="flex items-center justify-center space-x-2 text-[10px] font-bold text-[#8a6a1d] uppercase tracking-wider mt-0.5">
                    <span className="w-6 h-px bg-[#d4af37]" />
                    <span>Official Promoter • {(user?.first_name || user?.username || 'Promoter').toUpperCase()}</span>
                    <span className="w-6 h-px bg-[#d4af37]" />
                  </div>
                </div>

                {/* 3. Bold "SCAN TO PLAY" */}
                <div className="flex items-center justify-center space-x-2 pt-0.5">
                  <span className="text-[#c59b27] font-black text-sm">⮞</span>
                  <span className="font-serif font-black text-lg text-[#140f09] tracking-wider">
                    SCAN TO PLAY
                  </span>
                  <span className="text-[#c59b27] font-black text-sm">⮜</span>
                </div>

                {/* 4. Golden Ribbon Banner */}
                <div
                  className="mx-auto px-4 py-1.5 rounded-full border border-[#a67718] shadow-2xs max-w-xs flex items-center justify-center space-x-1"
                  style={{
                    background: 'linear-gradient(90deg, #ebd596 0%, #deb55b 50%, #ebd596 100%)',
                  }}
                >
                  <span className="text-[10px] font-black text-[#3a2707] uppercase tracking-wider">
                    Scan the QR code to
                  </span>
                  <span className="font-serif italic font-black text-xs text-[#831414]">
                    Play & Win Cash!
                  </span>
                </div>

                {/* 5. Central White QR Code Card with double gold border */}
                <div className="relative mx-auto w-fit p-3 bg-white rounded-3xl border-[3px] border-[#c59b27] ring-2 ring-[#fae596] shadow-sm my-1">
                  {/* Corner decorative brackets */}
                  <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-[#b8860b] rounded-tl-sm pointer-events-none" />
                  <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-[#b8860b] rounded-tr-sm pointer-events-none" />
                  <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-[#b8860b] rounded-bl-sm pointer-events-none" />
                  <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-[#b8860b] rounded-br-sm pointer-events-none" />

                  <div className="relative">
                    <QRCodeCanvas
                      ref={qrCanvasRef}
                      value={promoterInviteLink}
                      size={200}
                      level="H"
                      includeMargin={false}
                      fgColor="#0f172a"
                      bgColor="#ffffff"
                    />

                    {/* Center HDASE BINGO Badge */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-gradient-to-r from-amber-500 to-yellow-400 border-2 border-white shadow-lg rounded-xl px-2.5 py-1 flex flex-col items-center justify-center" style={{ minWidth: 68 }}>
                        <span className="text-[8px] font-black text-white/80 uppercase tracking-widest leading-none">HDASE</span>
                        <span className="text-[11px] font-black text-white leading-none tracking-wider">BINGO</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6. 4 Features row (Jackpot, Instant Pay, 75 Bingo, 100% Safe) */}
                <div className="grid grid-cols-4 divide-x divide-[#d4af37]/50 pt-1 text-center">
                  <div className="px-1">
                    <p className="text-sm">🏆</p>
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">Jackpot</p>
                  </div>
                  <div className="px-1">
                    <p className="text-sm">⚡</p>
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">Instant</p>
                  </div>
                  <div className="px-1">
                    <p className="text-sm">🎱</p>
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">75 Bingo</p>
                  </div>
                  <div className="px-1">
                    <p className="text-sm">🛡️</p>
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">Verified</p>
                  </div>
                </div>

                {/* 7. Cursive motto */}
                <p className="font-serif italic font-bold text-xs text-[#221609] pt-0.5">
                  Real Players &nbsp;•&nbsp; Good Luck &nbsp;•&nbsp; Big Wins
                </p>

                {/* 8. Official Bot Link Box */}
                <div className="mx-auto w-fit px-5 py-1.5 bg-[#fbf6ea] border border-[#c59b27] rounded-xl shadow-2xs">
                  <span className="font-bold text-xs text-[#664a10] tracking-wide">@{botUsername}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex space-x-2 pt-3">
                <button
                  onClick={handleDownloadFlyer}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-[#fef08a] rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-sm border border-amber-500/30"
                >
                  {downloadedQR ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Download size={15} />}
                  <span>{downloadedQR ? 'Saved to Gallery!' : 'Save Flyer'}</span>
                </button>
                <button
                  onClick={handleSendFlyerToTelegram}
                  disabled={isSavingFlyer}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-sm"
                >
                  <Send size={15} className={isSavingFlyer ? 'animate-spin' : ''} />
                  <span>{flyerSentToTg ? 'Sent to Bot!' : 'Send to Bot'}</span>
                </button>
              </div>
            </div>

            {/* Direct Promoter Share Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800">Your Permanent Promoter Invite Link</span>
                <span className="text-[10px] font-bold text-violet-600">⚡ {promoterRate}% Commission</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Anyone who joins with this link is linked to you. When they become an agent and are assigned a room, you automatically earn {promoterRate}% commission on every game!
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
    </div>
  );
}
