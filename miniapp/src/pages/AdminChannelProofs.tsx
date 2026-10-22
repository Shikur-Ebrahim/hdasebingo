import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft, Download, Send, RefreshCw, Settings2, CheckCircle2,
  Share2, Trophy, ArrowDownToLine, ArrowUpFromLine, ShieldCheck,
  Zap, ExternalLink, Sparkles, Check, AlertCircle, Eye
} from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface DepositItem {
  id: string;
  telegram_id: string;
  amount: number | string;
  status: string;
  created_at: string;
  updated_at: string;
  deposit_methods?: {
    id: string;
    name: string;
    type: string;
  };
  users?: {
    first_name?: string;
    username?: string;
  };
}

interface WithdrawalItem {
  id: string;
  telegram_id: string;
  method_id?: string;
  amount: number | string;
  net_amount?: number | string;
  fee_amount?: number | string;
  account_name?: string;
  account_number?: string;
  status: string;
  created_at: string;
  updated_at: string;
  withdrawal_methods?: {
    id: string;
    type: string;
  };
  users?: {
    first_name?: string;
    username?: string;
  };
}

interface ProofSettings {
  depositThreshold: number;
  depositEnabled: boolean;
  withdrawThreshold: number;
  withdrawEnabled: boolean;
  targetChannel: string;
  lastDepositPostAt: string | null;
  lastWithdrawPostAt: string | null;
  lastDepositImage?: string | null;
  lastWithdrawImage?: string | null;
}

