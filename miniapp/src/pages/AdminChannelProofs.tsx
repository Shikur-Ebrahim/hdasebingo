import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft, Download, Send, RefreshCw, Settings2, CheckCircle2,
  ArrowDownToLine, ArrowUpFromLine,
  ExternalLink, Sparkles, Check, AlertCircle, Eye,
  Plus, Minus, Clock, RotateCcw, Trash2, Bot, Trophy, Dices, Percent
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
  is_system?: boolean;
}

interface WithdrawalItem {
  id: string;
  telegram_id: string;
  method_id?: string;
  amount: number | string;
  net_amount?: number | string;
  fee_amount?: number | string;
  fee_percent?: number | string;
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
  is_system?: boolean;
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
    targetChannel: '@hdasebingo_channel',
    lastDepositPostAt: null,
    lastWithdrawPostAt: null,
  });
  const [unpostedDeposits, setUnpostedDeposits] = useState(0);
  const [unpostedWithdrawals, setUnpostedWithdrawals] = useState(0);
  const [recentDeposits, setRecentDeposits] = useState<DepositItem[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<WithdrawalItem[]>([]);
  const [unpostedDepositsList, setUnpostedDepositsList] = useState<DepositItem[]>([]);
  const [unpostedWithdrawalsList, setUnpostedWithdrawalsList] = useState<WithdrawalItem[]>([]);
  const [feeSettings, setFeeSettings] = useState<{
    is_enabled: boolean;
    tier1_max_amount: number;
    tier1_fee_percent: number;
    tier2_max_amount: number;
    tier2_fee_percent: number;
    tier3_fee_percent: number;
  } | null>(null);

  // Batch size per flyer (editable from 10)
  const [depositBatchSize, setDepositBatchSize] = useState<number>(10);
  const [withdrawBatchSize, setWithdrawBatchSize] = useState<number>(10);
  const [isResettingHistory, setIsResettingHistory] = useState(false);

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

  // Preview data URLs
  const [depositDataUrl, setDepositDataUrl] = useState<string | null>(null);
  const [withdrawalDataUrl, setWithdrawalDataUrl] = useState<string | null>(null);

  // System Proofs Generator State
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [generatorCount, setGeneratorCount] = useState(10);
  const [depositMinInput, setDepositMinInput] = useState(50);
  const [depositMaxInput, setDepositMaxInput] = useState(1000);
  const [withdrawMinInput, setWithdrawMinInput] = useState(100);
  const [withdrawMaxInput, setWithdrawMaxInput] = useState(5000);
  const [preferWinners, setPreferWinners] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  // Real vs System Counts & Available Methods from DB
  const [realDepositsCount, setRealDepositsCount] = useState(0);
  const [systemDepositsCount, setSystemDepositsCount] = useState(0);
  const [realWithdrawalsCount, setRealWithdrawalsCount] = useState(0);
  const [systemWithdrawalsCount, setSystemWithdrawalsCount] = useState(0);
  const [availableDepositMethods, setAvailableDepositMethods] = useState<Array<{ id: string; name?: string; type: string }>>([]);
  const [availableWithdrawalMethods, setAvailableWithdrawalMethods] = useState<Array<{ id: string; type: string }>>([]);
  const [winnerBotsCount, setWinnerBotsCount] = useState(0);

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

  // Robust Auth Headers (works in Telegram Mini App, PWA, and browser)
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const initData = (typeof WebApp !== 'undefined' && WebApp.initData)
      ? WebApp.initData
      : (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData)
        ? (window as any).Telegram.WebApp.initData
        : '';
    if (initData) headers['x-telegram-init-data'] = initData;

    const pwaToken = typeof window !== 'undefined'
      ? (localStorage.getItem('hdase_pwa_token') || localStorage.getItem('pwa_token'))
      : null;
    if (pwaToken) {
      headers['x-pwa-token'] = pwaToken;
      headers['x-pwa-auth'] = pwaToken;
      headers['Authorization'] = `Bearer ${pwaToken}`;
    }
    return headers;
  };

  // Helper: Exact Player Name (No Masking)
  const getExactPlayerName = (u?: { first_name?: string; username?: string }): string => {
    if (u?.first_name && u.first_name.trim()) {
      return u.first_name.trim();
    }
    if (u?.username && u.username.trim()) {
      return `@${u.username.trim().replace(/^@/, '')}`;
    }
    return 'Player';
  };

  // Helper: Exact Winner Name (No Masking)
  const getExactWinnerName = (item: WithdrawalItem): string => {
    if (item.account_name && item.account_name.trim()) {
      return item.account_name.trim();
    }
    if (item.users?.first_name && item.users.first_name.trim()) {
      return item.users.first_name.trim();
    }
    if (item.users?.username && item.users.username.trim()) {
      return `@${item.users.username.trim().replace(/^@/, '')}`;
    }
    return 'Winner';
  };

  // Helper: Clean Bank / Method Name
  const formatMethodName = (type?: string, name?: string): string => {
    const t = (type || '').toLowerCase();
    if (t === 'telebirr') return 'Telebirr';
    if (t === 'cbe') return 'CBE Bank';
    if (t === 'cbebirr') return 'CBE Birr';
    if (t === 'boa' || t === 'abyssinia') return 'Abyssinia';
    if (t === 'awash') return 'Awash Bank';
    if (t === 'dashen') return 'Dashen Bank';
    if (t === 'amhara') return 'Amhara Bank';
    if (t === 'ebirr') return 'eBirr';
    if (t === 'wegagen') return 'Wegagen';
    if (t === 'mpesa') return 'M-Pesa';
    return name || type || 'Telebirr';
  };

  // ── Fetch data from API ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/channel-proofs/data`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setSettings(json.settings);
        setUnpostedDeposits(json.unpostedDepositsCount || 0);
        setUnpostedWithdrawals(json.unpostedWithdrawalsCount || 0);

        setRealDepositsCount(json.realDepositsCount || 0);
        setSystemDepositsCount(json.systemDepositsCount || 0);
        setRealWithdrawalsCount(json.realWithdrawalsCount || 0);
        setSystemWithdrawalsCount(json.systemWithdrawalsCount || 0);
        setAvailableDepositMethods(json.availableDepositMethods || []);
        setAvailableWithdrawalMethods(json.availableWithdrawalMethods || []);
        setWinnerBotsCount(json.winnerBotsCount || 0);
        if (json.feeSettings) setFeeSettings(json.feeSettings);
        
        const depList = json.unpostedDeposits || json.recentDeposits || [];
        const withList = json.unpostedWithdrawals || json.recentWithdrawals || [];
        setRecentDeposits(depList);
        setRecentWithdrawals(withList);
        setUnpostedDepositsList(depList);
        setUnpostedWithdrawalsList(withList);

        setFormDepositThreshold(String(json.settings.depositThreshold || 10));
        setFormDepositEnabled(json.settings.depositEnabled !== false);
        setFormWithdrawThreshold(String(json.settings.withdrawThreshold || 10));
        setFormWithdrawEnabled(json.settings.withdrawEnabled !== false);
        setFormTargetChannel(json.settings.targetChannel || '@hdasebingo_channel');

        // Sync batch size with settings threshold on first load
        setDepositBatchSize(prev => (prev === 10 && json.settings.depositThreshold) ? json.settings.depositThreshold : prev);
        setWithdrawBatchSize(prev => (prev === 10 && json.settings.withdrawThreshold) ? json.settings.withdrawThreshold : prev);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setPostErrorMsg(errJson.error || 'Failed to load channel proofs');
      }
    } catch (err: any) {
      console.error('Error fetching channel proofs data:', err);
      setPostErrorMsg(err.message || 'Error fetching proofs');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Generate System Player Proofs ─────────────────────────────────────────────
  const handleGenerateSystemProofs = async (presetCount?: number) => {
    const countToUse = presetCount || generatorCount;
    setIsGenerating(true);
    setPostErrorMsg(null);
    setPostSuccessMsg(null);
    triggerHaptic('medium');

    try {
      const isDep = activeTab === 'deposit';
      const minVal = isDep ? depositMinInput : withdrawMinInput;
      const maxVal = isDep ? depositMaxInput : withdrawMaxInput;

      const res = await fetch(`${API_URL}/channel-proofs/generate-system-proofs`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: activeTab,
          count: countToUse,
          min_deposit: minVal,
          max_deposit: maxVal,
          min_withdraw: minVal,
          max_withdraw: maxVal,
          prefer_winners: preferWinners,
        }),
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to generate system proofs');

      setPostSuccessMsg(d.message || `✅ በተሳካ ሁኔታ ${countToUse} የሲስተም ${isDep ? 'ዲፖዚቶች' : 'ክፍያዎች'} ተፈጥረው ከእውነተኛ ጋር ተቀላቅለዋል!`);
      triggerSuccessHaptic();
      await fetchData();
    } catch (err: any) {
      setPostErrorMsg(err.message || 'Failed to generate system proofs');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Clear Unposted System Proofs ──────────────────────────────────────────────
  const handleClearSystemProofs = async () => {
    if (!window.confirm(`እርግጠኛ ነዎት ያልተለጠፉ የሲስተም ${activeTab === 'deposit' ? 'ዲፖዚቶችን' : 'ክፍያዎችን'} ከኪው ማፅዳት ይፈልጋሉ?`)) {
      return;
    }
    triggerHaptic('medium');
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/channel-proofs/clear-system-proofs`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: activeTab }),
      });
      if (res.ok) {
        setPostSuccessMsg('የሲስተም ተጫዋች ፕሩፎች ኪው ፀድቷል');
        await fetchData();
      }
    } catch (err: any) {
      setPostErrorMsg(err.message || 'Failed to clear system proofs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── 1. GENERATE APPROVED DEPOSITS CANVAS POSTER (Ivory + Emerald Green + Amharic) ──
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

      // 5. Header in Amharic & English: "የተረጋገጡ ዲፖዚቶች • APPROVED DEPOSITS"
      ctx.fillStyle = '#15803d'; // Green badge
      ctx.font = '900 19px sans-serif';
      ctx.fillText('✅ የተረጋገጡ ዲፖዚቶች • APPROVED DEPOSITS', width / 2, 168);

      ctx.fillStyle = '#166534';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('ፈጣን የሂሳብ መሙያ • 100% የታመነ እና የተረጋገጠ አሰራር', width / 2, 188);

      // Green divider line
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 170, 198);
      ctx.lineTo(width / 2 + 170, 198);
      ctx.stroke();
      drawDiamond(width / 2, 198, 4.5, '#15803d');

      // 6. Luxury Central Table Card (holds 10 rows)
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

      // Rows: display unposted approved deposits from database
      const rowH = 50;
      let batchSum = 0;
      const currentBatch = Math.max(1, depositBatchSize);
      const sourceList = (unpostedDepositsList.length > 0 ? unpostedDepositsList : recentDeposits).slice(0, currentBatch);
      const rowCount = Math.min(10, sourceList.length);

      if (sourceList.length === 0) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✨ ሁሉም የተረጋገጡ ዲፖዚቶች ተለጥፈዋል!', width / 2, tableY + 280);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('አዳዲስ ዲፖዚቶች ሲረጋገጡ እዚህ በራስ-ሰር ይደረደራሉ', width / 2, tableY + 310);
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

          // Index pill in green
          ctx.fillStyle = '#dcfce7';
          ctx.beginPath();
          ctx.arc(tableX + 24, midRowY, 12, 0, Math.PI * 2);
          ctx.fill();

          // Index number in SOLID BLACK
          ctx.fillStyle = '#000000';
          ctx.font = '900 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(i + 1), tableX + 24, midRowY);

          if (item) {
            const amt = Number(item.amount || 0);
            batchSum += amt;
            const playerName = getExactPlayerName(item.users);
            const method = formatMethodName(item.deposit_methods?.type, item.deposit_methods?.name);

            // Player Name in SOLID BLACK (crisp, bold, ultra-readable)
            ctx.textAlign = 'left';
            ctx.fillStyle = '#000000';
            ctx.font = '900 14px sans-serif';
            ctx.fillText(playerName.substring(0, 16), tableX + 46, midRowY);

            // Method Badge with SOLID BLACK text
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

            ctx.fillStyle = '#000000'; // SOLID BLACK method text
            ctx.font = 'bold 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(method.substring(0, 12), tableX + 275, midRowY);

            // Amount in Bold Deep Green
            ctx.textAlign = 'right';
            ctx.fillStyle = '#15803d';
            ctx.font = '900 15px sans-serif';
            ctx.fillText(`+${amt.toLocaleString()} ETB`, tableX + 480, midRowY);

            // Status Badge in Amharic
            ctx.fillStyle = '#15803d';
            ctx.font = '900 12px sans-serif';
            ctx.fillText('✅ ገቢ ተደርጓል', tableX + tableW - 20, midRowY);
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
      ctx.fillStyle = '#000000'; // SOLID BLACK label
      ctx.font = '900 14px sans-serif';
      ctx.fillText('💰 አጠቃላይ የተጨመረ ዲፖዚት (TOTAL):', tableX + 28, midSumY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#15803d'; // Deep green amount
      ctx.font = '900 19px sans-serif';
      const displaySum = batchSum > 0 ? batchSum : 1500;
      ctx.fillText(`${displaySum.toLocaleString()} ETB`, tableX + tableW - 28, midSumY);

      // 7. Trust Badges row in Amharic & English
      const badgeY = 878;
      const badges = [
        { icon: '⚡', label: 'ፈጣን ገቢ' },
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

        ctx.fillStyle = '#000000'; // SOLID BLACK badge text
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
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🎮 አሁኑኑ ይጫወቱ: @${botUsername}`, width / 2, botBoxY + botBoxH / 2);
      ctx.textBaseline = 'alphabetic';

      // 10. Footer
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('ህዳሴ ቢንጎ • Official Partner Network • Powered by HDASE BINGO', width / 2, 1056);

      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error generating deposit proof canvas:', e);
      return null;
    }
  }, [unpostedDepositsList, recentDeposits, depositBatchSize, botUsername]);

  // ── 2. GENERATE APPROVED WITHDRAWALS CANVAS (Ivory + Ruby RED Line & Accents + Amharic) ──
  const generateWithdrawalCanvas = useCallback((): string | null => {
    try {
      const width = 750;
      const height = 1150;
      const canvas = withdrawalCanvasRef.current || document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Crystal-clear warm ivory luxury background (exact same clarity as deposit)
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

      // 3. Top Royal Crown & HB Medallion Emblem with Ruby Red accent
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

      // Medallion Circle with HB Monogram in deep ruby red
      ctx.fillStyle = '#991b1b'; // Ruby Red medallion
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

      // 5. Header in Amharic & English: "የተረጋገጡ የሽልማት ክፍያዎች • CASHOUT PROOFS"
      ctx.fillStyle = '#dc2626'; // Bold Ruby Red
      ctx.font = '900 19px sans-serif';
      ctx.fillText('🔴 የተረጋገጡ የሽልማት ክፍያዎች • CASHOUT PROOFS', width / 2, 168);

      ctx.fillStyle = '#991b1b'; // Red subtitle
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('የታመኑ አሸናፊዎች • ፈጣን የባንክ እና ቴሌብር ክፍያ', width / 2, 188);

      // DISTINCTIVE RED DIVIDER LINE (as requested by user)
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 170, 198);
      ctx.lineTo(width / 2 + 170, 198);
      ctx.stroke();
      drawDiamond(width / 2, 198, 5, '#dc2626');

      // 6. Luxury Central White Table Card (holds 10 rows)
      const tableX = 40;
      const tableY = 216;
      const tableW = width - 80;
      const tableH = 630;
      const tableRadius = 20;

      ctx.shadowColor = 'rgba(180, 50, 50, 0.09)';
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
      ctx.fillText('አሸናፊ (WINNER)', tableX + 46, tableY + headH / 2);
      ctx.fillText('ዘዴ / ባንክ (METHOD)', tableX + 225, tableY + headH / 2);
      ctx.textAlign = 'right';
      ctx.fillText('የተከፈለ (NET PAYOUT)', tableX + 480, tableY + headH / 2);
      ctx.fillText('ሁኔታ (STATUS)', tableX + tableW - 20, tableY + headH / 2);
      ctx.textBaseline = 'alphabetic';

      // Rows: display unposted approved withdrawals from database
      const rowH = 50;
      let batchSum = 0;
      const currentBatch = Math.max(1, withdrawBatchSize);
      const sourceList = (unpostedWithdrawalsList.length > 0 ? unpostedWithdrawalsList : recentWithdrawals).slice(0, currentBatch);
      const rowCount = Math.min(10, sourceList.length);

      if (sourceList.length === 0) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✨ ሁሉም የተረጋገጡ ክፍያዎች ተለጥፈዋል!', width / 2, tableY + 280);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('አዳዲስ ክፍያዎች ሲረጋገጡ እዚህ በራስ-ሰር ይደረደራሉ', width / 2, tableY + 310);
      } else {
        for (let i = 0; i < rowCount; i++) {
          const item = sourceList[i];
          const rowY = tableY + headH + i * rowH;

          if (i % 2 === 1) {
            ctx.fillStyle = '#fff9f9';
            ctx.fillRect(tableX + 1, rowY, tableW - 2, rowH);
          }

          if (i < rowCount - 1) {
            ctx.strokeStyle = '#fee2e2'; // Light red row separator
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tableX + 10, rowY + rowH);
            ctx.lineTo(tableX + tableW - 10, rowY + rowH);
            ctx.stroke();
          }

          const midRowY = rowY + rowH / 2;
          ctx.textBaseline = 'middle';

          // Index pill in rose red
          ctx.fillStyle = '#fee2e2';
          ctx.beginPath();
          ctx.arc(tableX + 24, midRowY, 12, 0, Math.PI * 2);
          ctx.fill();

          // Index number in SOLID BLACK
          ctx.fillStyle = '#000000';
          ctx.font = '900 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(i + 1), tableX + 24, midRowY);

          if (item) {
            const net = Number(item.net_amount || item.amount || 0);
            batchSum += net;
            const winnerName = getExactWinnerName(item);
            const method = formatMethodName(item.withdrawal_methods?.type, item.account_name);

            // Winner Name in SOLID BLACK (crisp, bold, ultra-readable)
            ctx.textAlign = 'left';
            ctx.fillStyle = '#000000';
            ctx.font = '900 14px sans-serif';
            ctx.fillText(winnerName.substring(0, 16), tableX + 46, midRowY);

            // Method Badge with SOLID BLACK text
            ctx.fillStyle = '#fff1f2';
            ctx.beginPath();
            ctx.roundRect(tableX + 225, midRowY - 12, 100, 25, 6);
            ctx.fill();
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.fillStyle = '#000000'; // SOLID BLACK method text
            ctx.font = 'bold 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(method.substring(0, 12), tableX + 275, midRowY);

            // Net Payout in BOLD RUBY RED
            ctx.textAlign = 'right';
            ctx.fillStyle = '#dc2626';
            ctx.font = '900 15px sans-serif';
            ctx.fillText(`+${net.toLocaleString()} ETB`, tableX + 480, midRowY);

            // Status Badge in Amharic
            ctx.fillStyle = '#15803d';
            ctx.font = '900 12px sans-serif';
            ctx.fillText('✅ ተከፍሏል', tableX + tableW - 20, midRowY);
          }
        }
      }

      // Summary Card Footer inside Table Box
      const sumBoxY = tableY + tableH - 62;
      const sumGrad = ctx.createLinearGradient(tableX, sumBoxY, tableX + tableW, sumBoxY);
      sumGrad.addColorStop(0, '#fee2e2');
      sumGrad.addColorStop(0.5, '#fef9c3');
      sumGrad.addColorStop(1, '#fee2e2');
      ctx.fillStyle = sumGrad;
      ctx.beginPath();
      ctx.roundRect(tableX + 12, sumBoxY, tableW - 24, 50, 12);
      ctx.fill();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const midSumY = sumBoxY + 25;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#000000'; // SOLID BLACK label
      ctx.font = '900 14px sans-serif';
      ctx.fillText('💸 አጠቃላይ የተከፈለ ሽልማት (TOTAL):', tableX + 28, midSumY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#dc2626'; // Bold Red amount
      ctx.font = '900 19px sans-serif';
      const displaySum = batchSum > 0 ? batchSum : 0;
      ctx.fillText(`${displaySum.toLocaleString()} ETB`, tableX + tableW - 28, midSumY);

      // 7. Trust Badges row in Amharic & English
      const badgeY = 878;
      const badges = [
        { icon: '⚡', label: 'ፈጣን ክፍያ' },
        { icon: '🏆', label: 'እውነተኛ አሸናፊዎች' },
        { icon: '🛡️', label: '100% አስተማማኝ' },
        { icon: '💎', label: 'ህዳሴ ቢንጎ' },
      ];

      const colW = (width - 100) / 4;
      badges.forEach((b, idx) => {
        const colX = 50 + idx * colW + colW / 2;
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.icon, colX, badgeY);

        ctx.fillStyle = '#000000'; // SOLID BLACK text
        ctx.font = '900 11px sans-serif';
        ctx.fillText(b.label, colX, badgeY + 22);

        if (idx < 3) {
          const divX = 50 + (idx + 1) * colW;
          ctx.strokeStyle = '#fca5a5';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(divX, badgeY - 12);
          ctx.lineTo(divX, badgeY + 22);
          ctx.stroke();
        }
      });

      // 8. Cursive Motto in Amharic
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7f1d1d';
      ctx.font = 'bold 20px "Times New Roman", Georgia, serif';
      ctx.fillText('በእምነት ይጫወቱ  •  እውነተኛ ብር ያሸንፉ  •  ወዲያውኑ ያውጡ', width / 2, 946);

      // 9. Official Bot Handle Box in Ruby Red gradient
      const botBoxW = 440;
      const botBoxH = 46;
      const botBoxX = (width - botBoxW) / 2;
      const botBoxY = 975;

      const botGrad = ctx.createLinearGradient(botBoxX, botBoxY, botBoxX + botBoxW, botBoxY);
      botGrad.addColorStop(0, '#dc2626');
      botGrad.addColorStop(1, '#991b1b');
      ctx.fillStyle = botGrad;
      ctx.beginPath();
      ctx.roundRect(botBoxX, botBoxY, botBoxH, botBoxH, 23);
      ctx.fill();

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🎮 ይጫወቱ እና ያውጡ: @${botUsername}`, width / 2, botBoxY + botBoxH / 2);
      ctx.textBaseline = 'alphabetic';

      // 10. Footer
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('ህዳሴ ቢንጎ • Official Partner Network • Powered by HDASE BINGO', width / 2, 1056);

      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error generating withdrawal proof canvas:', e);
      return null;
    }
  }, [unpostedWithdrawalsList, recentWithdrawals, withdrawBatchSize, botUsername]);

  // Update previews whenever data or active tab changes
  useEffect(() => {
    if (loading) return;

    const timer = setTimeout(() => {
      const depUrl = generateDepositCanvas();
      if (depUrl) setDepositDataUrl(depUrl);

      const withUrl = generateWithdrawalCanvas();
      if (withUrl) setWithdrawalDataUrl(withUrl);
    }, 120);

    return () => clearTimeout(timer);
  }, [loading, generateDepositCanvas, generateWithdrawalCanvas, unpostedDepositsList, unpostedWithdrawalsList, depositBatchSize, withdrawBatchSize]);

  // Automatic background cache sync so R2 ALWAYS has fresh high-res canvas images with real data
  useEffect(() => {
    if (depositDataUrl && recentDeposits.length > 0) {
      fetch(`${API_URL}/channel-proofs/sync-cache`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: 'deposit', image_base64: depositDataUrl }),
      }).catch(() => {});
    }
  }, [depositDataUrl, recentDeposits.length]);

  useEffect(() => {
    if (withdrawalDataUrl && recentWithdrawals.length > 0) {
      fetch(`${API_URL}/channel-proofs/sync-cache`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: 'withdrawal', image_base64: withdrawalDataUrl }),
      }).catch(() => {});
    }
  }, [withdrawalDataUrl, recentWithdrawals.length]);

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
    const dataUrl = activeDataUrl || (activeTab === 'deposit' ? generateDepositCanvas() : generateWithdrawalCanvas());
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
    const dataUrl = activeDataUrl || (activeTab === 'deposit' ? generateDepositCanvas() : generateWithdrawalCanvas());
    if (!dataUrl) return;

    setIsSendingToTg(true);
    setPostErrorMsg(null);
    try {
      const res = await fetch(`${API_URL}/channel-proofs/send-to-me`, {
        method: 'POST',
        headers: getAuthHeaders(),
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
    const flyerItems = activeTab === 'deposit'
      ? unpostedDepositsList.slice(0, depositBatchSize)
      : unpostedWithdrawalsList.slice(0, withdrawBatchSize);

    if (flyerItems.length === 0) {
      setPostErrorMsg(`የሚለጠፍ ያልተለጠፈ የ${activeTab === 'deposit' ? 'ዲፖዚት' : 'ክፍያ'} መረጃ የለም! (No unposted items pending)`);
      return;
    }

    const dataUrl = activeDataUrl || (activeTab === 'deposit' ? generateDepositCanvas() : generateWithdrawalCanvas());
    if (!dataUrl) {
      setPostErrorMsg('ምስሉ በመዘጋጀት ላይ ነው፣ እባክዎ ጥቂት ሰከንዶች ይጠብቁ... (Canvas is rendering, please wait)');
      return;
    }

    setIsPosting(true);
    setPostErrorMsg(null);
    setPostSuccessMsg(null);

    try {
      const res = await fetch(`${API_URL}/channel-proofs/post`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: activeTab,
          image_base64: dataUrl,
          custom_channel: settings.targetChannel,
          posted_ids: flyerItems.map(i => i.id),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        triggerSuccessHaptic();
        setPostSuccessMsg(`ትክክለኛው የ${flyerItems.length} ተጫዋቾች የ${activeTab === 'deposit' ? 'ዲፖዚት' : 'ክፍያ'} ምስል በተሳካ ሁኔታ ተለጥፏል! እነኚህ ${flyerItems.length} መረጃዎች ከዝርዝሩ ወጥተዋል። 🎉`);
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

  // ── Reset Post History ───────────────────────────────────────────────────────
  const handleResetHistory = async () => {
    if (!window.confirm(`ሁሉንም የተረጋገጡ የ${activeTab === 'deposit' ? 'ዲፖዚት' : 'ክፍያ'} መረጃዎች እንደገና ያልተለጠፉ እንዲሆኑ ማድረግ ይፈልጋሉ?`)) {
      return;
    }
    triggerHaptic('medium');
    setIsResettingHistory(true);
    try {
      const res = await fetch(`${API_URL}/channel-proofs/reset-history`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: activeTab }),
      });
      if (res.ok) {
        triggerSuccessHaptic();
        setPostSuccessMsg('የፖስት ታሪክ ዳግም ተጀምሯል! ሁሉም መረጃዎች ተመልሰዋል።');
        fetchData();
        setTimeout(() => setPostSuccessMsg(null), 4000);
      }
    } catch (e: any) {
      setPostErrorMsg(e.message || 'Failed to reset history');
    } finally {
      setIsResettingHistory(false);
    }
  };

  // ── Toggle Individual Item Posted ────────────────────────────────────────────
  const handleToggleItemPosted = async (id: string, action: 'post' | 'unpost') => {
    triggerHaptic('light');
    try {
      const res = await fetch(`${API_URL}/channel-proofs/mark-item`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: activeTab, id, action }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ── Save Auto-post Settings ──────────────────────────────────────────────────
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('medium');
    setIsSavingSettings(true);
    setPostErrorMsg(null);

    try {
      const res = await fetch(`${API_URL}/channel-proofs/settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
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
      <div className="bg-white border-b border-slate-100 px-4 py-3 sticky top-0 z-30 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <Link
            to="/admin"
            className="w-9 h-9 rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-black text-slate-900 leading-tight flex items-center gap-1.5">
              <span>Channel Proofs</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                Auto & Manual
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">Approved Deposits & Withdrawals</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => {
              triggerHaptic('light');
              setIsGeneratorOpen(!isGeneratorOpen);
            }}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs ${
              isGeneratorOpen
                ? 'bg-indigo-600 text-white border border-indigo-700'
                : 'bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800'
            }`}
            title="የሲስተም ተጫዋቾች ፕሩፍ ማመንጫ (System Proofs Generator)"
          >
            <Bot size={14} className={isGeneratorOpen ? 'text-white' : 'text-indigo-600'} />
            <span>+ System Bots</span>
            {(activeTab === 'deposit' ? systemDepositsCount : systemWithdrawalsCount) > 0 && (
              <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                isGeneratorOpen ? 'bg-white text-indigo-700' : 'bg-indigo-200 text-indigo-900'
              }`}>
                {activeTab === 'deposit' ? systemDepositsCount : systemWithdrawalsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="w-9 h-9 rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all relative"
            title="Auto-post Settings"
          >
            <Settings2 size={18} />
          </button>
          <button
            onClick={() => {
              triggerHaptic('light');
              fetchData();
            }}
            disabled={loading}
            className="w-9 h-9 rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-emerald-600' : ''} />
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Official Telegram Channel
                </label>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Dynamic Setting
                </span>
              </div>
              <input
                type="text"
                value={formTargetChannel}
                onChange={(e) => setFormTargetChannel(e.target.value)}
                placeholder={settings.targetChannel || '@hdasebingo_channel'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Automatically synced with the official channel configured in Admin Settings. Bot must be an administrator in this channel.
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
            <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                  <ArrowUpFromLine size={14} className="text-rose-600" />
                  <span>Approved Withdrawals Auto-Post</span>
                </span>
                <input
                  type="checkbox"
                  checked={formWithdrawEnabled}
                  onChange={(e) => setFormWithdrawEnabled(e.target.checked)}
                  className="w-4 h-4 accent-rose-600 rounded"
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
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {isSavingSettings ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              <span>Save Configurations</span>
            </button>
          </form>
        </div>
      )}

      {/* Main Tabs */}
      <div className="p-3.5 pt-3 pb-2 max-w-lg mx-auto w-full">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-1">
          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('deposit');
            }}
            className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all active:scale-[0.98] ${
              activeTab === 'deposit'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowDownToLine size={15} />
            <span>Deposits</span>
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
            className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all active:scale-[0.98] ${
              activeTab === 'withdrawal'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowUpFromLine size={15} />
            <span>Withdrawals</span>
            {unpostedWithdrawals > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'withdrawal' ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-800'
              }`}>
                {unpostedWithdrawals}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 1-CLICK SYSTEM PROOFS GENERATOR (Directly in Channel Proofs) ── */}
      {isGeneratorOpen && (
        <div className="mx-4 mb-3 bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/80 border-2 border-indigo-200/90 rounded-2xl p-4 shadow-sm animate-fadeIn space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs">
                <Bot size={16} />
              </div>
              <div>
                <h3 className="font-black text-xs uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                  <span>1-Click System Proof Generator</span>
                </h3>
                <p className="text-[10px] text-indigo-700/80 font-medium">
                  Automatically mix realistic {activeTab === 'deposit' ? 'deposits' : 'cash-outs'} with real players
                </p>
              </div>
            </div>
            {winnerBotsCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                <Trophy size={11} className="text-amber-600" />
                <span>{winnerBotsCount} Winners Pool</span>
              </span>
            )}
          </div>

          {/* Sourced Methods Banner */}
          <div className="p-2.5 bg-white/90 rounded-xl border border-indigo-100 text-[11px] text-slate-700 flex items-start gap-2">
            <Sparkles size={14} className="text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">
                {activeTab === 'deposit'
                  ? `⚡ Sourcing from ${availableDepositMethods.length} Active Database Methods:`
                  : `⚡ Sourcing from ${availableWithdrawalMethods.length} Active Database Methods:`
                }
              </p>
              <p className="text-[10px] text-slate-500 font-medium">
                {activeTab === 'deposit'
                  ? availableDepositMethods.map(m => m.name || m.type).join(' • ')
                  : availableWithdrawalMethods.map(m => m.type.toUpperCase()).join(' • ')
                }
              </p>
            </div>
          </div>

          {/* Tiered Withdrawal Fee Notice */}
          {activeTab === 'withdrawal' && feeSettings?.is_enabled && (
            <div className="p-2.5 bg-amber-50/90 rounded-xl border border-amber-200/90 text-[11px] text-amber-900 flex items-start gap-2">
              <Percent size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950">
                  ደረጃውን የጠበቀ የመውጫ ክፍያ (Tiered Fee Applied):
                </p>
                <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                  Tier 1 (≤ {Number(feeSettings.tier1_max_amount || 2000).toLocaleString()} ETB): {feeSettings.tier1_fee_percent}% • Tier 2 (≤ {Number(feeSettings.tier2_max_amount || 10000).toLocaleString()} ETB): {feeSettings.tier2_fee_percent}% • Tier 3: {feeSettings.tier3_fee_percent}%
                </p>
                <p className="text-[9.5px] text-amber-700/90 font-semibold mt-0.5">
                  ምሳሌ፦ 800 ብር ሲወጣ 3% ተቀንሶ የተጣራ 776 ብር በፖስተሩ ላይ ይወጣል።
                </p>
              </div>
            </div>
          )}

          {/* Amount Range inputs */}
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

          {/* Quantity Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-slate-600">
                የሚፈጠረው ብዛት (Quantity):
              </label>
              <span className="text-[10px] font-black text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                {generatorCount} {activeTab === 'deposit' ? 'ዲፖዚቶች' : 'ክፍያዎች'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[10, 20, 30, 50].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setGeneratorCount(num);
                  }}
                  className={`py-1.5 rounded-xl font-black text-xs transition-all active:scale-95 ${
                    generatorCount === num
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  +{num}
                </button>
              ))}
            </div>
          </div>

          {/* Prioritize winners checkbox */}
          <label className="flex items-center gap-2 cursor-pointer pt-1 text-xs text-slate-700 select-none">
            <input
              type="checkbox"
              checked={preferWinners}
              onChange={(e) => setPreferWinners(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            <span className="font-bold text-[11px]">
              ያሸነፉ ቦቶችን አስቀድም (Prioritize Winner Bots)
            </span>
          </label>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleGenerateSystemProofs()}
              disabled={isGenerating}
              className={`flex-1 py-3 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 ${
                activeTab === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>በማመንጨት ላይ...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>GENERATE {generatorCount} SYSTEM {activeTab === 'deposit' ? 'DEPOSITS' : 'CASHOUTS'}</span>
                </>
              )}
            </button>

            {(activeTab === 'deposit' ? systemDepositsCount : systemWithdrawalsCount) > 0 && (
              <button
                type="button"
                onClick={handleClearSystemProofs}
                className="px-3 py-3 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-600 hover:text-rose-600 rounded-xl font-bold text-xs transition-all active:scale-95"
                title="የሲስተም ኪው አፅዳ"
              >
                Clear Queue
              </button>
            )}
          </div>
        </div>
      )}

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
                  : 'bg-gradient-to-r from-rose-500 to-red-600'
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

          {/* Mixed Queue Breakdown (Real + System Bots) */}
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span>👤</span>
                <span>{activeTab === 'deposit' ? realDepositsCount : realWithdrawalsCount} Real</span>
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                <span>🤖</span>
                <span>{activeTab === 'deposit' ? systemDepositsCount : systemWithdrawalsCount} System</span>
              </span>
            </div>
            <span className="text-[10px] font-black text-slate-500">
              = {activeUnposted} Mixed Total Ready
            </span>
          </div>
        </div>
      </div>

      {/* High-Resolution Live Canvas Preview */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
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
      <div className="px-3.5 space-y-2 max-w-lg mx-auto w-full">
        {/* Main 1-Click Post to Channel */}
        <button
          onClick={handlePostToChannel}
          disabled={isPosting || !activeDataUrl}
          className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 shadow-md active:scale-[0.98] transition-all ${
            activeTab === 'deposit'
              ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-emerald-600/25'
              : 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-rose-600/25'
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
              <span>Post {activeTab === 'deposit' ? 'Deposits' : 'Withdrawals'} to Channel</span>
            </>
          )}
        </button>

        {/* Secondary Download and Telegram Delivery Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDownloadPoster}
            disabled={!activeDataUrl}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm active:scale-[0.98] transition-all"
          >
            <Download size={14} />
            <span>Download PNG</span>
          </button>

          <button
            onClick={handleSendToMyTelegram}
            disabled={isSendingToTg || !activeDataUrl}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm active:scale-[0.98] transition-all"
          >
            {isSendingToTg ? (
              <RefreshCw size={14} className="animate-spin text-emerald-600" />
            ) : (
              <Sparkles size={14} className="text-amber-500" />
            )}
            <span>Send to My TG</span>
          </button>
        </div>

        {/* Channel Link Info */}
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

      {/* ── NOT POSTED APPROVED TRANSACTIONS SECTION ── */}
      <div className="px-4 mt-6 mb-8 space-y-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${activeTab === 'deposit' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                <h3 className="font-black text-sm text-slate-900">
                  {activeTab === 'deposit' ? 'ያልተለጠፉ የተረጋገጡ ዲፖዚቶች' : 'ያልተለጠፉ የተረጋገጡ ክፍያዎች'}
                </h3>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                  activeTab === 'deposit' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {activeTab === 'deposit' ? unpostedDepositsList.length : unpostedWithdrawalsList.length} ያልተለጠፉ
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                እነዚህ መረጃዎች ወደ ቻናሉ ለመለጠፍ የተዘጋጁ ናቸው (ከተለጠፉ በኋላ ከዚህ ክፍል ይወገዳሉ)
              </p>
            </div>

            <button
              onClick={handleResetHistory}
              disabled={isResettingHistory}
              className="text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 active:bg-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all"
              title="ሁሉንም እንደገና ያልተለጠፉ አድርግ"
            >
              <RotateCcw size={12} className={isResettingHistory ? 'animate-spin' : ''} />
              <span>ዳግም ጀምር (Reset All)</span>
            </button>
          </div>

          {/* Batch Size Quick Adjuster */}
          <div className="py-2.5 px-3 bg-slate-50 rounded-xl mt-3 border border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">በፖስተር የሚካተት ብዛት:</span>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
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
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-rose-600 text-white shadow-sm'
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
            {activeTab === 'deposit' ? (
              unpostedDepositsList.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-xs font-black text-slate-700">ሁሉም የተረጋገጡ ዲፖዚቶች ተለጥፈዋል!</p>
                  <p className="text-[11px] text-slate-400 mt-1">አዲስ ዲፖዚት ሲረጋገጥ እዚህ በራስ-ሰር ይደረደራል።</p>
                </div>
              ) : (
                unpostedDepositsList.map((item, index) => {
                  const isInFlyer = index < depositBatchSize;
                  const amt = Number(item.amount || 0);
                  const playerName = getExactPlayerName(item.users);
                  const method = formatMethodName(item.deposit_methods?.type, item.deposit_methods?.name);
                  const timeFormatted = item.updated_at ? new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const dateFormatted = item.updated_at ? new Date(item.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all ${
                        isInFlyer
                          ? 'bg-emerald-50/70 border-emerald-300 shadow-sm ring-1 ring-emerald-300/50'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            isInFlyer ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {index + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-slate-900">{playerName}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {method}
                              </span>
                              {item.is_system ? (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  🤖 System
                                </span>
                              ) : (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  👤 Real
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              <Clock size={10} />
                              <span>{dateFormatted} {timeFormatted}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-xs font-black text-emerald-700 block">
                              +{amt.toLocaleString()} ETB
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                              isInFlyer ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {isInFlyer ? '🟢 በፖስተሩ ላይ' : '⏳ ለቀጣይ ፖስተር'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleItemPosted(item.id, 'post')}
                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-600 active:bg-rose-50 rounded-xl active:scale-90 transition-all"
                            title="አስወግድ (እንደተለጠፈ ቁጠር)"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              unpostedWithdrawalsList.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                  <CheckCircle2 size={32} className="mx-auto text-rose-500 mb-2" />
                  <p className="text-xs font-black text-slate-700">ሁሉም የተረጋገጡ ክፍያዎች ተለጥፈዋል!</p>
                  <p className="text-[11px] text-slate-400 mt-1">አዲስ ክፍያ ሲረጋገጥ እዚህ በራስ-ሰር ይደረደራል።</p>
                </div>
              ) : (
                unpostedWithdrawalsList.map((item, index) => {
                  const isInFlyer = index < withdrawBatchSize;
                  const amt = Number(item.net_amount || item.amount || 0);
                  const winnerName = getExactWinnerName(item);
                  const method = formatMethodName(item.withdrawal_methods?.type, item.account_name);
                  const timeFormatted = item.updated_at ? new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const dateFormatted = item.updated_at ? new Date(item.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all ${
                        isInFlyer
                          ? 'bg-rose-50/70 border-rose-300 shadow-sm ring-1 ring-rose-300/50'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            isInFlyer ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {index + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-slate-900">{winnerName}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {method}
                              </span>
                              {item.is_system ? (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  🤖 System
                                </span>
                              ) : (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  👤 Real
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              <Clock size={10} />
                              <span>{dateFormatted} {timeFormatted}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-xs font-black text-rose-700 block">
                              +{amt.toLocaleString()} ETB
                            </span>
                            {item.fee_amount && Number(item.fee_amount) > 0 ? (
                              <span className="text-[9px] text-slate-400 font-bold block">
                                ጠቅላላ፦ {Number(item.amount).toLocaleString()} (-{Number(item.fee_amount)} ክፍያ)
                              </span>
                            ) : null}
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                              isInFlyer ? 'bg-rose-200 text-rose-900' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {isInFlyer ? '🔴 በፖስተሩ ላይ' : '⏳ ለቀጣይ ፖስተር'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleItemPosted(item.id, 'post')}
                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-600 active:bg-rose-50 rounded-xl active:scale-90 transition-all"
                            title="አስወግድ (እንደተለጠፈ ቁጠር)"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
