import { useEffect, useState, useMemo, useRef } from 'react';
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
  Info,
  Download,
  CheckCircle2,
  Crown,
  Printer,
  Send,
  ExternalLink,
  X,
  Image,
  Ticket,
  Fingerprint,
  ArrowDownToLine,
  Coins,
  BadgeDollarSign,
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

export default function Agent() {
  const { user, fetchUser } = useGameStore();
  const navigate = useNavigate();

  // Instant cache retrieval to prevent any second loading flash
  const initialCache = useMemo(() => {
    try {
      const raw = localStorage.getItem('hdase_agent_cache');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }, []);

  const [room, setRoom] = useState<AgentRoom | null>(initialCache?.room || null);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>(initialCache?.active_games || []);
  const [recentGames, setRecentGames] = useState<FinishedGame[]>(initialCache?.recent_games || []);
  const [stats, setStats] = useState<RoomStats | null>(initialCache?.stats || null);
  const [chartData, setChartData] = useState<ChartDay[]>(initialCache?.chart_data || []);

  const [loading, setLoading] = useState(!initialCache?.room);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Interactive UI state
  const [activeTab, setActiveTab] = useState<'overview' | 'live' | 'report' | 'qr'>('overview');
  const [chartMetric, setChartMetric] = useState<'games' | 'commission' | 'volume'>('games');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportPeriod, setReportPeriod] = useState<'all' | 'today' | 'yesterday' | 'weekly' | 'monthly' | '3months' | 'yearly' | 'custom'>('all');
  const [reportStake, setReportStake] = useState<number | 'all'>('all');
  const [selectedLiveStake, setSelectedLiveStake] = useState<number | null>(null);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [customRangeText, setCustomRangeText] = useState('');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSavingFlyer, setIsSavingFlyer] = useState(false);
  const [flyerModalOpen, setFlyerModalOpen] = useState(false);
  const [flyerPreviewUrl, setFlyerPreviewUrl] = useState('');
  const [flyerPublicUrl, setFlyerPublicUrl] = useState('');
  const [flyerSentToTg, setFlyerSentToTg] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [supportPhoneUsa, setSupportPhoneUsa] = useState('+1 (984) 378-9510');
  const [supportPhoneEth, setSupportPhoneEth] = useState('+251999992524');
  const [showProfileModal, setShowProfileModal] = useState(false);

  const formatEthPhone = (phone: string) => {
    if (!phone) return '+251999992524';
    const clean = phone.trim();
    if ((clean.startsWith('09') || clean.startsWith('07')) && clean.length === 10) {
      return '+251' + clean.slice(1);
    }
    return clean;
  };

  // Only calling games count as live matches (waiting games are not live yet)
  const callingGames = useMemo(() => activeGames.filter(g => g.status === 'calling'), [activeGames]);
  const callingGamesCount = callingGames.length;
  const liveCallingPlayers = useMemo(() => callingGames.reduce((acc, g) => acc + (g.total_players || 0), 0), [callingGames]);
  const liveCallingComm = useMemo(() => {
    return callingGames.reduce((acc, g) => {
      const raw = Number(g.prize_pool || 0);
      const players = Number(g.total_players || 0);
      const pot = players >= 3 && raw > 0 ? Math.round(raw / 0.8) : (raw || Number(g.stake || 0) * players);
      return acc + (pot * (room?.commission_rate ?? 8)) / 100;
    }, 0);
  }, [callingGames, room]);

  if (user?.role !== 'agent') {
    return <Navigate to="/" replace />;
  }

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  const roomInviteLink = room
    ? `https://t.me/${botUsername}?start=room_${room.id}`
    : `https://t.me/${botUsername}?start=ref_${user?.telegram_id}`;
  const roomCode = room ? room.id : '';

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

      if (data && data.room) {
        localStorage.setItem('hdase_agent_cache', JSON.stringify(data));
      }

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
    // Hide Telegram's Back button so Telegram displays the native 'X' close/minimize button
    if (typeof WebApp !== 'undefined' && WebApp.BackButton) {
      WebApp.BackButton.hide();
    }
    fetchData();
    fetchUser();

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

  const handleCopyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopiedCode(true);
      triggerSuccessHaptic();
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const generateFlyerCanvas = (): HTMLCanvasElement | null => {
    const qrCanvas = qrCanvasRef.current;
    if (!qrCanvas || !room) return null;

    try {
      const canvas = document.createElement('canvas');
      const width = 800;
      const height = 1150;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

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

      // Gold Crown
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

      // 4. Main Title "HDASE BINGO" (like GRAND HERITAGE RETREAT)
      ctx.fillStyle = '#140f09';
      ctx.font = '900 40px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('HDASE BINGO', width / 2, 142);

      // 5. Subtitle "OFFICIAL AGENT ROOM • [NAME]" with divider lines
      ctx.fillStyle = '#8a6a1d';
      ctx.font = 'bold 12.5px sans-serif';
      const subText = `OFFICIAL AGENT ROOM • ${room.room_name.toUpperCase()}`;
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

      // 7. Gold Ribbon Banner "SCAN THE QR CODE TO Play & Win Daily!"
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
      ctx.fillText('Official Partner Network • Powered by HDASE BINGO', width / 2, 1056);

      return canvas;
    } catch (e) {
      console.error('Error generating flyer canvas', e);
      return null;
    }
  };

  const handleSaveToGallery = async () => {
    if (!room || isSavingFlyer) return;
    setIsSavingFlyer(true);
    triggerHaptic('medium');

    try {
      const canvas = generateFlyerCanvas();
      if (!canvas) {
        setIsSavingFlyer(false);
        return;
      }

      const dataUrl = canvas.toDataURL('image/png');
      setFlyerPreviewUrl(dataUrl);

      // Convert canvas to Blob
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        setIsSavingFlyer(false);
        return;
      }

      const fileName = `hdasebingo-table-flyer-${room.id}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // 1. Send to backend: uploads to R2 and delivers high-res photo to Telegram Chat
      let publicUrl = '';
      try {
        const res = await fetch(`${API}/player/send-flyer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-init-data': WebApp.initData,
          },
          body: JSON.stringify({
            image_base64: dataUrl,
            room_name: room.room_name,
            room_id: room.id,
          }),
        });
        if (res.ok) {
          const resData = await res.json();
          publicUrl = resData.publicUrl || '';
          setFlyerPublicUrl(publicUrl);
          setFlyerSentToTg(!!resData.botSent);
        }
      } catch (err) {
        console.error('Failed to send flyer to backend:', err);
      }

      // 2. Telegram Native downloadFile (Telegram client 8.0+)
      if (publicUrl && typeof WebApp !== 'undefined' && typeof (WebApp as any).downloadFile === 'function') {
        try {
          (WebApp as any).downloadFile({
            url: publicUrl,
            file_name: fileName,
          }, (accepted: boolean) => {
            console.log('Telegram downloadFile choice:', accepted);
          });
        } catch (tgErr) {
          console.log('Telegram downloadFile error:', tgErr);
        }
      }

      // 3. Web Share API (Android native share sheet -> allows user to tap "Save to device" / "Gallery" / "Photos")
      if (typeof navigator !== 'undefined' && 'canShare' in navigator) {
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `${room.room_name} - Table Flyer`,
              text: `Official Table Tent Flyer for HDASE BINGO Room "${room.room_name}"`,
            });
          }
        } catch (shareErr) {
          console.log('Native share closed/cancelled:', shareErr);
        }
      }

      // 4. Browser fallback anchor download
      try {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } catch (aErr) {
        console.log('Anchor click fallback error:', aErr);
      }

      setDownloaded(true);
      triggerSuccessHaptic();
      setFlyerModalOpen(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (e) {
      console.error('Error during flyer saving:', e);
    } finally {
      setIsSavingFlyer(false);
    }
  };

  const handleDownloadQR = handleSaveToGallery;

  const handleReShareFlyer = async () => {
    if (!room) return;
    const canvas = generateFlyerCanvas();
    if (!canvas) return;
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `hdasebingo-table-flyer-${room.id}.png`, { type: 'image/png' });
    if (typeof navigator !== 'undefined' && 'canShare' in navigator && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${room.room_name} - Table Flyer`,
          text: `Official Table Tent Flyer for HDASE BINGO Room "${room.room_name}"`,
        });
      } catch (e) {
        console.log('Share dismissed', e);
      }
    } else {
      handleCopyRoomLink();
    }
  };

  const handleOpenBotChat = () => {
    triggerHaptic('medium');
    const url = `https://t.me/${botUsername}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
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
        } else if (reportPeriod === '3months') {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(now.getMonth() - 3);
          if (gDate < threeMonthsAgo) return false;
        } else if (reportPeriod === 'yearly') {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(now.getFullYear() - 1);
          if (gDate < oneYearAgo) return false;
        } else if (reportPeriod === 'custom') {
          // Parse range like "13-29", "13 - 29", "13/10-29/10", or single "13"
          const raw = customRangeText.trim() || (customDateFrom && customDateTo ? `${customDateFrom}-${customDateTo}` : customDateFrom || '');
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

      return true;
    });
  }, [recentGames, reportSearchQuery, reportStake, reportPeriod, customRangeText, customDateFrom, customDateTo]);

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

  // ─── ATTRACTIVE ADVANCED BRAND LOADING SCREEN (Matches Image 2) ───
  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between py-12 px-6 bg-gradient-to-b from-white via-slate-50 to-amber-50/30 text-slate-800 select-none overflow-hidden">
        {/* Ambient soft background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

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
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 rounded-full animate-pulse shadow-sm"
                style={{
                  width: '100%',
                  animation: 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                }}
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium tracking-wide">
              በመጫን ላይ... Loading your room
            </p>
          </div>
        </div>

        {/* Footer security / platform note */}
        <div className="text-center relative z-10 text-[10px] text-slate-400 font-semibold tracking-wider">
          🇪🇹 Official Ethiopian Bingo Platform
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 select-none pb-24 font-sans">

      {/* ─── FLOATING PROFILE BUTTON (bottom-center FAB) ─── */}
      <button
        onClick={() => { triggerHaptic('medium'); setShowProfileModal(true); }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 focus:outline-none group"
        title="Open Profile"
        style={{ filter: 'drop-shadow(0 8px 24px rgba(249,115,22,0.45))' }}
      >
        {/* Outer spinning gradient ring */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-orange-400 via-amber-400 to-yellow-300 animate-[spin_3s_linear_infinite] opacity-90 pointer-events-none" />
        {/* White separator */}
        <span className="absolute inset-[3px] rounded-full bg-white pointer-events-none" />
        {/* Inner gradient circle */}
        <span className="relative flex w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 items-center justify-center shadow-lg group-active:scale-90 transition-transform z-10">
          <Fingerprint size={26} className="text-white drop-shadow-sm" strokeWidth={1.7} />
        </span>
        {/* Pulse dot */}
        <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white animate-pulse z-20" />
      </button>

      {/* ─── STICKY TOP APP BAR (Mobile-First) ─── */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Agent Avatar — Fingerprint Profile Button */}
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
            {/* ── Beautiful Fingerprint Circle Button ── */}
            <button
              onClick={() => { triggerHaptic('medium'); setShowProfileModal(true); }}
              className="relative w-11 h-11 rounded-full shrink-0 group focus:outline-none"
              title="View Profile"
            >
              {/* Outer animated ring */}
              <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-orange-400 via-amber-400 to-yellow-300 animate-[spin_4s_linear_infinite] opacity-80" />
              {/* Middle separator ring */}
              <span className="absolute inset-[2px] rounded-full bg-white" />
              {/* Inner gradient circle */}
              <span className="absolute inset-[3px] rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 flex items-center justify-center shadow-inner group-active:scale-90 transition-transform">
                <Fingerprint size={18} className="text-white drop-shadow-sm" strokeWidth={1.8} />
              </span>
              {/* Live pulse dot */}
              <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse shadow-sm" />
            </button>
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
                {formatAmount(user?.main_balance ?? 0)} <span className="text-[10px] font-extrabold">ETB</span>
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

        {/* ─── HDASE BINGO HERO BANNER (Exact User Home Section Style) ─── */}
        {room && (
          <div
            onClick={() => {
              triggerHaptic('medium');
              setActiveTab('live');
              setSelectedLiveStake(null);
            }}
            className="block relative rounded-2xl overflow-hidden shadow-md h-52 flex flex-col items-center justify-center border border-amber-100 cursor-pointer active:scale-98 transition-all"
          >
            {/* Light gradient background — exact match from user Home page */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, #fffbf0 0%, #fef3c7 40%, #fff8e8 70%, #fffbf0 100%)',
              }}
            />
            {/* Subtle radial glow in center */}
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at 50% 60%, rgba(251,191,36,0.18) 0%, transparent 70%)',
              }}
            />
            {/* Top border accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

            {/* Scrolling marquee strip — live room names */}
            <div className="absolute top-1 left-0 right-0 overflow-hidden py-1.5 bg-amber-50/80 border-b border-amber-200/60" style={{ top: '4px' }}>
              <div className="flex whitespace-nowrap animate-marquee">
                {Array.from({ length: 8 }).map((_, i) => (
                  <span key={i} className="text-amber-700 font-black text-[10px] uppercase tracking-[0.2em] px-4 shrink-0 flex items-center gap-1">
                    🚪 {room.room_name} &nbsp;·&nbsp;
                  </span>
                ))}
              </div>
            </div>

            {/* Main content */}
            <div className="relative z-10 flex flex-col items-center text-center px-4 pt-4">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                LIVE BINGO
              </span>
              {/* Split color title: HDASE dark, BINGO orange */}
              <div className="mb-5 flex items-baseline gap-2">
                <span className="text-slate-900 font-black text-4xl tracking-wide leading-none drop-shadow-sm">HDASE</span>
                <span className="text-orange-500 font-black text-4xl tracking-wide leading-none drop-shadow-sm">BINGO</span>
              </div>
              <div className="bg-orange-500 hover:bg-orange-600 text-white px-10 py-2.5 rounded-full font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.4)] active:scale-95 transition-all">
                SEE GAMES →
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
        )}


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
              <span>Live ({callingGamesCount})</span>
              {callingGamesCount > 0 && (
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
                      +{formatAmount(selectedDay.commission)} ETB
                    </p>
                  </div>
                </div>
              )}

              {/* Summary Strip */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-center">
                <div className="bg-slate-50/70 p-2 rounded-xl">
                  <span className="text-[9px] text-slate-400 font-bold uppercase">Today's Earned:</span>{' '}
                  <span className="text-xs font-black text-emerald-600">+{formatAmount(stats?.today_commission ?? 0)} ETB</span>
                </div>
                <div className="bg-slate-50/70 p-2 rounded-xl">
                  <span className="text-[9px] text-slate-400 font-bold uppercase">7-Day Total Pot:</span>{' '}
                  <span className="text-xs font-black text-slate-800">
                    {formatAmount(chartData.reduce((acc, c) => acc + c.volume, 0))} ETB
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: LIVE — STAKE PRESET ROOM MONITOR ─── */}
        {room && activeTab === 'live' && (() => {
          const allStakes = [10, 20, 50, 100];

          // Find the active game for a given stake
          const gameForStake = (stk: number) =>
            activeGames.find((g) => Number(g.stake) === stk) || null;

          // If a stake is selected, show detail view
          if (selectedLiveStake !== null) {
            const detailGame = gameForStake(selectedLiveStake);
            const rawPool = Number(detailGame?.prize_pool || 0);
            const players = Number(detailGame?.total_players || 0);
            const estPot = detailGame
              ? (players >= 3 && rawPool > 0
                  ? Math.round(rawPool / 0.8)
                  : (rawPool || detailGame.stake * players))
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
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Est. Agent Commission</p>
                            <p className="text-sm font-black text-emerald-600">+{formatAmount(estComm)} ETB</p>
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
                {callingGamesCount > 0 ? (
                  <span className="flex items-center space-x-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    <span>{callingGamesCount} Live</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                    0 Live
                  </span>
                )}
              </div>

              {/* Stake Preset Grid — 2×2 */}
              <div className="grid grid-cols-2 gap-2.5">
                {allStakes.map((stk) => {
                  const game = gameForStake(stk);
                  const isCalling = game?.status === 'calling';
                  const isWaiting = game?.status === 'waiting';
                  const playerCount = game?.total_players || 0;
                  const estPot = (playerCount >= 3 && game?.prize_pool)
                    ? game.prize_pool
                    : stk * playerCount;
                  const estComm = (estPot * (room.commission_rate ?? 8)) / 100;
                  const lastW = recentGames.find((g) => Number(g.stake) === stk);

                  return (
                    <button
                      key={stk}
                      onClick={() => {
                        triggerHaptic('medium');
                        setSelectedLiveStake(stk);
                      }}
                      className={`relative overflow-hidden rounded-2xl p-4 border text-left space-y-3 active:scale-[.97] transition-all shadow-sm ${
                        isCalling
                          ? 'bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 border-emerald-400 text-white shadow-emerald-500/20'
                          : isWaiting
                          ? 'bg-gradient-to-br from-orange-400 via-amber-500 to-orange-500 border-orange-300 text-white'
                          : 'bg-white border-slate-200 hover:border-orange-200'
                      }`}
                    >
                      {/* Green pulse ring when calling */}
                      {isCalling && (
                        <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-emerald-400/20 animate-ping pointer-events-none" />
                      )}

                      {/* Stake label + status */}
                      <div className="flex items-start justify-between relative z-10">
                        <div>
                          <p className={`text-2xl font-black leading-none ${isCalling || isWaiting ? 'text-white' : 'text-slate-800'}`}>
                            {formatAmount(stk)}
                          </p>
                          <p className={`text-[9px] font-black ${isCalling ? 'text-emerald-100' : isWaiting ? 'text-amber-100' : 'text-slate-400'}`}>
                            ETB STAKE
                          </p>
                        </div>
                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-black border ${
                          isCalling
                            ? 'bg-white/25 text-white border-white/30'
                            : isWaiting
                            ? 'bg-black/20 text-white border-white/20'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {isCalling ? '🔴 LIVE' : isWaiting ? '⏳ WAIT' : '😴 IDLE'}
                        </div>
                      </div>

                      {/* Stats row */}
                      {isCalling || isWaiting ? (
                        <div className="space-y-1 relative z-10">
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-bold ${isCalling ? 'text-emerald-100' : 'text-amber-100'}`}>Players</span>
                            <span className="text-xs font-black text-white">{playerCount}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-bold ${isCalling ? 'text-emerald-100' : 'text-amber-100'}`}>Est. Comm</span>
                            <span className="text-xs font-black text-white">+{formatAmount(estComm)} ETB</span>
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
                              {lastW ? `+${formatAmount(lastW.agent_commission)} ETB` : '—'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Arrow indicator */}
                      <div className={`flex items-center justify-end text-[9px] font-black ${isCalling || isWaiting ? 'text-white/80' : 'text-slate-400'} relative z-10`}>
                        <span>View Details</span>
                        <ChevronRight size={11} className="ml-0.5" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Quick Stats Strip — Only Calling games count as Live */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs text-center">
                  <p className="text-sm font-black text-orange-500">{callingGamesCount}</p>
                  <p className="text-[9px] text-slate-400 font-bold">Calling Games</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs text-center">
                  <p className="text-sm font-black text-slate-800">
                    {liveCallingPlayers}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold">Live Players</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs text-center">
                  <p className="text-sm font-black text-emerald-600">
                    +{formatAmount(liveCallingComm)} ETB
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

            {/* ─── COMBINED FILTER BAR: Period toggle + Stake pills on ONE row ─── */}
            <div className="space-y-2">
              {/* Single row: [All Time ▾] | [All] [10] [20] [50] [100] */}
              <div className="flex items-center space-x-1.5 overflow-x-visible pb-0.5">
                {/* Period dropdown toggle wrapper */}
                <div className="relative shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      setShowPeriodDropdown((v) => !v);
                    }}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all ${
                      reportPeriod !== 'all'
                        ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                        : showPeriodDropdown
                        ? 'bg-slate-100 text-slate-800 border-slate-300'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    <span>
                      {reportPeriod === 'all' ? 'All Time' :
                       reportPeriod === 'today' ? 'Today' :
                       reportPeriod === 'yesterday' ? 'Yesterday' :
                       reportPeriod === 'weekly' ? 'This Week' :
                       reportPeriod === 'monthly' ? 'This Month' :
                       reportPeriod === '3months' ? '3 Months' :
                       reportPeriod === 'yearly' ? '1 Year' :
                       customRangeText ? `Days ${customRangeText}` : 'Custom'}
                    </span>
                    <ChevronRight size={10} className={`transition-transform ${showPeriodDropdown ? 'rotate-90' : ''}`} />
                  </button>

                  {/* Compact overlay dropdown — NOT full width! Positioned right below button */}
                  {showPeriodDropdown && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-full mt-1.5 z-40 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2.5 space-y-1.5 min-w-[210px] w-max max-w-[270px] animate-in fade-in duration-150"
                    >
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-1">Select Period</p>
                      
                      {/* Vertical options list */}
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
                                : 'bg-slate-50 text-slate-700 border-transparent hover:bg-slate-100 hover:border-slate-200'
                            }`}
                          >
                            <span>{p.label}</span>
                            {reportPeriod === p.key && <Check size={12} className="text-orange-400" />}
                          </button>
                        ))}
                      </div>

                      {/* Custom day range input */}
                      {reportPeriod === 'custom' && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5 px-0.5">
                          <p className="text-[9px] font-bold text-slate-500">
                            Day range (e.g. <span className="font-mono text-orange-600 font-bold">13-29</span>)
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
                              className="w-28 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-orange-500"
                            />
                            <button
                              onClick={() => {
                                triggerHaptic('light');
                                setShowPeriodDropdown(false);
                              }}
                              className="px-2.5 py-1 bg-orange-500 text-white rounded-lg text-[10px] font-bold shadow-2xs"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="w-px h-5 bg-slate-200 shrink-0" />

                {/* Default Stake pill: "All" */}
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setReportStake('all');
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all ${
                    reportStake === 'all'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                  }`}
                >
                  All
                </button>

                {/* Stake pills inline: [10] [20] [50] [100] */}
                {[10, 20, 50, 100].map((stk) => (
                  <button
                    key={stk}
                    onClick={() => {
                      triggerHaptic('light');
                      setReportStake(stk);
                    }}
                    className={`shrink-0 px-2.5 py-1.5 rounded-full text-[10px] font-black border transition-all ${
                      reportStake === stk
                        ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                    }`}
                  >
                    {formatAmount(stk)}
                  </button>
                ))}
              </div>
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
                Total Comm: +{formatAmount(filteredCommissionSum)} ETB
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
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                    >
                      {/* Top bar: Game ID + Room + Time */}
                      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-[10px] font-black text-slate-700">
                            #{formatGameId(game.id)}
                          </span>
                          {room?.room_name && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                              🏢 {room.room_name}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-slate-400 shrink-0 ml-2">
                          {formattedTime}
                        </span>
                      </div>

                      {/* Middle: Winner row */}
                      <div className="px-3.5 pb-2 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-sm shrink-0">🏆</div>
                          <div>
                            <p className="text-[9px] text-slate-400 font-bold uppercase leading-none">Winner</p>
                            <div className="flex items-center space-x-1.5 mt-0.5 flex-wrap">
                              <span className="text-xs font-black text-slate-900 leading-tight">
                                {game.winner_first_name}
                              </span>
                              {game.winner_cartela && (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black tracking-tight shadow-2xs">
                                  <Ticket size={10} className="text-amber-600" />
                                  <span>{game.winner_cartela}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400">👥 {game.total_players} players</span>
                      </div>

                      {/* Bottom: 3-chip horizontal stats row */}
                      <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
                        {/* Commission */}
                        <div className="flex flex-col items-center py-2.5 px-1 bg-emerald-50">
                          <p className="text-[8px] font-black text-emerald-600 uppercase tracking-wide">Commission</p>
                          <p className="text-sm font-black text-emerald-700 leading-tight">
                            +{formatAmount(game.agent_commission)}
                          </p>
                          <p className="text-[8px] text-emerald-500 font-bold">
                            {game.commission_rate ?? room.commission_rate ?? 8}% ETB
                          </p>
                        </div>
                        {/* Pot */}
                        <div className="flex flex-col items-center py-2.5 px-1">
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-wide">Pot</p>
                          <p className="text-sm font-black text-slate-800 leading-tight">
                            {formatAmount(game.prize_pool)}
                          </p>
                          <p className="text-[8px] text-slate-400 font-bold">ETB</p>
                        </div>
                        {/* Stake */}
                        <div className="flex flex-col items-center py-2.5 px-1 bg-slate-50">
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-wide">Stake</p>
                          <p className="text-sm font-black text-amber-600 leading-tight">
                            {formatAmount(game.stake)}
                          </p>
                          <p className="text-[8px] text-slate-400 font-bold">ETB ✅</p>
                        </div>
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

        {/* ─── TAB 4: ROOM LINK & PRINTABLE FLYER (Restaurant Flyer Style) ─── */}
        {room && activeTab === 'qr' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Printable Table Flyer Preview Card */}
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

                {/* 2. Main Title "HDASE BINGO" (like GRAND HERITAGE RETREAT) */}
                <div>
                  <h3 className="font-serif font-black text-2xl tracking-[0.15em] text-[#140f09] uppercase drop-shadow-2xs">
                    HDASE BINGO
                  </h3>
                  <div className="flex items-center justify-center space-x-2 text-[10px] font-bold text-[#8a6a1d] uppercase tracking-wider mt-0.5">
                    <span className="w-6 h-px bg-[#d4af37]" />
                    <span>Official Agent Room • {room.room_name}</span>
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
                      value={roomInviteLink}
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

                {/* 7. Cursive motto (like Good Food • Good Mood • Good Time) */}
                <p className="font-serif italic font-bold text-xs text-[#221609] pt-0.5">
                  Real Players &nbsp;•&nbsp; Good Luck &nbsp;•&nbsp; Big Wins
                </p>

                {/* 8. Official Bot Link Box */}
                <div className="mx-auto w-fit px-5 py-1.5 bg-[#fbf6ea] border border-[#c59b27] rounded-xl shadow-2xs">
                  <span className="font-bold text-xs text-[#664a10] tracking-wide">@{botUsername}</span>
                </div>
              </div>
            </div>

            {/* DOWNLOAD FLYER BUTTON */}
            <button
              onClick={handleSaveToGallery}
              disabled={isSavingFlyer}
              className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 border ${
                isSavingFlyer
                  ? 'bg-amber-600 text-white border-amber-600 opacity-90 cursor-wait'
                  : downloaded
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white border-orange-400 shadow-orange-500/25'
              }`}
            >
              {isSavingFlyer ? (
                <>
                  <RefreshCw size={18} className="animate-spin text-white" />
                  <span>Saving Poster...</span>
                </>
              ) : downloaded ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>Poster Saved Successfully!</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>Download Printable Flyer (HD PNG)</span>
                </>
              )}
            </button>

            {/* Link display & copy */}
            <div className="w-full p-2.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between shadow-2xs">
              <span className="font-mono text-[11px] text-slate-600 truncate mr-2 select-all">
                {roomInviteLink}
              </span>
              <button
                onClick={handleCopyRoomLink}
                className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition-all active:scale-95 ${
                  copiedLink ? 'bg-emerald-600 text-white' : 'bg-orange-500 text-white'
                }`}
              >
                {copiedLink ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Share to Telegram button */}
            <button
              onClick={handleShareRoom}
              className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-black text-xs shadow-sm transition-all active:scale-98 flex items-center justify-center gap-2"
            >
              <Share2 size={15} className="text-orange-400" />
              <span>Share Link to Telegram Chats / Channels</span>
            </button>
          </div>
        )}
      </div>

      {/* Interactive Table Tent Flyer Modal */}
      {flyerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-amber-300">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles size={18} className="text-yellow-200" />
                <h3 className="font-black text-sm tracking-wide">Poster Ready & Delivered!</h3>
              </div>
              <button
                onClick={() => setFlyerModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/20 active:scale-90 transition-all text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-3.5 overflow-y-auto space-y-3 text-center flex-1">
              {/* Tip Card */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5 text-left flex items-start space-x-2 shadow-2xs">
                <span className="text-base leading-none">📱</span>
                <div className="text-[11px] text-amber-900 leading-tight space-y-1">
                  <p className="font-black text-amber-950">How to Save Directly to Gallery:</p>
                  <p className="text-amber-800">
                    1. <b>Long-press (press & hold)</b> the flyer photo below, then tap <b>"Save image"</b> or <b>"Download image"</b>.
                  </p>
                  {flyerSentToTg && (
                    <p className="text-amber-800">
                      2. We also sent this HD photo to your <b>Telegram Chat with @{botUsername}</b>! In chat, tap the photo → tap ⋮ (top-right) → <b>"Save to Gallery"</b>.
                    </p>
                  )}
                </div>
              </div>

              {/* Flyer Photo Preview */}
              {flyerPreviewUrl && (
                <div className="relative mx-auto max-w-[240px] rounded-2xl overflow-hidden border-2 border-amber-400 shadow-md">
                  <img
                    src={flyerPreviewUrl}
                    alt="HDASE BINGO Table Flyer"
                    className="w-full h-auto object-contain select-auto pointer-events-auto"
                  />
                  <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                    HD 800×1150
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {flyerSentToTg && (
                  <button
                    onClick={handleOpenBotChat}
                    className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    <Send size={14} />
                    <span>Open in Telegram Chat (@{botUsername})</span>
                  </button>
                )}

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={handleReShareFlyer}
                    className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    <Share2 size={14} />
                    <span>Save / Share via Phone System</span>
                  </button>
                )}

                {flyerPublicUrl && (
                  <a
                    href={flyerPublicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 active:scale-98 transition-all border border-slate-200"
                  >
                    <ExternalLink size={14} />
                    <span>Open Full Image in Browser</span>
                  </a>
                )}

                <button
                  onClick={() => setFlyerModalOpen(false)}
                  className="w-full py-2 text-slate-500 hover:text-slate-700 font-bold text-xs rounded-xl"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── AGENT PROFILE MODAL ─── */}
      {showProfileModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          onClick={() => setShowProfileModal(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* ── Drag handle ── */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            {/* ── Hero top section ── */}
            <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 pt-4 pb-6 overflow-hidden">
              {/* Background glow orbs */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-400/15 rounded-full blur-2xl pointer-events-none" />

              {/* Close button */}
              <button
                onClick={() => setShowProfileModal(false)}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all"
              >
                <X size={14} />
              </button>

              {/* Avatar + Name */}
              <div className="flex items-center space-x-4 mb-5">
                {/* Large fingerprint avatar */}
                <div className="relative w-16 h-16 shrink-0">
                  <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-orange-400 via-amber-400 to-yellow-300 animate-[spin_4s_linear_infinite] opacity-70" />
                  <span className="absolute inset-[2px] rounded-full bg-slate-800" />
                  <span className="absolute inset-[3px] rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 flex items-center justify-center shadow-inner">
                    <Fingerprint size={26} className="text-white drop-shadow-sm" strokeWidth={1.6} />
                  </span>
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-800 animate-pulse" />
                </div>

                <div className="min-w-0">
                  <p className="text-white font-black text-lg leading-tight truncate">
                    {user?.first_name || 'Agent'}
                  </p>
                  <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mt-0.5">
                    Official Agent
                  </p>
                  {room && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <Zap size={9} className="fill-emerald-400 text-emerald-400" />
                      {room.commission_rate ?? 8}% Commission
                    </span>
                  )}
                </div>
              </div>

              {/* Balance card */}
              <div className="bg-white/8 border border-white/12 rounded-2xl px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-white/50 mb-1">
                      <Wallet size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Main Balance</span>
                    </div>
                    <p className="text-3xl font-black text-white leading-none">
                      {formatAmount(user?.main_balance ?? 0)}
                      <span className="text-sm font-extrabold text-white/60 ml-1">ETB</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 text-white/50 mb-1 justify-end">
                      <Coins size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Commission Bank</span>
                    </div>
                    <p className="text-xl font-black text-amber-400 leading-none">
                      {formatAmount(stats?.total_commission_all_time ?? 0)}
                      <span className="text-xs font-extrabold text-amber-400/60 ml-1">ETB</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Action Buttons ── */}
            <div className="px-5 pt-5 pb-6 space-y-3 bg-white">

              {/* Row 1: See Games + Attack Bank */}
              <div className="grid grid-cols-2 gap-3">
                {/* See Games */}
                <button
                  onClick={() => {
                    triggerHaptic('medium');
                    setShowProfileModal(false);
                    setActiveTab('live');
                    setSelectedLiveStake(null);
                  }}
                  className="relative flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_4px_20px_rgba(249,115,22,0.35)] active:scale-95 transition-all overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/0 group-active:bg-white/10 transition-colors" />
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Gamepad2 size={20} className="text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-black text-xs uppercase tracking-wide">See Games</p>
                    {callingGamesCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 bg-white/25 rounded-full px-2 py-0.5 text-[9px] font-black text-white mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        {callingGamesCount} LIVE
                      </span>
                    )}
                  </div>
                </button>

                {/* Attack Bank (Commission) */}
                <button
                  onClick={() => {
                    triggerHaptic('medium');
                    setShowProfileModal(false);
                    setActiveTab('overview');
                  }}
                  className="relative flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-400 shadow-[0_4px_20px_rgba(251,191,36,0.3)] active:scale-95 transition-all overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/0 group-active:bg-white/10 transition-colors" />
                  <div className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center">
                    <BadgeDollarSign size={20} className="text-amber-900" />
                  </div>
                  <div className="text-center">
                    <p className="text-amber-900 font-black text-xs uppercase tracking-wide">Attack Bank</p>
                    <p className="text-amber-800/70 text-[9px] font-bold mt-0.5">
                      {formatAmount(stats?.today_commission ?? 0)} ETB today
                    </p>
                  </div>
                </button>
              </div>

              {/* Row 2: Withdraw */}
              <button
                onClick={() => {
                  triggerHaptic('heavy');
                  setShowProfileModal(false);
                  navigate('/withdraw');
                }}
                className="relative w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_4px_20px_rgba(16,185,129,0.3)] active:scale-95 transition-all overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/0 group-active:bg-white/10 transition-colors" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <ArrowDownToLine size={20} className="text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-black text-sm">Withdraw Funds</p>
                    <p className="text-white/70 text-[10px] font-bold">
                      Available: {formatAmount(user?.main_balance ?? 0)} ETB
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-white/70" />
              </button>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
                  <p className="text-slate-400 text-[9px] font-bold uppercase mb-1">Total Games</p>
                  <p className="text-slate-900 font-black text-sm">{stats?.total_games_finished ?? 0}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-center">
                  <p className="text-amber-500 text-[9px] font-bold uppercase mb-1">All-Time Comm</p>
                  <p className="text-amber-700 font-black text-sm">{formatAmount(stats?.total_commission_all_time ?? 0)}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                  <p className="text-emerald-500 text-[9px] font-bold uppercase mb-1">Players</p>
                  <p className="text-emerald-700 font-black text-sm">{stats?.total_referred_players ?? 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