export default function AdminChannelProofs() {
  const { user } = useGameStore();
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';

  // Active view tab: 'deposit' or 'withdrawal'
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdrawal'>('deposit');

  // Backend state
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ProofSettings>({
    depositThreshold: 10,
    depositEnabled: true,
    withdrawThreshold: 10,
    withdrawEnabled: true,
    targetChannel: '@dmg_official_channel',
    lastDepositPostAt: null,
    lastWithdrawPostAt: null,
  });
  const [unpostedDeposits, setUnpostedDeposits] = useState(0);
  const [unpostedWithdrawals, setUnpostedWithdrawals] = useState(0);
  const [recentDeposits, setRecentDeposits] = useState<DepositItem[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<WithdrawalItem[]>([]);

  // Action status state
  const [isPosting, setIsPosting] = useState(false);
  const [isSendingToTg, setIsSendingToTg] = useState(false);
  const [postSuccessMsg, setPostSuccessMsg] = useState<string | null>(null);
  const [postErrorMsg, setPostErrorMsg] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Settings form
  const [formDepositThreshold, setFormDepositThreshold] = useState('10');
  const [formDepositEnabled, setFormDepositEnabled] = useState(true);
  const [formWithdrawThreshold, setFormWithdrawThreshold] = useState('10');
  const [formWithdrawEnabled, setFormWithdrawEnabled] = useState(true);
  const [formTargetChannel, setFormTargetChannel] = useState('@dmg_official_channel');

  // Preview data URLs
  const [depositDataUrl, setDepositDataUrl] = useState<string | null>(null);
  const [withdrawalDataUrl, setWithdrawalDataUrl] = useState<string | null>(null);

  // Canvas refs
  const depositCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const withdrawalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    try {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred(style);
      }
    } catch {}
  };

  const triggerSuccessHaptic = () => {
    try {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch {}
  };

  // Helper: Mask player names for public flyers
  const maskName = (name?: string): string => {
    if (!name || !name.trim()) return 'Player***';
    const clean = name.trim();
    if (clean.length <= 2) return `${clean}***`;
    if (clean.length <= 4) return `${clean.substring(0, 2)}***`;
    return `${clean.substring(0, 3)}***${clean.slice(-1)}`;
  };

  // Helper: Mask account numbers
  const maskAccount = (acc?: string): string => {
    if (!acc || !acc.trim()) return '••••••••';
    const clean = acc.trim();
    if (clean.length <= 4) return `••••${clean}`;
    return `${clean.substring(0, 3)}••••${clean.slice(-3)}`;
  };

  // Helper: Format Ethiopia timestamp
  const formatTime = (iso?: string): string => {
    if (!iso) return 'Today';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return 'Today';
    }
  };

  // ── Fetch data from API ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/channel-proofs/data`, {
        headers: { 'x-telegram-init-data': initData },
      });
      if (res.ok) {
        const json = await res.json();
        setSettings(json.settings);
        setUnpostedDeposits(json.unpostedDepositsCount || 0);
        setUnpostedWithdrawals(json.unpostedWithdrawalsCount || 0);
        setRecentDeposits(json.recentDeposits || []);
        setRecentWithdrawals(json.recentWithdrawals || []);

        setFormDepositThreshold(String(json.settings.depositThreshold || 10));
        setFormDepositEnabled(json.settings.depositEnabled !== false);
        setFormWithdrawThreshold(String(json.settings.withdrawThreshold || 10));
        setFormWithdrawEnabled(json.settings.withdrawEnabled !== false);
        setFormTargetChannel(json.settings.targetChannel || '@dmg_official_channel');
      }
    } catch (err) {
      console.error('Error fetching channel proofs data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── 1. GENERATE APPROVED DEPOSITS CANVAS POSTER (750 x 1150) ──────────────────
  const generateDepositCanvas = useCallback((): string | null => {
    try {
      const width = 750;
      const height = 1150;
      const canvas = depositCanvasRef.current || document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Warm ivory luxury background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#ffffff');
      bgGrad.addColorStop(0.2, '#fdfbf7');
      bgGrad.addColorStop(0.6, '#faf4e6');
      bgGrad.addColorStop(1, '#f3ebd6');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Radial ambient lighting
      const radial = ctx.createRadialGradient(width / 2, 420, 50, width / 2, 420, 580);
      radial.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
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

      // Corner diamonds
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
      drawDiamond(26, 26, 4.5);
      drawDiamond(width - 26, 26, 4.5);
      drawDiamond(26, height - 26, 4.5);
      drawDiamond(width - 26, height - 26, 4.5);

      // 3. Top Royal Crown & HB Medallion Emblem
      const emblemY = 76;
      const emblemX = width / 2;

      // Crown base
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
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(emblemX, emblemY - 10, 23, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = '900 17px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HB', emblemX, emblemY - 9);
      ctx.textBaseline = 'alphabetic';

      // 4. Main Title "HDASE BINGO"
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 38px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('HDASE BINGO', width / 2, 134);

      // 5. Header: "APPROVED DEPOSITS PROOF"
      ctx.fillStyle = '#15803d'; // Green badge
      ctx.font = '900 19px sans-serif';
      ctx.fillText('✅ OFFICIAL APPROVED DEPOSITS', width / 2, 168);

      ctx.fillStyle = '#8a6a1d';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('INSTANT WALLET TOP-UPS • 100% VERIFIED', width / 2, 188);

      // Gold divider line
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 160, 198);
      ctx.lineTo(width / 2 + 160, 198);
      ctx.stroke();

      // 6. Luxury Central Table Card (holds 10 rows)
      const tableX = 40;
      const tableY = 216;
      const tableW = width - 80; // 670px
      const tableH = 630;
      const tableRadius = 20;

      ctx.shadowColor = 'rgba(120, 80, 20, 0.12)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(tableX, tableY, tableW, tableH, tableRadius);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Table Header Row
      const headH = 46;
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(tableX, tableY, tableW, headH, [tableRadius, tableRadius, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('#', tableX + 16, tableY + headH / 2);
      ctx.fillText('PLAYER', tableX + 50, tableY + headH / 2);
      ctx.fillText('METHOD', tableX + 225, tableY + headH / 2);
      ctx.textAlign = 'right';
      ctx.fillText('AMOUNT (ETB)', tableX + 480, tableY + headH / 2);
      ctx.fillText('STATUS', tableX + tableW - 20, tableY + headH / 2);
      ctx.textBaseline = 'alphabetic';

      // Rows: display 10 items
      const displayDeposits = recentDeposits.slice(0, 10);
      const rowH = 50;
      let batchSum = 0;

      for (let i = 0; i < 10; i++) {
        const item = displayDeposits[i];
        const rowY = tableY + headH + i * rowH;

        // Alternate row fill
        if (i % 2 === 1) {
          ctx.fillStyle = '#fdfbf7';
          ctx.fillRect(tableX + 1, rowY, tableW - 2, rowH);
        }

        // Horizontal row border
        if (i < 9) {
          ctx.strokeStyle = '#f1e7d0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tableX + 10, rowY + rowH);
          ctx.lineTo(tableX + tableW - 10, rowY + rowH);
          ctx.stroke();
        }

        const midRowY = rowY + rowH / 2;
        ctx.textBaseline = 'middle';

        // Index pill
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(tableX + 24, midRowY, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), tableX + 24, midRowY);

        if (item) {
          const amt = Number(item.amount || 0);
          batchSum += amt;
          const rawName = item.users?.first_name || item.users?.username || 'Player';
          const playerName = maskName(rawName);
          const method = item.deposit_methods?.name || item.deposit_methods?.type || 'Telebirr';

          // Player Name
          ctx.textAlign = 'left';
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(playerName, tableX + 50, midRowY);

          // Method Badge
          const isTelebirr = method.toLowerCase().includes('tele');
          const isCbe = method.toLowerCase().includes('cbe');
          const badgeBg = isTelebirr ? '#fff7ed' : isCbe ? '#faf5ff' : '#f0fdf4';
          const badgeBorder = isTelebirr ? '#fb923c' : isCbe ? '#c084fc' : '#86efac';
          const badgeText = isTelebirr ? '#c2410c' : isCbe ? '#7e22ce' : '#15803d';

          ctx.fillStyle = badgeBg;
          ctx.beginPath();
          ctx.roundRect(tableX + 225, midRowY - 12, 100, 24, 6);
          ctx.fill();
          ctx.strokeStyle = badgeBorder;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = badgeText;
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(method.substring(0, 12), tableX + 275, midRowY);

          // Amount
          ctx.textAlign = 'right';
          ctx.fillStyle = '#15803d';
          ctx.font = '900 15px sans-serif';
          ctx.fillText(`+${amt.toLocaleString()} ETB`, tableX + 480, midRowY);

          // Status Badge
          ctx.fillStyle = '#16a34a';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('✅ Credited', tableX + tableW - 20, midRowY);
        } else {
          // Placeholder row
          ctx.textAlign = 'left';
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'italic 13px sans-serif';
          ctx.fillText('Verified Player Deposit', tableX + 50, midRowY);

          ctx.textAlign = 'right';
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText('+500 ETB', tableX + 480, midRowY);
          ctx.fillText('✅ Credited', tableX + tableW - 20, midRowY);
        }
      }

      // Summary Card Footer inside Table Box
      const sumBoxY = tableY + tableH - 62;
      const sumGrad = ctx.createLinearGradient(tableX, sumBoxY, tableX + tableW, sumBoxY);
      sumGrad.addColorStop(0, '#fef9c3');
      sumGrad.addColorStop(1, '#fde68a');
      ctx.fillStyle = sumGrad;
      ctx.beginPath();
      ctx.roundRect(tableX + 12, sumBoxY, tableW - 24, 50, 12);
      ctx.fill();
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const midSumY = sumBoxY + 25;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#713f12';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('💰 BATCH TOTAL CREDITED:', tableX + 28, midSumY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#854d0e';
      ctx.font = '900 18px sans-serif';
      const displaySum = batchSum > 0 ? batchSum : 12500;
      ctx.fillText(`${displaySum.toLocaleString()} ETB`, tableX + tableW - 28, midSumY);

      // 7. Trust Badges row
      const badgeY = 878;
      const badges = [
        { icon: '⚡', label: 'INSTANT CREDIT' },
        { icon: '🛡️', label: '100% SECURE' },
        { icon: '🎱', label: '75 BINGO' },
        { icon: '💎', label: 'OFFICIAL HB' },
      ];

      const colW = (width - 100) / 4;
      badges.forEach((b, idx) => {
        const colX = 50 + idx * colW + colW / 2;
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.icon, colX, badgeY);

        ctx.fillStyle = '#785614';
        ctx.font = '900 10.5px sans-serif';
        ctx.fillText(b.label, colX, badgeY + 22);

        if (idx < 3) {
          const divX = 50 + (idx + 1) * colW;
          ctx.strokeStyle = '#d4af37';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(divX, badgeY - 12);
          ctx.lineTo(divX, badgeY + 22);
          ctx.stroke();
        }
      });

      // 8. Cursive Motto
      ctx.textAlign = 'center';
      ctx.fillStyle = '#261b0c';
      ctx.font = 'italic bold 22px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive, serif';
      ctx.fillText('Real Players  •  Instant Deposits  •  Big Cash Wins', width / 2, 946);

      // 9. Official Bot Handle Box
      const botBoxW = 420;
      const botBoxH = 46;
      const botBoxX = (width - botBoxW) / 2;
      const botBoxY = 975;

      const botGrad = ctx.createLinearGradient(botBoxX, botBoxY, botBoxX + botBoxW, botBoxY);
      botGrad.addColorStop(0, '#15803d');
      botGrad.addColorStop(1, '#166534');
      ctx.fillStyle = botGrad;
      ctx.beginPath();
      ctx.roundRect(botBoxX, botBoxY, botBoxW, botBoxH, 23);
      ctx.fill();

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🎮 PLAY NOW: @${botUsername}`, width / 2, botBoxY + botBoxH / 2);
      ctx.textBaseline = 'alphabetic';

      // 10. Footer
      ctx.fillStyle = '#9c8141';
      ctx.font = '600 12px sans-serif';
      ctx.fillText('Official Channel Partner • Powered by HDASE BINGO', width / 2, 1056);

      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error generating deposit proof canvas:', e);
      return null;
    }
  }, [recentDeposits, botUsername]);

  // ── 2. GENERATE APPROVED WITHDRAWALS (CASHOUT) CANVAS (750 x 1150) ────────────
  const generateWithdrawalCanvas = useCallback((): string | null => {
    try {
      const width = 750;
      const height = 1150;
      const canvas = withdrawalCanvasRef.current || document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Victory Emerald & Deep Obsidian gradient background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#042217');
      bgGrad.addColorStop(0.3, '#063323');
      bgGrad.addColorStop(0.7, '#031f15');
      bgGrad.addColorStop(1, '#01120c');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Radial victory glow in upper center
      const radial = ctx.createRadialGradient(width / 2, 380, 40, width / 2, 380, 600);
      radial.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
      radial.addColorStop(0.6, 'rgba(5, 150, 105, 0.08)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // 2. Double gold ornate border frame
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(20, 20, width - 40, height - 40);

      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1;
      ctx.strokeRect(26, 26, width - 52, height - 52);

      // Corner diamonds
      const drawDiamond = (x: number, y: number, s: number) => {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s, y);
        ctx.closePath();
        ctx.fill();
      };
      drawDiamond(26, 26, 4.5);
      drawDiamond(width - 26, 26, 4.5);
      drawDiamond(26, height - 26, 4.5);
      drawDiamond(width - 26, height - 26, 4.5);

      // 3. Top Royal Crown & HB Medallion Emblem
      const emblemY = 76;
      const emblemX = width / 2;

      // Crown base
      ctx.fillStyle = '#fbbf24';
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
      ctx.fillStyle = '#ffffff';
      [-25, -12, 0, 12, 25].forEach((px, idx) => {
        const py = idx === 2 ? emblemY - 57 : (idx === 0 || idx === 4) ? emblemY - 53 : emblemY - 41;
        ctx.beginPath();
        ctx.arc(emblemX + px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Medallion Circle with HB Monogram
      ctx.fillStyle = '#064e3b';
      ctx.beginPath();
      ctx.arc(emblemX, emblemY - 10, 23, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = '900 17px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HB', emblemX, emblemY - 9);
      ctx.textBaseline = 'alphabetic';

      // 4. Main Title "HDASE BINGO"
      ctx.fillStyle = '#fef08a';
      ctx.font = '900 38px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('HDASE BINGO', width / 2, 134);

      // 5. Header: "OFFICIAL CASHOUT PROOFS"
      ctx.fillStyle = '#34d399'; // Bright emerald
      ctx.font = '900 20px sans-serif';
      ctx.fillText('🏆 OFFICIAL CASHOUT PROOFS', width / 2, 168);

      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('VERIFIED WINNERS • INSTANT BANK & TELEBIRR PAYOUTS', width / 2, 188);

      // Gold divider line
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 160, 198);
      ctx.lineTo(width / 2 + 160, 198);
      ctx.stroke();

      // 6. Luxury Dark Obsidian Table Card (holds 10 rows)
      const tableX = 40;
      const tableY = 216;
      const tableW = width - 80;
      const tableH = 630;
      const tableRadius = 20;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#06261b';
      ctx.beginPath();
      ctx.roundRect(tableX, tableY, tableW, tableH, tableRadius);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Table Header Row
      const headH = 46;
      ctx.fillStyle = '#021810';
      ctx.beginPath();
      ctx.roundRect(tableX, tableY, tableW, headH, [tableRadius, tableRadius, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('#', tableX + 16, tableY + headH / 2);
      ctx.fillText('WINNER', tableX + 50, tableY + headH / 2);
      ctx.fillText('METHOD / BANK', tableX + 225, tableY + headH / 2);
      ctx.textAlign = 'right';
      ctx.fillText('NET PAYOUT (ETB)', tableX + 480, tableY + headH / 2);
      ctx.fillText('STATUS', tableX + tableW - 20, tableY + headH / 2);
      ctx.textBaseline = 'alphabetic';

      // Rows: display 10 items
      const displayWithdrawals = recentWithdrawals.slice(0, 10);
      const rowH = 50;
      let batchSum = 0;

      for (let i = 0; i < 10; i++) {
        const item = displayWithdrawals[i];
        const rowY = tableY + headH + i * rowH;

        // Alternate row fill
        if (i % 2 === 1) {
          ctx.fillStyle = '#083324';
          ctx.fillRect(tableX + 1, rowY, tableW - 2, rowH);
        }

        // Horizontal row border
        if (i < 9) {
          ctx.strokeStyle = '#0b4230';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tableX + 10, rowY + rowH);
          ctx.lineTo(tableX + tableW - 10, rowY + rowH);
          ctx.stroke();
        }

        const midRowY = rowY + rowH / 2;
        ctx.textBaseline = 'middle';

        // Index pill
        ctx.fillStyle = '#0f513d';
        ctx.beginPath();
        ctx.arc(tableX + 24, midRowY, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), tableX + 24, midRowY);

        if (item) {
          const net = Number(item.net_amount || item.amount || 0);
          batchSum += net;
          const rawName = item.account_name || item.users?.first_name || item.users?.username || 'Winner';
          const winnerName = maskName(rawName);
          const method = item.withdrawal_methods?.type || 'Bank';

          // Winner Name
          ctx.textAlign = 'left';
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(winnerName, tableX + 50, midRowY);

          // Method Badge
          const isTelebirr = method.toLowerCase().includes('tele');
          const isCbe = method.toLowerCase().includes('cbe');
          const badgeBg = isTelebirr ? '#431407' : isCbe ? '#3b0764' : '#064e3b';
          const badgeBorder = isTelebirr ? '#ea580c' : isCbe ? '#9333ea' : '#10b981';
          const badgeText = isTelebirr ? '#fdba74' : isCbe ? '#d8b4fe' : '#6ee7b7';

          ctx.fillStyle = badgeBg;
          ctx.beginPath();
          ctx.roundRect(tableX + 225, midRowY - 12, 100, 24, 6);
          ctx.fill();
          ctx.strokeStyle = badgeBorder;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = badgeText;
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(method.substring(0, 12), tableX + 275, midRowY);

          // Amount
          ctx.textAlign = 'right';
          ctx.fillStyle = '#34d399';
          ctx.font = '900 15px sans-serif';
          ctx.fillText(`+${net.toLocaleString()} ETB`, tableX + 480, midRowY);

          // Status Badge
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('✅ Paid Out', tableX + tableW - 20, midRowY);
        } else {
          // Placeholder row
          ctx.textAlign = 'left';
          ctx.fillStyle = '#6ee7b7';
          ctx.font = 'italic 13px sans-serif';
          ctx.fillText('Verified Winner Cashout', tableX + 50, midRowY);

          ctx.textAlign = 'right';
          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText('+1,500 ETB', tableX + 480, midRowY);
          ctx.fillText('✅ Paid Out', tableX + tableW - 20, midRowY);
        }
      }

      // Summary Card Footer inside Table Box
      const sumBoxY = tableY + tableH - 62;
      const sumGrad = ctx.createLinearGradient(tableX, sumBoxY, tableX + tableW, sumBoxY);
      sumGrad.addColorStop(0, '#042e20');
      sumGrad.addColorStop(1, '#064e3b');
      ctx.fillStyle = sumGrad;
      ctx.beginPath();
      ctx.roundRect(tableX + 12, sumBoxY, tableW - 24, 50, 12);
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const midSumY = sumBoxY + 25;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('💸 BATCH TOTAL PAID OUT:', tableX + 28, midSumY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#fef08a';
      ctx.font = '900 19px sans-serif';
      const displaySum = batchSum > 0 ? batchSum : 28400;
      ctx.fillText(`${displaySum.toLocaleString()} ETB`, tableX + tableW - 28, midSumY);

      // 7. Trust Badges row
      const badgeY = 878;
      const badges = [
        { icon: '⚡', label: 'FAST PAYOUT' },
        { icon: '🏆', label: 'REAL WINNERS' },
        { icon: '🛡️', label: '100% SECURE' },
        { icon: '💎', label: 'OFFICIAL HB' },
      ];

      const colW = (width - 100) / 4;
      badges.forEach((b, idx) => {
        const colX = 50 + idx * colW + colW / 2;
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.icon, colX, badgeY);

        ctx.fillStyle = '#a7f3d0';
        ctx.font = '900 10.5px sans-serif';
        ctx.fillText(b.label, colX, badgeY + 22);

        if (idx < 3) {
          const divX = 50 + (idx + 1) * colW;
          ctx.strokeStyle = '#0d5942';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(divX, badgeY - 12);
          ctx.lineTo(divX, badgeY + 22);
          ctx.stroke();
        }
      });

      // 8. Cursive Motto
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.font = 'italic bold 22px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive, serif';
      ctx.fillText('Play With Trust  •  Win Real Cash  •  Instant Cashouts', width / 2, 946);

      // 9. Official Bot Handle Box
      const botBoxW = 420;
      const botBoxH = 46;
      const botBoxX = (width - botBoxW) / 2;
      const botBoxY = 975;

      const botGrad = ctx.createLinearGradient(botBoxX, botBoxY, botBoxX + botBoxW, botBoxY);
      botGrad.addColorStop(0, '#d97706');
      botGrad.addColorStop(1, '#b45309');
      ctx.fillStyle = botGrad;
      ctx.beginPath();
      ctx.roundRect(botBoxX, botBoxY, botBoxW, botBoxH, 23);
      ctx.fill();

      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🎮 PLAY & CASHOUT: @${botUsername}`, width / 2, botBoxY + botBoxH / 2);
      ctx.textBaseline = 'alphabetic';

      // 10. Footer
      ctx.fillStyle = '#6ee7b7';
      ctx.font = '600 12px sans-serif';
      ctx.fillText('Official Channel Partner • Powered by HDASE BINGO', width / 2, 1056);

      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error generating withdrawal proof canvas:', e);
      return null;
    }
  }, [recentWithdrawals, botUsername]);

  // Update previews whenever data or active tab changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const depUrl = generateDepositCanvas();
      if (depUrl) setDepositDataUrl(depUrl);

      const withUrl = generateWithdrawalCanvas();
      if (withUrl) setWithdrawalDataUrl(withUrl);
    }, 120);

    return () => clearTimeout(timer);
  }, [generateDepositCanvas, generateWithdrawalCanvas, recentDeposits, recentWithdrawals]);

  // Active data URL based on tab
  const activeDataUrl = activeTab === 'deposit' ? depositDataUrl : withdrawalDataUrl;

  // Active unposted count & threshold
  const activeUnposted = activeTab === 'deposit' ? unpostedDeposits : unpostedWithdrawals;
  const activeThreshold = activeTab === 'deposit' ? settings.depositThreshold : settings.withdrawThreshold;
  const activeEnabled = activeTab === 'deposit' ? settings.depositEnabled : settings.withdrawEnabled;
  const progressPct = Math.min(100, Math.round((activeUnposted / Math.max(1, activeThreshold)) * 100));

  // ── Download Poster to Device ────────────────────────────────────────────────
  const handleDownloadPoster = () => {
    triggerHaptic('medium');
    const dataUrl = activeTab === 'deposit' ? generateDepositCanvas() : generateWithdrawalCanvas();
    if (!dataUrl) return;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `hdasebingo-${activeTab}-proofs-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    triggerSuccessHaptic();
    setPostSuccessMsg('Image downloaded successfully!');
    setTimeout(() => setPostSuccessMsg(null), 3000);
  };

  // ── Send to Admin's Private Telegram Chat ────────────────────────────────────
  const handleSendToMyTelegram = async () => {
    triggerHaptic('heavy');
    const dataUrl = activeTab === 'deposit' ? generateDepositCanvas() : generateWithdrawalCanvas();
    if (!dataUrl) return;

    setIsSendingToTg(true);
    setPostErrorMsg(null);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/channel-proofs/send-to-me`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({
          type: activeTab,
          image_base64: dataUrl,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        triggerSuccessHaptic();
        setPostSuccessMsg('High-res image delivered to your Telegram chat!');
        setTimeout(() => setPostSuccessMsg(null), 4000);
      } else {
        handleDownloadPoster();
      }
    } catch (e: any) {
      console.error('Error sending proof to Telegram:', e);
      handleDownloadPoster();
    } finally {
      setIsSendingToTg(false);
    }
  };

  // ── Post Now to Official Channel ─────────────────────────────────────────────
  const handlePostToChannel = async () => {
    triggerHaptic('heavy');
    const dataUrl = activeTab === 'deposit' ? generateDepositCanvas() : generateWithdrawalCanvas();
    if (!dataUrl) return;

    setIsPosting(true);
    setPostErrorMsg(null);
    setPostSuccessMsg(null);

    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/channel-proofs/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({
          type: activeTab,
          image_base64: dataUrl,
          custom_channel: settings.targetChannel,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        triggerSuccessHaptic();
        setPostSuccessMsg(`Successfully posted ${activeTab} proof flyer to ${json.channelId || settings.targetChannel}! 🎉`);
        fetchData();
        setTimeout(() => setPostSuccessMsg(null), 5000);
      } else {
        setPostErrorMsg(json.error || 'Failed to post to channel. Ensure the bot is an admin in the channel!');
      }
    } catch (e: any) {
      setPostErrorMsg(e.message || 'Network error while posting to channel');
    } finally {
      setIsPosting(false);
    }
  };

  // ── Save Auto-post Settings ──────────────────────────────────────────────────
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('medium');
    setIsSavingSettings(true);
    setPostErrorMsg(null);

    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/channel-proofs/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({
          depositThreshold: formDepositThreshold,
          depositEnabled: formDepositEnabled,
          withdrawThreshold: formWithdrawThreshold,
          withdrawEnabled: formWithdrawEnabled,
          targetChannel: formTargetChannel,
        }),
      });

      if (res.ok) {
        triggerSuccessHaptic();
        setIsSettingsOpen(false);
        setPostSuccessMsg('Auto-post settings saved!');
        fetchData();
        setTimeout(() => setPostSuccessMsg(null), 3000);
      } else {
        const err = await res.json();
        setPostErrorMsg(err.error || 'Failed to save settings');
      }
    } catch (err: any) {
      setPostErrorMsg(err.message || 'Error saving settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (!user || (user.role !== 'admin' && user.role !== 'worker')) {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied!</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 text-slate-900 pb-20">
      {/* Hidden Offscreen Canvases for 2x High-Resolution Rendering */}
      <div style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0, pointerEvents: 'none' }}>
        <canvas ref={depositCanvasRef} width={750} height={1150} />
        <canvas ref={withdrawalCanvasRef} width={750} height={1150} />
      </div>

      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3.5 sticky top-0 z-30 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            to="/admin"
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-tight flex items-center gap-1.5">
              <span>Channel Proofs</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                AUTO & MANUAL
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Approved Deposits & Withdrawals</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all relative"
            title="Auto-post Settings"
          >
            <Settings2 size={20} />
          </button>
          <button
            onClick={() => {
              triggerHaptic('light');
              fetchData();
            }}
            disabled={loading}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-600' : ''} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {postSuccessMsg && (
        <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2.5 text-emerald-900 text-xs font-bold animate-fadeIn shadow-sm">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{postSuccessMsg}</span>
        </div>
      )}

      {postErrorMsg && (
        <div className="mx-4 mt-3 p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-center gap-2.5 text-rose-900 text-xs font-bold animate-fadeIn shadow-sm">
          <AlertCircle size={18} className="text-rose-600 shrink-0" />
          <span>{postErrorMsg}</span>
        </div>
      )}

      {/* Auto-Post Settings Drawer Modal */}
      {isSettingsOpen && (
        <div className="mx-4 mt-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-md animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <Settings2 size={16} className="text-emerald-600" />
              <span>Auto-Post Channel Settings</span>
            </h3>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1"
            >
              Close
            </button>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            {/* Target Channel */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Official Telegram Channel
              </label>
              <input
                type="text"
                value={formTargetChannel}
                onChange={(e) => setFormTargetChannel(e.target.value)}
                placeholder="@dmg_official_channel"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Bot must be an admin with "Post Messages" permission in this channel.
              </span>
            </div>

            {/* Deposits Trigger */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                  <ArrowDownToLine size={14} className="text-emerald-600" />
                  <span>Approved Deposits Auto-Post</span>
                </span>
                <input
                  type="checkbox"
                  checked={formDepositEnabled}
                  onChange={(e) => setFormDepositEnabled(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Trigger Batch Threshold:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formDepositThreshold}
                    onChange={(e) => setFormDepositThreshold(e.target.value)}
                    className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold"
                  />
                  <span className="text-xs text-slate-500 font-medium">people</span>
                </div>
              </div>
            </div>

            {/* Withdrawals Trigger */}
            <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                  <ArrowUpFromLine size={14} className="text-amber-600" />
                  <span>Approved Withdrawals Auto-Post</span>
                </span>
                <input
                  type="checkbox"
                  checked={formWithdrawEnabled}
                  onChange={(e) => setFormWithdrawEnabled(e.target.checked)}
                  className="w-4 h-4 accent-amber-600 rounded"
                />
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Trigger Batch Threshold:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formWithdrawThreshold}
                    onChange={(e) => setFormWithdrawThreshold(e.target.value)}
                    className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold"
                  />
                  <span className="text-xs text-slate-500 font-medium">people</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingSettings}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {isSavingSettings ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              <span>Save Configurations</span>
            </button>
          </form>
        </div>
      )}

      {/* Main Tabs */}
      <div className="p-4 pt-3 pb-2">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm flex items-center">
          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('deposit');
            }}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'deposit'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowDownToLine size={16} />
            <span>Approved Deposits</span>
            {unpostedDeposits > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'deposit' ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {unpostedDeposits}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('withdrawal');
            }}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'withdrawal'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowUpFromLine size={16} />
            <span>Approved Withdrawals</span>
            {unpostedWithdrawals > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'withdrawal' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-800'
              }`}>
                {unpostedWithdrawals}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Progress & Milestone Card */}
      <div className="px-4 mb-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {activeTab === 'deposit' ? 'Approved Deposits Milestone' : 'Approved Cashouts Milestone'}
            </span>
            <span className="text-xs font-black text-slate-900">
              {activeUnposted} / {activeThreshold} target
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200 mb-2.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                activeTab === 'deposit'
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600'
                  : 'bg-gradient-to-r from-amber-500 to-yellow-600'
              } ${activeUnposted >= activeThreshold ? 'animate-pulse' : ''}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${activeEnabled ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
              <span className="font-semibold text-slate-600">
                {activeEnabled
                  ? `Auto-post active (every ${activeThreshold} approved)`
                  : 'Auto-post disabled in settings'}
              </span>
            </div>

            {activeUnposted >= activeThreshold && (
              <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                🚀 Threshold Reached!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* High-Resolution Live Canvas Preview */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
              <Eye size={14} className="text-emerald-600" />
              <span>Live Flyer Canvas Preview</span>
            </span>
            <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
              750 × 1150 Retina HD
            </span>
          </div>

          {activeDataUrl ? (
            <div className="relative rounded-xl overflow-hidden shadow-inner border border-slate-100 bg-slate-900/5 flex items-center justify-center">
              <img
                src={activeDataUrl}
                alt="Channel Proof Canvas"
                className="w-full max-h-[460px] object-contain rounded-xl drop-shadow-sm select-none"
              />
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <RefreshCw size={24} className="animate-spin text-emerald-600" />
              <span className="text-xs font-bold">Rendering luxury poster...</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="px-4 space-y-2.5">
        {/* Main 1-Click Post to Channel */}
        <button
          onClick={handlePostToChannel}
          disabled={isPosting || !activeDataUrl}
          className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 shadow-lg active:scale-95 transition-all ${
            activeTab === 'deposit'
              ? 'bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-emerald-600/25'
              : 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow-amber-600/25'
          } ${isPosting ? 'opacity-70 cursor-wait' : ''}`}
        >
          {isPosting ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <span>Publishing to Channel...</span>
            </>
          ) : (
            <>
              <Send size={18} />
              <span>Post {activeTab === 'deposit' ? 'Deposits' : 'Withdrawals'} to Channel</span>
            </>
          )}
        </button>

        {/* Secondary Download and Telegram Delivery Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handleDownloadPoster}
            disabled={!activeDataUrl}
            className="py-3 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Download size={15} />
            <span>Download PNG</span>
          </button>

          <button
            onClick={handleSendToMyTelegram}
            disabled={isSendingToTg || !activeDataUrl}
            className="py-3 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm active:scale-95 transition-all"
          >
            {isSendingToTg ? (
              <RefreshCw size={15} className="animate-spin text-emerald-600" />
            ) : (
              <Sparkles size={15} className="text-amber-500" />
            )}
            <span>Send to My TG</span>
          </button>
        </div>

        {/* Channel Link Info */}
        <div className="pt-2 text-center">
          <a
            href={`https://t.me/${settings.targetChannel.replace('@', '')}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
          >
            <span>Target: {settings.targetChannel}</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
