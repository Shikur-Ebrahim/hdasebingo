import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Download,
  Sparkles,
  RefreshCw,
  Settings,
  CheckCircle2,
  X,
  Plus,
  Minus,
  RotateCcw,
  ExternalLink,
  Eye,
  Check,
  Bot,
  Trash2,
  Trophy,
  Dices,
  UserCheck
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';

declare const WebApp: any;

interface SystemProofItem {
  id: string;
  system_player_id?: string;
  first_name: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  method: string;
  method_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  is_winner?: boolean;
}

interface SystemProofSettings {
  depositThreshold: number;
  depositEnabled: boolean;
  withdrawThreshold: number;
  withdrawEnabled: boolean;
  targetChannel: string;
  lastDepositPostAt: string | null;
  lastWithdrawPostAt: string | null;
  lastDepositImage?: string | null;
  lastWithdrawImage?: string | null;
  depositMin: number;
  depositMax: number;
  withdrawMin: number;
  withdrawMax: number;
  dailyAutoGenerate: boolean;
  dailyDeposits: number;
  dailyWithdrawals: number;
}

export default function AdminSystemProofs() {
  const navigate = useNavigate();
  const { user } = useGameStore();
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';

  // Active view tab: 'deposit' or 'withdrawal'
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdrawal'>('deposit');

  // Backend state
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SystemProofSettings>({
    depositThreshold: 10,
    depositEnabled: true,
    withdrawThreshold: 10,
    withdrawEnabled: true,
    targetChannel: '@hdasebingo_channel',
    lastDepositPostAt: null,
    lastWithdrawPostAt: null,
    depositMin: 50,
    depositMax: 1000,
    withdrawMin: 100,
    withdrawMax: 5000,
    dailyAutoGenerate: true,
    dailyDeposits: 50,
    dailyWithdrawals: 30,
  });

  const [unpostedDeposits, setUnpostedDeposits] = useState<SystemProofItem[]>([]);
  const [unpostedWithdrawals, setUnpostedWithdrawals] = useState<SystemProofItem[]>([]);
  const [allDeposits, setAllDeposits] = useState<SystemProofItem[]>([]);
  const [allWithdrawals, setAllWithdrawals] = useState<SystemProofItem[]>([]);
  const [stats, setStats] = useState<{ winnerSystemBots: number; totalSystemBots: number }>({
    winnerSystemBots: 0,
    totalSystemBots: 0,
  });

  // Generator Controls State
  const [generateCount, setGenerateCount] = useState<number>(10);
  const [depositMinInput, setDepositMinInput] = useState<number>(50);
  const [depositMaxInput, setDepositMaxInput] = useState<number>(1000);
  const [withdrawMinInput, setWithdrawMinInput] = useState<number>(100);
  const [withdrawMaxInput, setWithdrawMaxInput] = useState<number>(5000);
  const [preferWinners, setPreferWinners] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState(false);

  // Batch size per flyer (defaults to 10)
  const [depositBatchSize, setDepositBatchSize] = useState<number>(10);
  const [withdrawBatchSize, setWithdrawBatchSize] = useState<number>(10);
  const [isResettingHistory, setIsResettingHistory] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

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
  const [formTargetChannel, setFormTargetChannel] = useState('');
  const [formDailyAuto, setFormDailyAuto] = useState(true);
  const [formDailyDeposits, setFormDailyDeposits] = useState('50');
  const [formDailyWithdrawals, setFormDailyWithdrawals] = useState('30');

  // Preview data URLs
  const [depositDataUrl, setDepositDataUrl] = useState<string | null>(null);
  const [withdrawalDataUrl, setWithdrawalDataUrl] = useState<string | null>(null);

  // Canvas refs
  const depositCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const withdrawalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    try {
      if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred(style);
      }
    } catch {}
  };

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof WebApp !== 'undefined' && WebApp.initData) {
      headers['x-telegram-init-data'] = WebApp.initData;
    }
    return headers;
  };

  // Fetch system proofs data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/system-proofs/data', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to load system proofs');
      const d = await res.json();

      setSettings(d.settings);
      setUnpostedDeposits(d.unpostedDeposits || []);
      setUnpostedWithdrawals(d.unpostedWithdrawals || []);
      setAllDeposits(d.allDeposits || []);
      setAllWithdrawals(d.allWithdrawals || []);
      if (d.stats) setStats(d.stats);

      // Initialize form fields
      setFormDepositThreshold(String(d.settings.depositThreshold || 10));
      setFormDepositEnabled(d.settings.depositEnabled !== false);
      setFormWithdrawThreshold(String(d.settings.withdrawThreshold || 10));
      setFormWithdrawEnabled(d.settings.withdrawEnabled !== false);
      setFormTargetChannel(d.settings.targetChannel || '@hdasebingo_channel');
      setFormDailyAuto(d.settings.dailyAutoGenerate !== false);
      setFormDailyDeposits(String(d.settings.dailyDeposits || 50));
      setFormDailyWithdrawals(String(d.settings.dailyWithdrawals || 30));

      setDepositMinInput(d.settings.depositMin || 50);
      setDepositMaxInput(d.settings.depositMax || 1000);
      setWithdrawMinInput(d.settings.withdrawMin || 100);
      setWithdrawMaxInput(d.settings.withdrawMax || 5000);
    } catch (err: any) {
      console.error('Error fetching system proofs data:', err);
      setPostErrorMsg(err.message || 'Network error fetching data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate system proofs
  const handleGenerate = async (presetCount?: number) => {
    const countToUse = presetCount || generateCount;
    setIsGenerating(true);
    setPostErrorMsg(null);
    setPostSuccessMsg(null);
    triggerHaptic('medium');

    try {
      const isDep = activeTab === 'deposit';
      const minVal = isDep ? depositMinInput : withdrawMinInput;
      const maxVal = isDep ? depositMaxInput : withdrawMaxInput;

      const res = await fetch('/api/system-proofs/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: activeTab,
          count: countToUse,
          min_amount: minVal,
          max_amount: maxVal,
          prefer_winners: preferWinners,
        }),
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to generate');

      setPostSuccessMsg(`✅ በተሳካ ሁኔታ ${d.generatedCount} የሲስተም ${isDep ? 'ዲፖዚቶች' : 'ክፍያዎች'} ተፈጥረዋል!`);
      triggerHaptic('heavy');
      await fetchData();
    } catch (err: any) {
      setPostErrorMsg(err.message || 'Failed to generate system proofs');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // HIGH-RESOLUTION CANVAS FLYER RENDERER (750 × 1150 RETINA HD)
  // ─────────────────────────────────────────────────────────────────────────────
  const renderCanvas = useCallback(
    (type: 'deposit' | 'withdrawal') => {
      const isDep = type === 'deposit';
      const canvas = isDep ? depositCanvasRef.current : withdrawalCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = 750;
      const height = 1150;
      canvas.width = width;
      canvas.height = height;

      // 1. Luxury Ivory Gold Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#fffdfa');
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
      const drawDiamond = (x: number, y: number, s: number, col = '#b8860b') => {
        ctx.fillStyle = col;
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

      // Crown spikes
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

      // 5. Header in Amharic & English
      if (isDep) {
        ctx.fillStyle = '#15803d'; // Green badge
        ctx.font = '900 19px sans-serif';
        ctx.fillText('✅ የተረጋገጡ ዲፖዚቶች • APPROVED DEPOSITS', width / 2, 168);

        ctx.fillStyle = '#166534';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('ፈጣን የሂሳብ መሙያ • 100% የታመነ እና የተረጋገጠ አሰራር', width / 2, 188);

        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 170, 198);
        ctx.lineTo(width / 2 + 170, 198);
        ctx.stroke();
        drawDiamond(width / 2, 198, 4.5, '#15803d');
      } else {
        ctx.fillStyle = '#b91c1c'; // Rose badge
        ctx.font = '900 19px sans-serif';
        ctx.fillText('🏆 የተረጋገጡ የሽልማት ክፍያዎች • APPROVED CASHOUTS', width / 2, 168);

        ctx.fillStyle = '#991b1b';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('ፈጣን የባንክ እና የቴሌብር ክፍያ • ደንበኞች በቅጽበት ይከፈላቸዋል', width / 2, 188);

        ctx.strokeStyle = '#b91c1c';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 180, 198);
        ctx.lineTo(width / 2 + 180, 198);
        ctx.stroke();
        drawDiamond(width / 2, 198, 4.5, '#b91c1c');
      }

      // 6. Central Table Card
      const tableX = 40;
      const tableY = 216;
      const tableW = width - 80;
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
      ctx.fillText('ተጫዋች (PLAYER)', tableX + 46, tableY + headH / 2);
      ctx.fillText('ዘዴ (METHOD)', tableX + 225, tableY + headH / 2);
      ctx.textAlign = 'right';
      ctx.fillText('መጠን (AMOUNT)', tableX + 480, tableY + headH / 2);
      ctx.fillText('ሁኔታ (STATUS)', tableX + tableW - 20, tableY + headH / 2);
      ctx.textBaseline = 'alphabetic';

      // Rows
      const rowH = 50;
      let batchSum = 0;
      const currentBatch = Math.max(1, isDep ? depositBatchSize : withdrawBatchSize);
      const rawList = isDep ? unpostedDeposits : unpostedWithdrawals;
      const fallbackList = isDep ? allDeposits : allWithdrawals;
      const sourceList = (rawList.length > 0 ? rawList : fallbackList).slice(0, currentBatch);
      const rowCount = Math.min(10, sourceList.length);

      if (sourceList.length === 0) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`✨ ምንም ያልተለጠፈ የሲስተም ${isDep ? 'ዲፖዚት' : 'ክፍያ'} የለም!`, width / 2, tableY + 280);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('ከላይ "⚡ Quick Generate System Proofs" ተጠቅመው አዳዲስ ይፍጠሩ', width / 2, tableY + 310);
      } else {
        for (let i = 0; i < rowCount; i++) {
          const item = sourceList[i];
          const rowY = tableY + headH + i * rowH;

          if (i % 2 === 1) {
            ctx.fillStyle = '#fdfbf7';
            ctx.fillRect(tableX + 1, rowY, tableW - 2, rowH);
          }

          if (i < rowCount - 1) {
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
          ctx.fillStyle = isDep ? '#dcfce7' : '#ffe4e6';
          ctx.beginPath();
          ctx.arc(tableX + 24, midRowY, 12, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = '900 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(i + 1), tableX + 24, midRowY);

          if (item) {
            const amt = Number(item.amount || 0);
            batchSum += amt;
            const playerName = item.first_name || 'Player';
            const method = item.method || 'Telebirr';

            // Player Name in SOLID BLACK
            ctx.textAlign = 'left';
            ctx.fillStyle = '#000000';
            ctx.font = '900 14px sans-serif';
            ctx.fillText(playerName.substring(0, 16), tableX + 46, midRowY);

            // Method Badge
            const isTelebirr = method.toLowerCase().includes('tele');
            const isCbe = method.toLowerCase().includes('cbe');
            const badgeBg = isTelebirr ? '#fff7ed' : isCbe ? '#faf5ff' : '#f0fdf4';
            const badgeBorder = isTelebirr ? '#fb923c' : isCbe ? '#c084fc' : '#86efac';

            ctx.fillStyle = badgeBg;
            ctx.beginPath();
            ctx.roundRect(tableX + 225, midRowY - 12, 100, 25, 6);
            ctx.fill();
            ctx.strokeStyle = badgeBorder;
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.fillStyle = '#000000';
            ctx.font = 'bold 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(method.substring(0, 12), tableX + 275, midRowY);

            // Amount
            ctx.textAlign = 'right';
            ctx.fillStyle = isDep ? '#15803d' : '#b91c1c';
            ctx.font = '900 15px sans-serif';
            ctx.fillText(isDep ? `+${amt.toLocaleString()} ETB` : `-${amt.toLocaleString()} ETB`, tableX + 480, midRowY);

            // Status Badge
            ctx.fillStyle = isDep ? '#15803d' : '#b91c1c';
            ctx.font = '900 12px sans-serif';
            ctx.fillText(isDep ? '✅ ገቢ ተደርጓል' : '✅ ተከፍሏል', tableX + tableW - 20, midRowY);
          }
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
      ctx.fillStyle = '#000000';
      ctx.font = '900 14px sans-serif';
      ctx.fillText(isDep ? '💰 አጠቃላይ የተጨመረ ዲፖዚት (TOTAL):' : '💰 አጠቃላይ የተከፈለ ሽልማት (TOTAL):', tableX + 28, midSumY);

      ctx.textAlign = 'right';
      ctx.fillStyle = isDep ? '#15803d' : '#b91c1c';
      ctx.font = '900 19px sans-serif';
      const displaySum = batchSum > 0 ? batchSum : (isDep ? 2500 : 8500);
      ctx.fillText(`${displaySum.toLocaleString()} ETB`, tableX + tableW - 28, midSumY);

      // 7. Trust Badges row
      const badgeY = 878;
      const badges = [
        { icon: '⚡', label: 'ፈጣን ክፍያ' },
        { icon: '🛡️', label: '100% አስተማማኝ' },
        { icon: '🎱', label: '75 ቢንጎ' },
        { icon: '💎', label: 'ህዳሴ ቢንጎ' },
      ];

      const colW = (width - 100) / 4;
      badges.forEach((b, idx) => {
        const colX = 50 + idx * colW + colW / 2;
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.icon, colX, badgeY);

        ctx.fillStyle = '#000000';
        ctx.font = '900 11px sans-serif';
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

      // 8. Cursive Motto in Amharic
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px "Times New Roman", Georgia, serif';
      ctx.fillText('እውነተኛ ተጫዋቾች  •  ፈጣን ዲፖዚት  •  ትልቅ ሽልማት', width / 2, 946);

      // 9. Official Bot Handle Box in Green
      const botBoxW = 440;
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
      ctx.fillText(`🚀 አሁኑኑ ይመዝገቡ: @${botUsername}`, width / 2, botBoxY + 28);

      // 10. Gold Footer Bar
      const footerH = 42;
      const footerY = height - footerH - 26;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(26, footerY, width - 52, footerH);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(
        'በኢትዮጵያ ቀዳሚው እና ህጋዊ የቢንጎ መድረክ  •  HDASE BINGO OFFICIAL',
        width / 2,
        footerY + 25
      );

      // Export preview data URL
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (isDep) setDepositDataUrl(dataUrl);
        else setWithdrawalDataUrl(dataUrl);
      } catch (err) {
        console.error('Canvas export error:', err);
      }
    },
    [
      unpostedDeposits,
      unpostedWithdrawals,
      allDeposits,
      allWithdrawals,
      depositBatchSize,
      withdrawBatchSize,
      botUsername,
    ]
  );

  // Auto re-render canvas whenever data or tabs change
  useEffect(() => {
    const t = setTimeout(() => {
      renderCanvas('deposit');
      renderCanvas('withdrawal');
    }, 100);
    return () => clearTimeout(t);
  }, [renderCanvas, activeTab, unpostedDeposits.length, unpostedWithdrawals.length, depositBatchSize, withdrawBatchSize]);

  // Handle 1-Click Post to Channel
  const handlePostToChannel = async () => {
    const isDep = activeTab === 'deposit';
    const dataUrl = isDep ? depositDataUrl : withdrawalDataUrl;
    if (!dataUrl) return;

    setIsPosting(true);
    setPostSuccessMsg(null);
    setPostErrorMsg(null);
    triggerHaptic('heavy');

    try {
      const currentBatch = isDep ? depositBatchSize : withdrawBatchSize;
      const sourceList = isDep ? unpostedDeposits : unpostedWithdrawals;
      const itemsToPost = sourceList.slice(0, currentBatch);
      const postedIds = itemsToPost.map(item => item.id);

      const res = await fetch('/api/system-proofs/post', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: activeTab,
          image_base64: dataUrl,
          posted_ids: postedIds,
        }),
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to post to channel');

      setPostSuccessMsg(
        `🎉 የሲስተም ${isDep ? 'ዲፖዚቶች' : 'ክፍያዎች'} ወደ ቻናሉ (${d.channelId}) በተሳካ ሁኔታ ተለጥፈዋል!`
      );
      triggerHaptic('heavy');
      await fetchData();
    } catch (err: any) {
      console.error('Post error:', err);
      setPostErrorMsg(err.message || 'Error publishing to Telegram');
    } finally {
      setIsPosting(false);
    }
  };

  // Download flyer PNG
  const handleDownloadPoster = () => {
    const isDep = activeTab === 'deposit';
    const dataUrl = isDep ? depositDataUrl : withdrawalDataUrl;
    if (!dataUrl) return;

    triggerHaptic('light');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `hdasebingo_system_${activeTab}_proof_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Send to Admin TG Chat
  const handleSendToMyTelegram = async () => {
    const isDep = activeTab === 'deposit';
    const dataUrl = isDep ? depositDataUrl : withdrawalDataUrl;
    if (!dataUrl) return;

    setIsSendingToTg(true);
    setPostSuccessMsg(null);
    setPostErrorMsg(null);
    triggerHaptic('medium');

    try {
      const res = await fetch('/api/system-proofs/send-to-me', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: activeTab,
          image_base64: dataUrl,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to send to Telegram');

      setPostSuccessMsg('📥 ፖስተሩ በቀጥታ ወደ እርስዎ ቴሌግራም ተልኳል! ከቴሌግራም ወደ ስልክዎ Gallery ማስቀመጥ ይችላሉ።');
      triggerHaptic('heavy');
    } catch (err: any) {
      setPostErrorMsg(err.message || 'Failed to send preview');
    } finally {
      setIsSendingToTg(false);
    }
  };

  // Reset posted history
  const handleResetHistory = async () => {
    setIsResettingHistory(true);
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/system-proofs/reset-history', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: activeTab }),
      });
      if (res.ok) {
        setPostSuccessMsg('ሁሉንም የሲስተም መረጃዎች እንደገና ያልተለጠፉ አድርገናል!');
        await fetchData();
      }
    } catch {
      setPostErrorMsg('Failed to reset history');
    } finally {
      setIsResettingHistory(false);
    }
  };

  // Clear all generated items
  const handleClearAll = async () => {
    if (!window.confirm(`እርግጠኛ ነዎት ሁሉንም የሲስተም ${activeTab === 'deposit' ? 'ዲፖዚቶች' : 'ክፍያዎች'} ማጥፋት ይፈልጋሉ?`)) {
      return;
    }
    setIsClearingAll(true);
    triggerHaptic('heavy');
    try {
      const res = await fetch('/api/system-proofs/clear-all', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: activeTab }),
      });
      if (res.ok) {
        setPostSuccessMsg('ሁሉም የሲስተም መረጃዎች ተሰርዘዋል!');
        await fetchData();
      }
    } catch {
      setPostErrorMsg('Failed to clear items');
    } finally {
      setIsClearingAll(false);
    }
  };

  // Delete single item
  const handleDeleteItem = async (id: string) => {
    triggerHaptic('light');
    try {
      const res = await fetch('/api/system-proofs/delete-item', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id, type: activeTab }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {}
  };

  // Toggle mark posted
  const handleToggleMark = async (id: string, isPosted: boolean) => {
    triggerHaptic('light');
    try {
      const res = await fetch('/api/system-proofs/mark-item', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id, type: activeTab, mark_as_posted: !isPosted }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {}
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    triggerHaptic('medium');

    try {
      const res = await fetch('/api/system-proofs/settings', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          depositThreshold: formDepositThreshold,
          depositEnabled: formDepositEnabled,
          withdrawThreshold: formWithdrawThreshold,
          withdrawEnabled: formWithdrawEnabled,
          targetChannel: formTargetChannel,
          depositMin: depositMinInput,
          depositMax: depositMaxInput,
          withdrawMin: withdrawMinInput,
          withdrawMax: withdrawMaxInput,
          dailyAutoGenerate: formDailyAuto,
          dailyDeposits: formDailyDeposits,
          dailyWithdrawals: formDailyWithdrawals,
        }),
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save settings');

      setSettings(d.settings);
      setIsSettingsOpen(false);
      setPostSuccessMsg('የሲስተም ፕሩፍ ቅንብሮች በተሳካ ሁኔታ ተቀምጠዋል!');
      triggerHaptic('heavy');
    } catch (err: any) {
      setPostErrorMsg(err.message || 'Error saving settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const activeUnpostedList = activeTab === 'deposit' ? unpostedDeposits : unpostedWithdrawals;
  const activeAllList = activeTab === 'deposit' ? allDeposits : allWithdrawals;
  const activeThreshold = activeTab === 'deposit' ? settings.depositThreshold : settings.withdrawThreshold;
  const activeEnabled = activeTab === 'deposit' ? settings.depositEnabled : settings.withdrawEnabled;
  const activeDataUrl = activeTab === 'deposit' ? depositDataUrl : withdrawalDataUrl;
  const progressPct = Math.min(100, Math.round((activeUnpostedList.length / activeThreshold) * 100));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24 font-sans select-none">
      {/* Offscreen canvases for rendering */}
      <canvas ref={depositCanvasRef} className="hidden" />
      <canvas ref={withdrawalCanvasRef} className="hidden" />

      {/* Header bar */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              triggerHaptic('light');
              navigate('/admin');
            }}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all"
            title="ወደ አስተዳዳሪ ተመለስ"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-black text-sm text-slate-900 tracking-tight flex items-center gap-1">
                <span>System Proofs</span>
                <Bot size={16} className="text-indigo-600" />
              </h1>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 font-black px-2 py-0.5 rounded-full">
                Bots & Auto
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-400">
              Randomized System Player Deposits & Cashouts
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* Quick link to Real User Proofs */}
          <button
            onClick={() => {
              triggerHaptic('light');
              navigate('/admin/channel-proofs');
            }}
            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
            title="ወደ እውነተኛ ደንበኞች ፕሩፍ ቀይር"
          >
            <UserCheck size={13} className="text-emerald-600" />
            <span className="hidden sm:inline">Real Proofs</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setIsSettingsOpen(!isSettingsOpen);
            }}
            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 active:scale-95 transition-all"
            title="ቅንብሮች"
          >
            <Settings size={16} />
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              fetchData();
            }}
            disabled={loading}
            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 active:scale-95 transition-all disabled:opacity-50"
            title="አድስ"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-600' : ''} />
          </button>
        </div>
      </header>

      {/* Floating Alerts */}
      {postSuccessMsg && (
        <div className="m-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 font-bold animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{postSuccessMsg}</span>
          </div>
          <button onClick={() => setPostSuccessMsg(null)} className="p-1 hover:bg-emerald-100 rounded-lg">
            <X size={14} />
          </button>
        </div>
      )}

      {postErrorMsg && (
        <div className="m-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800 font-bold animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center gap-2">
            <X size={16} className="text-rose-600 shrink-0" />
            <span>{postErrorMsg}</span>
          </div>
          <button onClick={() => setPostErrorMsg(null)} className="p-1 hover:bg-rose-100 rounded-lg">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="m-3.5 p-4 bg-white border border-slate-200 rounded-2xl shadow-lg animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
              <Settings size={15} className="text-indigo-600" />
              <span>System Proofs Configurations</span>
            </h3>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-3.5 text-xs">
            {/* Target Channel */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Target Telegram Channel (መለጠፊያ ቻናል)
              </label>
              <input
                type="text"
                value={formTargetChannel}
                onChange={(e) => setFormTargetChannel(e.target.value)}
                placeholder="@hdasebingo_channel"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium focus:outline-hidden focus:border-indigo-500 bg-slate-50"
              />
            </div>

            {/* Thresholds */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Deposit Threshold (ዒላማ)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formDepositThreshold}
                  onChange={(e) => setFormDepositThreshold(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold bg-slate-50"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Withdraw Threshold (ዒላማ)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formWithdrawThreshold}
                  onChange={(e) => setFormWithdrawThreshold(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold bg-slate-50"
                />
              </div>
            </div>

            {/* Daily Auto-Generation */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">Daily Auto-Generation (በየቀኑ በራስ-ሰር)</p>
                  <p className="text-[10px] text-slate-400">Keep channel proof queue active 24/7</p>
                </div>
                <input
                  type="checkbox"
                  checked={formDailyAuto}
                  onChange={(e) => setFormDailyAuto(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              {formDailyAuto && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Daily Deposits</label>
                    <input
                      type="number"
                      value={formDailyDeposits}
                      onChange={(e) => setFormDailyDeposits(e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-bold bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Daily Withdrawals</label>
                    <input
                      type="number"
                      value={formDailyWithdrawals}
                      onChange={(e) => setFormDailyWithdrawals(e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-bold bg-white text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSavingSettings}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {isSavingSettings ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              <span>Save Configurations</span>
            </button>
          </form>
        </div>
      )}

      {/* Main Tabs (Deposits / Withdrawals) */}
      <div className="p-3.5 pt-3 pb-2 max-w-lg mx-auto w-full">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1">
          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('deposit');
            }}
            className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all active:scale-[0.98] ${
              activeTab === 'deposit'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowDownToLine size={15} />
            <span>System Deposits</span>
            {unpostedDeposits.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'deposit' ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {unpostedDeposits.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('withdrawal');
            }}
            className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all active:scale-[0.98] ${
              activeTab === 'withdrawal'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowUpFromLine size={15} />
            <span>System Withdrawals</span>
            {unpostedWithdrawals.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'withdrawal' ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-800'
              }`}>
                {unpostedWithdrawals.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 1-CLICK QUICK GENERATOR CARD ── */}
      <div className="px-3.5 mb-3 max-w-lg mx-auto w-full">
        <div className="bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/60 p-4 rounded-2xl border-2 border-indigo-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Dices size={16} className="text-indigo-600 animate-bounce" />
              <h3 className="font-black text-xs uppercase tracking-wider text-indigo-950">
                1-Click System Proof Generator
              </h3>
            </div>
            {stats.winnerSystemBots > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                <Trophy size={11} className="text-amber-600" />
                <span>{stats.winnerSystemBots} Winners Pool</span>
              </span>
            )}
          </div>

          {/* Amount Range Settings for Current Tab */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="font-bold text-slate-600 text-[10px] block mb-1">
                {activeTab === 'deposit' ? 'Min Deposit (ዝቅተኛ)' : 'Min Cashout (ዝቅተኛ)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={activeTab === 'deposit' ? depositMinInput : withdrawMinInput}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (activeTab === 'deposit') setDepositMinInput(v);
                    else setWithdrawMinInput(v);
                  }}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-black text-slate-800 text-xs focus:outline-hidden focus:border-indigo-400"
                />
                <span className="absolute right-2.5 top-2 text-[10px] font-black text-slate-400">ETB</span>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-600 text-[10px] block mb-1">
                {activeTab === 'deposit' ? 'Max Deposit (ከፍተኛ)' : 'Max Cashout (ከፍተኛ)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={activeTab === 'deposit' ? depositMaxInput : withdrawMaxInput}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (activeTab === 'deposit') setDepositMaxInput(v);
                    else setWithdrawMaxInput(v);
                  }}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-black text-slate-800 text-xs focus:outline-hidden focus:border-indigo-400"
                />
                <span className="absolute right-2.5 top-2 text-[10px] font-black text-slate-400">ETB</span>
              </div>
            </div>
          </div>

          {/* Quick Preset Buttons for Count */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-600">የሚፈጠረው ብዛት (Quantity):</span>
              <span className="font-black text-indigo-700 bg-indigo-100 px-2 py-0.2 rounded-full">
                {generateCount} {activeTab === 'deposit' ? 'ዲፖዚቶች' : 'ክፍያዎች'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {[10, 20, 30, 50].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setGenerateCount(preset);
                  }}
                  className={`flex-1 py-1.5 text-xs font-black rounded-xl border transition-all active:scale-95 ${
                    generateCount === preset
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  +{preset}
                </button>
              ))}
            </div>
          </div>

          {/* Winning Bots Prioritization Switch */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={preferWinners}
                onChange={(e) => setPreferWinners(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>ያሸነፉ ቦቶችን አስቀድም (Prioritize Winner Bots)</span>
            </label>
          </div>

          {/* Main Generate Button */}
          <button
            onClick={() => handleGenerate()}
            disabled={isGenerating}
            className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all text-white ${
              activeTab === 'deposit'
                ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 shadow-emerald-600/25'
                : 'bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 shadow-rose-600/25'
            } ${isGenerating ? 'opacity-70 cursor-wait' : ''}`}
          >
            {isGenerating ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>Randomizing System Players...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>
                  Generate {generateCount} System {activeTab === 'deposit' ? 'Deposits' : 'Withdrawals'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress & Milestone Card */}
      <div className="px-3.5 mb-3 max-w-lg mx-auto w-full">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {activeTab === 'deposit' ? 'System Deposits Milestone' : 'System Cashouts Milestone'}
            </span>
            <span className="text-xs font-black text-slate-900">
              {activeUnpostedList.length} / {activeThreshold} target
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200 mb-2.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                activeTab === 'deposit'
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600'
                  : 'bg-gradient-to-r from-rose-500 to-red-600'
              } ${activeUnpostedList.length >= activeThreshold ? 'animate-pulse' : ''}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${activeEnabled ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
              <span className="font-semibold text-slate-600">
                {activeEnabled
                  ? `Auto-post active (every ${activeThreshold} ready)`
                  : 'Auto-post disabled in settings'}
              </span>
            </div>

            {activeUnpostedList.length >= activeThreshold && (
              <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                🚀 Threshold Reached!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Live Canvas Flyer Preview (750 × 1150 Retina HD) */}
      <div className="px-3.5 mb-4 max-w-lg mx-auto w-full">
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
              <Eye size={14} className={activeTab === 'deposit' ? 'text-emerald-600' : 'text-rose-600'} />
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
                alt="System Proof Canvas"
                className="w-full max-h-[460px] object-contain rounded-xl drop-shadow-sm select-none"
              />
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <RefreshCw size={24} className="animate-spin text-indigo-600" />
              <span className="text-xs font-bold">Rendering luxury poster...</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="px-3.5 space-y-2 max-w-lg mx-auto w-full">
        {/* Main 1-Click Post to Channel */}
        <button
          onClick={handlePostToChannel}
          disabled={isPosting || !activeDataUrl}
          className={`w-full py-3.5 px-4 rounded-xl font-black text-sm flex items-center justify-center space-x-2 shadow-md active:scale-[0.98] transition-all text-white ${
            activeTab === 'deposit'
              ? 'bg-gradient-to-r from-emerald-600 to-green-600 shadow-emerald-600/25'
              : 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-600/25'
          } ${isPosting ? 'opacity-70 cursor-wait' : ''}`}
        >
          {isPosting ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span>Publishing to Channel...</span>
            </>
          ) : (
            <>
              <Send size={16} />
              <span>Post System {activeTab === 'deposit' ? 'Deposits' : 'Withdrawals'} to Channel</span>
            </>
          )}
        </button>

        {/* Secondary Download and Telegram Delivery Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDownloadPoster}
            disabled={!activeDataUrl}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs active:scale-[0.98] transition-all"
          >
            <Download size={14} />
            <span>Download PNG</span>
          </button>

          <button
            onClick={handleSendToMyTelegram}
            disabled={isSendingToTg || !activeDataUrl}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs active:scale-[0.98] transition-all"
          >
            {isSendingToTg ? (
              <RefreshCw size={14} className="animate-spin text-indigo-600" />
            ) : (
              <Sparkles size={14} className="text-amber-500" />
            )}
            <span>Send to My TG</span>
          </button>
        </div>

        {/* Target Channel Info */}
        <div className="pt-1 text-center">
          <a
            href={`https://t.me/${settings.targetChannel.replace('@', '')}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <span>Target: {settings.targetChannel}</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* ── GENERATED QUEUE & HISTORY LIST ── */}
      <div className="px-3.5 mt-6 mb-8 max-w-lg mx-auto w-full space-y-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${activeTab === 'deposit' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                <h3 className="font-black text-sm text-slate-900">
                  {activeTab === 'deposit' ? 'የተዘጋጁ የሲስተም ዲፖዚቶች' : 'የተዘጋጁ የሲስተም ክፍያዎች'}
                </h3>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                  activeTab === 'deposit' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {activeUnpostedList.length} ያልተለጠፉ
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                እነዚህ መረጃዎች ወደ ቻናሉ ለመለጠፍ የተዘጋጁ ናቸው (ከተለጠፉ በኋላ እንደ ተለጠፈ ምልክት ይደረጋል)
              </p>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                onClick={handleResetHistory}
                disabled={isResettingHistory}
                className="text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 active:bg-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all"
                title="ሁሉንም እንደገና ያልተለጠፉ አድርግ"
              >
                <RotateCcw size={12} className={isResettingHistory ? 'animate-spin' : ''} />
                <span>ዳግም ጀምር (Reset)</span>
              </button>

              <button
                onClick={handleClearAll}
                disabled={isClearingAll}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 active:bg-rose-100 px-2.5 py-1.5 rounded-xl flex items-center gap-1 active:scale-95 transition-all"
                title="ሁሉንም አጥፋ"
              >
                <Trash2 size={12} />
                <span>ሁሉንም አጥፋ</span>
              </button>
            </div>
          </div>

          {/* Batch Size Quick Adjuster */}
          <div className="py-2.5 px-3 bg-slate-50 rounded-xl mt-3 border border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">በፖስተር የሚካተት ብዛት:</span>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    if (activeTab === 'deposit') setDepositBatchSize(Math.max(1, depositBatchSize - 1));
                    else setWithdrawBatchSize(Math.max(1, withdrawBatchSize - 1));
                  }}
                  className="w-8 h-8 flex items-center justify-center text-slate-600 active:bg-slate-100 rounded active:scale-90 font-bold transition-all"
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center font-black text-xs text-slate-900">
                  {activeTab === 'deposit' ? depositBatchSize : withdrawBatchSize}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    if (activeTab === 'deposit') setDepositBatchSize(Math.min(50, depositBatchSize + 1));
                    else setWithdrawBatchSize(Math.min(50, withdrawBatchSize + 1));
                  }}
                  className="w-8 h-8 flex items-center justify-center text-slate-600 active:bg-slate-100 rounded active:scale-90 font-bold transition-all"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Quick Preset Pills */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-400 font-bold">ፈጣን:</span>
              {[5, 8, 10, 15, 20].map((preset) => {
                const currentBatch = activeTab === 'deposit' ? depositBatchSize : withdrawBatchSize;
                const isSelected = currentBatch === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      if (activeTab === 'deposit') setDepositBatchSize(preset);
                      else setWithdrawBatchSize(preset);
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all active:scale-95 ${
                      isSelected
                        ? activeTab === 'deposit'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transaction Cards List */}
          <div className="mt-3 space-y-2">
            {activeAllList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                <CheckCircle2 size={32} className="mx-auto text-indigo-500 mb-2" />
                <p className="text-xs font-black text-slate-700">ምንም የተዘጋጀ የሲስተም መረጃ የለም!</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  ከላይ "Generate System {activeTab === 'deposit' ? 'Deposits' : 'Withdrawals'}" የሚለውን በመጫን ይፍጠሩ።
                </p>
              </div>
            ) : (
              activeAllList.map((item, index) => {
                const isUnposted = activeUnpostedList.some(u => u.id === item.id);
                const isInFlyer = isUnposted && index < (activeTab === 'deposit' ? depositBatchSize : withdrawBatchSize);
                const amt = Number(item.amount || 0);
                const playerName = item.first_name || 'Player';
                const method = item.method || 'Telebirr';
                const timeFormatted = item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                const dateFormatted = item.created_at ? new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isInFlyer
                        ? activeTab === 'deposit'
                          ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400/40'
                          : 'bg-rose-50/70 border-rose-300 ring-1 ring-rose-400/40'
                        : !isUnposted
                        ? 'bg-slate-50/60 border-slate-200 opacity-60'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                          isInFlyer
                            ? activeTab === 'deposit' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                            : !isUnposted
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {index + 1}
                        </div>

                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-black text-xs text-slate-900">{playerName}</span>
                            {item.is_winner && (
                              <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                                🏆 Winner
                              </span>
                            )}
                            {isInFlyer && (
                              <span className="text-[9px] font-black bg-emerald-600 text-white px-1.5 py-0.2 rounded shadow-2xs">
                                IN FLYER
                              </span>
                            )}
                            {!isUnposted && (
                              <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded">
                                POSTED
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-semibold mt-0.5">
                            <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">{method}</span>
                            <span>•</span>
                            <span>{dateFormatted} {timeFormatted}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className={`font-black text-sm ${
                          activeTab === 'deposit' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {activeTab === 'deposit' ? `+${amt.toLocaleString()} ETB` : `-${amt.toLocaleString()} ETB`}
                        </span>

                        {/* Toggle Posted / Unposted */}
                        <button
                          type="button"
                          onClick={() => handleToggleMark(item.id, !isUnposted)}
                          className={`p-1.5 rounded-lg border text-xs font-bold transition-all active:scale-90 ${
                            isUnposted
                              ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}
                          title={isUnposted ? 'እንደ ተለጠፈ ምልክት አድርግ' : 'እንደገና ያልተለጠፈ አድርግ'}
                        >
                          <Check size={13} className={isUnposted ? 'opacity-40' : 'text-emerald-600'} />
                        </button>

                        {/* Delete Single Item */}
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                          title="አጥፋ"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
