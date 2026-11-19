import { useState, useEffect, useCallback, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { Navigate, Link } from 'react-router-dom';
import { 
  ArrowDownToLine, ArrowUpFromLine, TrendingUp, Calendar, RefreshCw, 
  Search, Fingerprint, X, Minus, ChevronDown, ChevronUp, ChevronRight, 
  Send, Copy, Check, UploadCloud, ArrowLeft, Building2, Eye, Clock, CheckCircle2, XCircle,
  Landmark, Smartphone, BarChart3, Activity, ArrowUpRight, ArrowDownRight, Wallet, Table, Layers,
  Scan, PlusCircle, UserCheck, FileText, Sparkles, User
} from 'lucide-react';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface DepositMethod {
  id: string;
  type: string;
  name: string;
  account_number?: string;
  logo_url?: string;
  min_deposit?: number;
}

interface ChartDay {
  date: string;
  label: string;
  deposits: number;
  withdrawals: number;
  net_profit: number;
  deposit_count: number;
  withdrawal_count: number;
}

interface WorkerProfitStats {
  totalDeposits: number;
  totalWithdrawals: number;
  totalFees: number;
  netProfit: number;
  depositCount?: number;
  withdrawalCount?: number;
}

interface ManagerAccount {
  id: string;
  bank_type: string;
  account_name: string;
  account_number: string;
  is_active: boolean;
}

interface WorkerTransfer {
  id: string;
  worker_name: string;
  bank_type: string;
  account_name: string;
  account_number: string;
  amount: number;
  screenshot_url: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

interface Reduction {
  id: string;
  amount: number;
  note: string;
  reduced_by: string;
  created_at: string;
}

interface BalanceResponse {
  netRemaining: number;
  netProfit?: number;
  totalReduced?: number;
  transfers?: WorkerTransfer[];
  reductions?: Reduction[];
}

const BANK_NAMES: Record<string, string> = {
  cbe: 'Commercial Bank of Ethiopia (CBE)',
  boa: 'Bank of Abyssinia (BOA)',
  telebirr: 'Telebirr',
};

function toDateStr(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Worker() {
  const { user } = useGameStore();
  const [activePreset, setActivePreset] = useState('Today');
  const [stats, setStats] = useState<WorkerProfitStats>({ totalDeposits: 0, totalWithdrawals: 0, totalFees: 0, netProfit: 0 });
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [chartMetric, setChartMetric] = useState<'profit' | 'deposits' | 'withdrawals'>('profit');
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);
  const [showTableView, setShowTableView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

  // Net remaining balance (fingerprint modal)
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [showBalanceHistory, setShowBalanceHistory] = useState(true);

  // Transfer to Manager state
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [managerAccounts, setManagerAccounts] = useState<ManagerAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploadingTransfer, setUploadingTransfer] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Custom date range state
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  // Manual / Direct Deposit by Worker state
  const [showDirectDepositModal, setShowDirectDepositModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [manualAmount, setManualAmount] = useState('');
  const [manualMethodId, setManualMethodId] = useState('');
  const [manualFtNumber, setManualFtNumber] = useState('');
  const [manualScreenshotFile, setManualScreenshotFile] = useState<File | null>(null);
  const [manualScreenshotPreview, setManualScreenshotPreview] = useState<string | null>(null);
  const [manualNote, setManualNote] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);
  const [manualErrorMsg, setManualErrorMsg] = useState<string | null>(null);
  const [depositMethods, setDepositMethods] = useState<DepositMethod[]>([]);

  const startOf = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.toISOString();
  };

  const endOf = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy.toISOString();
  };

  const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
      WebApp.HapticFeedback.impactOccurred(style);
    }
  };

  const fmtAmt = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(Number(val))) return '0';
    return Number(val).toLocaleString('en-US');
  };

  const fmtCompact = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toFixed(0);
  };

  const fetchReport = useCallback(async (fromIso: string, toIso: string) => {
    setLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const params = new URLSearchParams();
      if (fromIso) params.append('from', fromIso);
      if (toIso) params.append('to', toIso);

      const res = await fetch(`${API_URL}/admin/profit-report?${params}`, {
        headers: { 'x-telegram-init-data': initData }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setChartData(data.chart_data || []);
        setSelectedDayIdx(null);
      } else if (res.status === 404) {
        alert("Backend update required! Please run 'git pull' and 'docker compose up -d --build' on your VPS.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const maxChartValue = useMemo(() => {
    if (!chartData || chartData.length === 0) return 10;
    const values = chartData.map(d => {
      if (chartMetric === 'deposits') return d.deposits;
      if (chartMetric === 'withdrawals') return d.withdrawals;
      return Math.abs(d.net_profit);
    });
    const max = Math.max(...values, 0);
    return max === 0 ? 10 : max;
  }, [chartData, chartMetric]);

  const selectedDay = useMemo(() => {
    if (selectedDayIdx !== null && chartData[selectedDayIdx]) {
      return chartData[selectedDayIdx];
    }
    return chartData[chartData.length - 1] || null;
  }, [selectedDayIdx, chartData]);

  const depositVolume = stats.totalDeposits || 0;
  const withdrawalVolume = stats.totalWithdrawals || 0;
  const totalVolume = depositVolume + withdrawalVolume;
  const depositPct = totalVolume > 0 ? Math.round((depositVolume / totalVolume) * 100) : 50;
  const withdrawalPct = totalVolume > 0 ? 100 - depositPct : 50;
  const profitMargin = depositVolume > 0 ? Math.round(((stats.netProfit || 0) / depositVolume) * 1000) / 10 : 0;

  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    setShowCustom(false);
    const now = new Date();

    let fromIso = '';
    let toIso = '';

    if (preset === 'Today') {
      fromIso = startOf(now);
      toIso = endOf(now);
    } else if (preset === 'Yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      fromIso = startOf(yest);
      toIso = endOf(yest);
    } else if (preset === '7 Days') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      fromIso = startOf(d);
      toIso = endOf(now);
    } else if (preset === '1 Month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      fromIso = startOf(d);
      toIso = endOf(now);
    } else if (preset === '3 Months') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      fromIso = startOf(d);
      toIso = endOf(now);
    } else if (preset === '6 Months') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      fromIso = startOf(d);
      toIso = endOf(now);
    } else if (preset === '1 Year') {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      fromIso = startOf(d);
      toIso = endOf(now);
    }

    fetchReport(fromIso, toIso);
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    setActivePreset('Custom');
    setShowCustom(false);
    const from = new Date(customFrom);
    const to = new Date(customTo);
    fetchReport(startOf(from), endOf(to));
  };

  const fetchPendingCounts = useCallback(async () => {
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/admin/pending-counts`, {
        headers: { 'x-telegram-init-data': initData }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingDeposits(data.pendingDeposits);
        setPendingWithdrawals(data.pendingWithdrawals);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const openBalanceModal = async () => {
    setShowBalanceModal(true);
    setShowTransferForm(false);
    setBalanceLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const [balRes, accRes] = await Promise.all([
        fetch(`${API_URL}/admin/audit/worker-balance`, { headers: { 'x-telegram-init-data': initData } }),
        fetch(`${API_URL}/admin/manager-accounts`, { headers: { 'x-telegram-init-data': initData } }),
      ]);
      if (balRes.ok) setBalanceData(await balRes.json());
      if (accRes.ok) {
        const accounts: ManagerAccount[] = await accRes.json();
        setManagerAccounts(accounts);
        if (accounts.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accounts[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleCopyAccount = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const uploadScreenshot = async (file: File): Promise<string> => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    const res = await fetch(`${API_URL}/upload/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
      body: JSON.stringify({ filename: file.name, contentType: file.type || 'image/jpeg' }),
    });
    if (!res.ok) throw new Error('Could not get upload URL');
    const { uploadUrl, publicUrl } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file,
    });
    if (!uploadRes.ok) throw new Error('Screenshot upload failed');
    return publicUrl;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshotFile(file);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError('');
    setTransferSuccess('');

    const amt = parseFloat(transferAmount);
    if (!amt || amt <= 0) {
      setTransferError('Please enter a valid amount.');
      return;
    }
    if (!selectedAccountId) {
      setTransferError('Please select a manager receiving account.');
      return;
    }
    if (!screenshotFile) {
      setTransferError('Please attach your payment screenshot receipt.');
      return;
    }

    setUploadingTransfer(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const screenshotUrl = await uploadScreenshot(screenshotFile);

      const res = await fetch(`${API_URL}/admin/worker-transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify({
          manager_account_id: selectedAccountId,
          amount: amt,
          screenshot_url: screenshotUrl,
          note: transferNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setTransferError(data.error || 'Failed to submit transfer.');
        return;
      }

      setTransferSuccess('Transfer submitted! Admin will verify and approve your transfer.');
      setTransferAmount('');
      setTransferNote('');
      setScreenshotFile(null);
      setScreenshotPreview(null);

      setTimeout(() => {
        setShowTransferForm(false);
        setTransferSuccess('');
        openBalanceModal();
      }, 1500);
    } catch (err: any) {
      setTransferError(err.message || 'Error uploading transfer.');
    } finally {
      setUploadingTransfer(false);
    }
  };

  const fetchDepositMethods = async () => {
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/deposit/methods`, {
        headers: { 'x-telegram-init-data': initData }
      });
      if (res.ok) {
        const data = await res.json();
        setDepositMethods(data || []);
        if (data && data.length > 0 && !manualMethodId) {
          setManualMethodId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load deposit methods:', e);
    }
  };

  useEffect(() => {
    if (!showDirectDepositModal) return;
    const q = userSearchQuery.trim();
    if (!q) {
      setUserSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const res = await fetch(`${API_URL}/admin/worker-deposits/search-users?q=${encodeURIComponent(q)}`, {
          headers: { 'x-telegram-init-data': initData }
        });
        if (res.ok) {
          const data = await res.json();
          setUserSearchResults(data.users || []);
        }
      } catch (e) {
        console.error('Failed to search users:', e);
      } finally {
        setSearchingUsers(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [userSearchQuery, showDirectDepositModal]);

  const compressManualImage = (fileToCompress: File): Promise<{ blob: Blob; base64: string }> => {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(fileToCompress);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1280;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () => resolve({ blob: fileToCompress, base64: reader.result as string });
          reader.readAsDataURL(fileToCompress);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const quality = 0.78;
        const base64 = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(
          (blob) => {
            resolve({ blob: blob || fileToCompress, base64 });
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        const reader = new FileReader();
        reader.onload = () => resolve({ blob: fileToCompress, base64: reader.result as string });
        reader.readAsDataURL(fileToCompress);
      };
      img.src = objectUrl;
    });
  };

  const uploadManualScreenshot = async (fileToUpload: File): Promise<string> => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (initData) authHeaders['x-telegram-init-data'] = initData;

    const { blob, base64 } = await compressManualImage(fileToUpload).catch(() => ({ blob: fileToUpload, base64: '' }));

    // Direct upload first
    try {
      if (base64) {
        const directRes = await fetch(`${API_URL}/upload/direct`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            filename: fileToUpload.name.replace(/\.[^/.]+$/, '') + '.jpg',
            contentType: 'image/jpeg',
            fileBase64: base64,
          }),
        });
        if (directRes.ok) {
          const dData = await directRes.json();
          if (dData.publicUrl || dData.url) return dData.publicUrl || dData.url;
        }
      }
    } catch (e) {
      console.warn('Direct upload fallback:', e);
    }

    // Presign fallback
    const res = await fetch(`${API_URL}/upload/presign`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ filename: fileToUpload.name, contentType: 'image/jpeg' }),
    });
    if (!res.ok) throw new Error('Could not get upload link');
    const { uploadUrl, publicUrl } = await res.json();
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (!putRes.ok) throw new Error('Upload to storage failed');
    return publicUrl;
  };

  const handleManualFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setManualScreenshotFile(file);
      setManualScreenshotPreview(URL.createObjectURL(file));
    }
  };

  const handleManualDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualErrorMsg(null);
    setManualSuccessMsg(null);

    if (!selectedUser) {
      setManualErrorMsg('እባክዎ መጀመሪያ ተጠቃሚ ይምረጡ / Please select a user first.');
      return;
    }

    const amt = parseFloat(manualAmount);
    if (isNaN(amt) || amt <= 0) {
      setManualErrorMsg('እባክዎ ትክክለኛ የብር መጠን ያስገቡ / Please enter a valid deposit amount.');
      return;
    }

    const cleanFt = manualFtNumber.trim();
    if (!cleanFt && !manualScreenshotFile) {
      setManualErrorMsg('እባክዎ የደረሰኝ ስክሪንሾት ያያይዙ ወይም የ FT/SMS ቁጥር ያስገቡ / Please provide a receipt screenshot OR FT reference number.');
      return;
    }

    setManualSubmitting(true);
    try {
      let uploadedUrl = '';
      if (manualScreenshotFile) {
        uploadedUrl = await uploadManualScreenshot(manualScreenshotFile);
      }

      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/admin/worker-deposits/create-and-approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({
          telegram_id: selectedUser.telegram_id,
          amount: amt,
          method_id: manualMethodId || undefined,
          screenshot_url: uploadedUrl || undefined,
          ft_number: cleanFt || undefined,
          note: manualNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to credit deposit.');
      }

      const newBal = data.user?.main_balance ?? (Number(selectedUser.main_balance || 0) + amt);
      setManualSuccessMsg(`✅ ተቀማጩ በተሳካ ሁኔታ ጸድቆ ገቢ ሆኗል! ${amt.toLocaleString()} ETB for ${selectedUser.first_name || selectedUser.username}. New balance: ${newBal.toLocaleString()} ETB.`);

      // Update local balance of selectedUser for immediate visual feedback
      setSelectedUser((prev: any) => prev ? { ...prev, main_balance: newBal } : null);

      setTimeout(() => {
        setSelectedUser(null);
        setUserSearchQuery('');
        setManualAmount('');
        setManualFtNumber('');
        setManualScreenshotFile(null);
        setManualScreenshotPreview(null);
        setManualNote('');
        fetchPendingCounts();
        applyPreset(activePreset);
      }, 2500);
    } catch (err: any) {
      setManualErrorMsg(err.message || 'Deposit verification failed');
    } finally {
      setManualSubmitting(false);
    }
  };

  useEffect(() => {
    applyPreset('Today');
    fetchPendingCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user || user.role !== 'worker') {
    return <Navigate to="/" replace />;
  }

  const perms = user.permissions || {};
  const selectedAccount = managerAccounts.find(a => a.id === selectedAccountId);
  const workerTransfers = balanceData?.transfers || [];
  const manualReductions = balanceData?.reductions || [];
  const totalHistoryCount = workerTransfers.length + manualReductions.length;

  return (
    <>
    <div className="min-h-screen bg-slate-50 flex flex-col pb-36">
      {/* Header */}
      <div className="bg-orange-600 text-white px-4 py-6 rounded-b-[2rem] shadow-md relative z-10 shrink-0">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-black">Worker Profile</h1>
            <p className="text-orange-200 text-sm font-medium mt-1">
              Welcome back, {user.first_name}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/admin/deposits"
              className={`flex items-center p-3 rounded-2xl transition-all shadow-sm ${perms.deposits ? 'bg-white text-emerald-700 active:scale-95' : 'bg-white/20 text-white/50 pointer-events-none'}`}
            >
              <div className={`p-2 rounded-xl mr-3 ${perms.deposits ? 'bg-emerald-100' : 'bg-white/10'}`}>
                <ArrowDownToLine size={20} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm leading-tight">Verify</p>
                <p className={`text-[11px] ${perms.deposits ? 'text-emerald-600/70' : 'text-white/40'}`}>Deposits</p>
              </div>
              {pendingDeposits > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                  {pendingDeposits}
                </span>
              )}
            </Link>

            <Link
              to="/admin/withdrawals"
              className={`flex items-center p-3 rounded-2xl transition-all shadow-sm ${perms.withdrawals ? 'bg-white text-rose-700 active:scale-95' : 'bg-white/20 text-white/50 pointer-events-none'}`}
            >
              <div className={`p-2 rounded-xl mr-3 ${perms.withdrawals ? 'bg-rose-100' : 'bg-white/10'}`}>
                <ArrowUpFromLine size={20} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm leading-tight">Verify</p>
                <p className={`text-[11px] ${perms.withdrawals ? 'text-rose-600/70' : 'text-white/40'}`}>Withdrawals</p>
              </div>
              {pendingWithdrawals > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                  {pendingWithdrawals}
                </span>
              )}
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setShowDirectDepositModal(true); fetchDepositMethods(); }}
              className={`flex items-center p-3 rounded-2xl transition-all shadow-sm ${perms.deposits ? 'bg-white text-emerald-800 hover:bg-emerald-50 active:scale-95' : 'bg-white/20 text-white/50 pointer-events-none'}`}
            >
              <div className={`p-2 rounded-xl mr-2.5 ${perms.deposits ? 'bg-emerald-100 text-emerald-700' : 'bg-white/10 text-white/40'}`}>
                <PlusCircle size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="font-black text-xs leading-tight">Direct Deposit</p>
                <p className={`text-[10px] font-bold ${perms.deposits ? 'text-emerald-600/80' : 'text-white/40'}`}>ተቀማጭ መዝግብ</p>
              </div>
            </button>

            <button
              type="button"
              onClick={openBalanceModal}
              className="flex items-center p-3 rounded-2xl transition-all shadow-sm bg-black/25 hover:bg-black/35 text-white active:scale-95 border border-white/20"
            >
              <div className="p-2 rounded-xl mr-2.5 bg-white/20 text-orange-200">
                <Scan size={20} className="animate-pulse" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-black text-xs leading-tight">Scan Net Profit</p>
                <p className="text-[10px] font-bold text-orange-100/80">ትርፍና ሂሳብ ፈትሽ</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 -mt-2 relative z-0">

        {/* Report Header */}
        <div className="flex items-center justify-between mb-4 mt-2">
          <h2 className="font-black text-slate-800 text-lg flex items-center space-x-2">
            <TrendingUp size={20} className="text-orange-500" />
            <span>Profit Report</span>
          </h2>
          <div className="flex items-center space-x-2">
            {loading && <RefreshCw size={16} className="text-slate-400 animate-spin" />}
            <button
              onClick={() => { setShowCustom(v => !v); setActivePreset('Custom'); }}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-[11px] font-black border transition-all ${
                activePreset === 'Custom'
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              <Calendar size={12} />
              <span>Custom</span>
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {showCustom && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4">
            <p className="text-xs font-bold text-slate-600 mb-3">Select Date Range</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 mb-1 block">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 mb-1 block">To</label>
                <input
                  type="date"
                  value={customTo}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <button
              onClick={applyCustomRange}
              disabled={!customFrom || !customTo}
              className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-black text-sm disabled:opacity-40 flex items-center justify-center space-x-2 active:scale-95 transition-transform"
            >
              <Search size={14} />
              <span>Generate Report</span>
            </button>
          </div>
        )}

        {/* Preset Buttons */}
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 pb-2 mb-4 snap-x">
          {['Today', 'Yesterday', '7 Days', '1 Month', '3 Months', '6 Months', '1 Year', 'All Time'].map(preset => (
            <button
              key={preset}
              onClick={() => applyPreset(preset)}
              className={`snap-start whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-bold transition-all ${
                activePreset === preset
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* ── REDESIGNED FINANCIAL ANALYTICS & PROFIT REPORT ── */}
        <div className="space-y-4 mb-6">
          {/* 1. Hero Net Profit Spotlight Card */}
          <div className={`rounded-3xl p-5 text-white shadow-md transition-all relative overflow-hidden ${
            stats.netProfit >= 0
              ? 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 shadow-emerald-500/20'
              : 'bg-gradient-to-br from-rose-600 via-red-600 to-rose-700 shadow-rose-500/20'
          }`}>
            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                  <TrendingUp size={18} className="text-white" />
                </div>
                <span className="text-xs font-bold text-white/90">
                  Net Period Profit
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={openBalanceModal}
                  className="flex items-center space-x-1.5 bg-black/30 hover:bg-black/40 active:scale-95 px-3 py-1.5 rounded-full text-white text-[11px] font-black border border-white/25 shadow-sm transition-all"
                  title="Click scan to view net profit & balance breakdown"
                >
                  <Scan size={14} className="text-emerald-300 animate-pulse" />
                  <span>Scan Net</span>
                </button>
                <span className="text-[10px] font-bold bg-white/20 px-2.5 py-1 rounded-full text-white backdrop-blur-xs">
                  {stats.netProfit >= 0 ? 'Profitable' : 'Deficit'}
                </span>
              </div>
            </div>

            <div className="pt-2 relative z-10">
              <p className="text-3xl font-black tracking-tight leading-none">
                {stats.netProfit >= 0 ? '+' : ''}{fmtAmt(stats.netProfit)}{' '}
                <span className="text-base font-bold text-white/80">ETB</span>
              </p>
              <div className="flex items-center gap-1.5 text-xs text-white/90 font-bold mt-2">
                {profitMargin >= 0 ? (
                  <span className="flex items-center gap-0.5 bg-white/20 px-2 py-0.5 rounded-lg text-[11px] font-bold">
                    <ArrowUpRight size={13} /> {profitMargin}%
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 bg-white/20 px-2 py-0.5 rounded-lg text-[11px] font-bold">
                    <ArrowDownRight size={13} /> {profitMargin}%
                  </span>
                )}
                <span className="text-white/75 text-[11px]">net margin of gross deposits</span>
              </div>
            </div>

            {/* Inflow vs Outflow Cash Ratio Progress Bar */}
            <div className="pt-3.5 mt-3 border-t border-white/20 space-y-1.5 relative z-10">
              <div className="flex justify-between items-center text-[10px] font-semibold text-white/90">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-300" />
                  Inflow: {depositPct}%
                </span>
                <span className="flex items-center gap-1">
                  Outflow: {withdrawalPct}%
                  <span className="w-2 h-2 rounded-full bg-rose-300" />
                </span>
              </div>
              <div className="h-2 w-full bg-black/25 rounded-full overflow-hidden flex p-0.5">
                <div style={{ width: `${depositPct}%` }} className="bg-emerald-300 h-full rounded-l-full transition-all duration-500" />
                <div style={{ width: `${withdrawalPct}%` }} className="bg-rose-300 h-full rounded-r-full transition-all duration-500" />
              </div>
            </div>

            {/* Click scan icon to view net profit and remaining balance */}
            <button
              type="button"
              onClick={openBalanceModal}
              className="w-full mt-3.5 py-2.5 px-3.5 rounded-2xl bg-black/25 hover:bg-black/35 active:scale-98 transition-all flex items-center justify-between text-xs font-black text-white border border-white/20 shadow-sm"
            >
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 rounded-xl bg-white/20 text-emerald-300 shadow-xs">
                  <Scan size={16} />
                </div>
                <div className="text-left">
                  <span className="block leading-tight font-black">Scan Net Remaining Balance Audit</span>
                  <span className="text-[10px] text-white/75 font-semibold">View gross receipts, reductions & worker transfers</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-white/60 shrink-0" />
            </button>
          </div>

          {/* 2. Dual Inflow (Deposits) & Outflow (Withdrawals) Cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* Total Deposits Card */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <ArrowDownToLine size={20} />
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  Inflow
                </span>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400">Total Deposits</p>
                <p className="text-lg font-black text-slate-900 leading-tight mt-0.5">
                  {fmtAmt(stats.totalDeposits)} <span className="text-[10px] font-bold text-slate-400">ETB</span>
                </p>
                <p className="text-[10px] text-slate-400 font-semibold mt-1">
                  {stats.depositCount !== undefined ? `${stats.depositCount} txs approved` : 'All approved txs'}
                </p>
              </div>
            </div>

            {/* Total Withdrawals Card */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <ArrowUpFromLine size={20} />
                </div>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                  Outflow
                </span>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400">Total Withdrawals</p>
                <p className="text-lg font-black text-slate-900 leading-tight mt-0.5">
                  {fmtAmt(stats.totalWithdrawals)} <span className="text-[10px] font-bold text-slate-400">ETB</span>
                </p>
                <p className="text-[10px] text-slate-400 font-semibold mt-1">
                  {stats.withdrawalCount !== undefined ? `${stats.withdrawalCount} txs paid` : 'All approved payouts'}
                </p>
              </div>
            </div>
          </div>

          {/* 3. Interactive Analytical Bar & Trend Chart */}
          <div className="bg-white rounded-3xl p-4.5 border border-slate-100 shadow-sm space-y-3.5">
            {/* Chart Header */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-1.5 text-slate-800">
                  <Activity size={16} className="text-orange-500" />
                  <h3 className="text-xs font-bold text-slate-800">
                    Financial Flow Trends
                  </h3>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">Daily Inflow, Outflow & Profit Activity</p>
              </div>

              {chartData.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    setShowTableView(!showTableView);
                  }}
                  className={`flex items-center space-x-1 text-[10px] font-bold px-2.5 py-1 rounded-xl border transition-all ${
                    showTableView
                      ? 'bg-orange-50 text-orange-600 border-orange-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Table size={12} />
                  <span>{showTableView ? 'Chart' : 'Table'}</span>
                </button>
              )}
            </div>

            {/* Metric Selector 3-pill toggle */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl text-[10px] font-bold">
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setChartMetric('profit');
                }}
                className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                  chartMetric === 'profit'
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp size={12} />
                <span>Net Profit</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setChartMetric('deposits');
                }}
                className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                  chartMetric === 'deposits'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowDownToLine size={12} />
                <span>Deposits</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setChartMetric('withdrawals');
                }}
                className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1 ${
                  chartMetric === 'withdrawals'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowUpFromLine size={12} />
                <span>Withdrawals</span>
              </button>
            </div>

            {!showTableView ? (
              <>
                {/* Bars Container */}
                <div className="pt-2">
                  <div className="h-36 flex items-end justify-between space-x-1.5 px-0.5">
                    {chartData.length === 0 ? (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">
                        No financial records for this period
                      </div>
                    ) : (
                      chartData.map((d, idx) => {
                        const val =
                          chartMetric === 'deposits'
                            ? d.deposits
                            : chartMetric === 'withdrawals'
                            ? d.withdrawals
                            : d.net_profit;

                        const isPositive = val >= 0;
                        const absVal = Math.abs(val);
                        const heightPercent = maxChartValue > 0 ? Math.max(10, Math.round((absVal / maxChartValue) * 100)) : 10;
                        const isSelected = selectedDayIdx === idx;

                        return (
                          <div
                            key={d.date}
                            onClick={() => {
                              haptic('light');
                              setSelectedDayIdx(idx);
                            }}
                            className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                          >
                            {/* Tooltip Value */}
                            <span
                              className={`text-[8px] font-bold mb-1 transition-all ${
                                isSelected
                                  ? 'text-slate-900 scale-110'
                                  : 'text-slate-400 opacity-70 group-hover:opacity-100'
                              }`}
                            >
                              {val === 0 ? '0' : (chartMetric === 'profit' ? (isPositive ? `+${fmtCompact(val)}` : `-${fmtCompact(absVal)}`) : fmtCompact(val))}
                            </span>

                            {/* Bar Pillar */}
                            <div className="w-full max-w-[28px] bg-slate-100 rounded-xl overflow-hidden flex flex-col justify-end h-[100px] p-0.5">
                              <div
                                style={{ height: `${heightPercent}%` }}
                                className={`w-full rounded-lg transition-all duration-300 ${
                                  chartMetric === 'deposits'
                                    ? isSelected
                                      ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-xs'
                                      : 'bg-gradient-to-t from-emerald-400 to-teal-300 group-hover:from-emerald-500 group-hover:to-teal-400'
                                    : chartMetric === 'withdrawals'
                                    ? isSelected
                                      ? 'bg-gradient-to-t from-rose-600 to-red-400 shadow-xs'
                                      : 'bg-gradient-to-t from-rose-400 to-red-300 group-hover:from-rose-500 group-hover:to-red-400'
                                    : isPositive
                                    ? isSelected
                                      ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-xs'
                                      : 'bg-gradient-to-t from-emerald-400 to-teal-300 group-hover:from-emerald-500 group-hover:to-teal-400'
                                    : isSelected
                                    ? 'bg-gradient-to-t from-rose-600 to-red-400 shadow-xs'
                                    : 'bg-gradient-to-t from-rose-400 to-red-300 group-hover:from-rose-500 group-hover:to-red-400'
                                }`}
                              />
                            </div>

                            {/* Day Label on X Axis */}
                            <span
                              className={`text-[9px] mt-1.5 font-bold transition-colors ${
                                isSelected ? 'text-orange-600' : 'text-slate-400'
                              }`}
                            >
                              {d.label}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Selected Day Details Strip */}
                {selectedDay && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between text-xs animate-in fade-in">
                    <div className="flex items-center space-x-2">
                      <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs">
                        {selectedDay.label}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 leading-none">
                          {selectedDay.date}
                        </p>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-[10px] font-bold text-emerald-600">
                            +{fmtAmt(selectedDay.deposits)} ETB
                          </span>
                          <span className="text-[10px] text-slate-300">•</span>
                          <span className="text-[10px] font-bold text-rose-600">
                            -{fmtAmt(selectedDay.withdrawals)} ETB
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-slate-400 leading-none">Day Profit</p>
                      <p className={`text-xs font-black mt-0.5 ${
                        selectedDay.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {selectedDay.net_profit >= 0 ? '+' : ''}{fmtAmt(selectedDay.net_profit)} ETB
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Tabular View */
              <div className="overflow-x-auto pt-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-2.5 py-2 text-left text-[10px] font-bold text-slate-500 whitespace-nowrap">Date</th>
                      <th className="px-2.5 py-2 text-right text-[10px] font-bold text-emerald-600 whitespace-nowrap">Deposits</th>
                      <th className="px-2.5 py-2 text-right text-[10px] font-bold text-rose-600 whitespace-nowrap">Withdrawals</th>
                      <th className="px-2.5 py-2 text-right text-[10px] font-bold text-slate-700 whitespace-nowrap">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((d, i) => (
                      <tr key={d.date} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="px-2.5 py-2 font-bold text-slate-700 whitespace-nowrap">
                          {d.date} <span className="text-[9px] text-slate-400 font-semibold">({d.label})</span>
                        </td>
                        <td className="px-2.5 py-2 text-right font-bold text-emerald-600 whitespace-nowrap">
                          +{fmtAmt(d.deposits)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-bold text-rose-600 whitespace-nowrap">
                          -{fmtAmt(d.withdrawals)}
                        </td>
                        <td className={`px-2.5 py-2 text-right font-black whitespace-nowrap ${
                          d.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {d.net_profit >= 0 ? '+' : ''}{fmtAmt(d.net_profit)} ETB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Period Summary Strip */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-center">
              <div className="bg-slate-50/80 p-2.5 rounded-xl">
                <span className="text-[9px] text-slate-400 font-semibold">Avg Daily Inflow:</span>{' '}
                <span className="text-xs font-black text-emerald-600">
                  +{fmtAmt(chartData.length > 0 ? Math.round(depositVolume / chartData.length) : 0)} ETB
                </span>
              </div>
              <div className="bg-slate-50/80 p-2.5 rounded-xl">
                <span className="text-[9px] text-slate-400 font-semibold">Period Net Flow:</span>{' '}
                <span className={`text-xs font-black ${
                  stats.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {stats.netProfit >= 0 ? '+' : ''}{fmtAmt(stats.netProfit)} ETB
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

      {/* ── Fixed Bottom Floating Circular Black Fingerprint Button ── */}
      <div className="fixed bottom-1 left-0 right-0 flex items-center justify-center z-40 pointer-events-none">
        <div className="relative flex items-center justify-center pointer-events-auto">
          <div className="absolute w-22 h-22 rounded-full bg-slate-800/20 animate-ping pointer-events-none" />
          <div className="p-1 rounded-full bg-gradient-to-b from-slate-600 via-slate-800 to-black shadow-xl shadow-black/60 border border-slate-600/40">
            <button
              onClick={openBalanceModal}
              className="w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-gradient-to-br from-slate-900 via-zinc-950 to-black hover:from-slate-800 hover:to-zinc-900 active:scale-90 transition-all flex items-center justify-center text-white shadow-2xl border-2 border-slate-500/40 group relative overflow-hidden"
              title="View Net Remaining Balance"
            >
              <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/15 rounded-t-full pointer-events-none" />
              <Fingerprint size={42} className="text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.45)] group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Net Balance Modal (Fingerprint) ───────────────────────────── */}
      {showBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowBalanceModal(false)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl shadow-2xl pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center space-x-2">
                {showTransferForm ? (
                  <button onClick={() => setShowTransferForm(false)} className="p-1 rounded-xl hover:bg-slate-100 mr-1 text-slate-600">
                    <ArrowLeft size={20} />
                  </button>
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                    <Fingerprint size={20} />
                  </div>
                )}
                <h2 className="text-lg font-black text-slate-800">
                  {showTransferForm ? 'Transfer to Manager' : 'Net Remaining Balance'}
                </h2>
              </div>
              <button onClick={() => setShowBalanceModal(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
                <X size={18} />
              </button>
            </div>

            {balanceLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
              </div>
            ) : balanceData ? (
              <div className="px-5 pt-5 space-y-4">

                {showTransferForm ? (
                  /* ── TRANSFER FORM VIEW ────────────────────────────── */
                  <form onSubmit={handleTransferSubmit} className="space-y-4">
                    {transferError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-600">
                        {transferError}
                      </div>
                    )}
                    {transferSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-700 flex items-center space-x-2">
                        <CheckCircle2 size={16} />
                        <span>{transferSuccess}</span>
                      </div>
                    )}

                    {/* Balance Preview */}
                    <div className="p-3 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-bold">Current Net Balance:</span>
                      <span className="text-sm font-black text-emerald-400">
                        {balanceData.netRemaining.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                      </span>
                    </div>

                    {/* Select Manager Account */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1.5">
                        Select Manager Account
                      </label>
                      {managerAccounts.length === 0 ? (
                        <p className="text-xs text-amber-600 font-bold bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
                          No manager accounts configured yet. Contact admin.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {/* Attractive Mobile-First Dropdown Trigger Button */}
                          <button
                            type="button"
                            onClick={() => setShowAccountModal(true)}
                            className="w-full flex items-center justify-between p-3.5 bg-slate-50 border-2 border-slate-200 hover:border-emerald-500 rounded-2xl active:scale-[0.99] transition-all shadow-sm"
                          >
                            <div className="flex items-center space-x-3 text-left">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-sm shrink-0 ${
                                selectedAccount?.bank_type === 'telebirr' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                                selectedAccount?.bank_type === 'cbe' ? 'bg-gradient-to-br from-amber-500 to-orange-600' :
                                selectedAccount?.bank_type === 'boa' ? 'bg-gradient-to-br from-blue-600 to-indigo-700' :
                                'bg-slate-700'
                              }`}>
                                {selectedAccount?.bank_type === 'telebirr' ? 'TB' :
                                 selectedAccount?.bank_type === 'cbe' ? 'CBE' :
                                 selectedAccount?.bank_type === 'boa' ? 'BOA' : 'Bank'}
                              </div>
                              <div>
                                <span className="font-bold text-sm text-slate-900 block leading-tight">
                                  {selectedAccount ? (BANK_NAMES[selectedAccount.bank_type] || selectedAccount.bank_type) : 'Select Payment Method'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">
                                  Tap to choose payment method
                                </span>
                              </div>
                            </div>
                            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                              <ChevronDown size={18} />
                            </div>
                          </button>

                          {/* Quick-Select Pills for 1-Tap Switching */}
                          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                            {managerAccounts.map(acc => {
                              const isSelected = selectedAccountId === acc.id;
                              const shortName = acc.bank_type === 'telebirr' ? 'Telebirr' :
                                                acc.bank_type === 'cbe' ? 'Commercial Bank (CBE)' :
                                                acc.bank_type === 'boa' ? 'Bank of Abyssinia (BOA)' :
                                                acc.bank_type.toUpperCase();
                              return (
                                <button
                                  key={acc.id}
                                  type="button"
                                  onClick={() => setSelectedAccountId(acc.id)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 shrink-0 ${
                                    isSelected
                                      ? 'bg-slate-900 text-emerald-400 border border-emerald-500 shadow-sm'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                                  }`}
                                >
                                  <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                                  <span>{shortName}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Selected Account Details & Copy Box */}
                    {selectedAccount && (
                      <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-1">
                        <div className="flex items-center justify-between text-amber-800 font-bold">
                          <span>{selectedAccount.account_name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 font-bold">
                            {selectedAccount.bank_type.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="font-mono text-sm font-black text-slate-900">{selectedAccount.account_number}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyAccount(selectedAccount.account_number)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 font-bold text-[10px] flex items-center space-x-1 active:scale-95 transition-all shadow-sm"
                          >
                            {copiedAccount ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            <span>{copiedAccount ? 'Copied!' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Amount Input */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-500">Transfer Amount (ETB)</label>
                        <button
                          type="button"
                          onClick={() => setTransferAmount(String(Math.max(0, balanceData.netRemaining)))}
                          className="text-[11px] font-black text-emerald-600 hover:underline"
                        >
                          Transfer All
                        </button>
                      </div>
                      <input
                        type="number"
                        value={transferAmount}
                        onChange={e => setTransferAmount(e.target.value)}
                        placeholder="0.00"
                        min="1"
                        step="0.01"
                        max={balanceData.netRemaining > 0 ? balanceData.netRemaining : undefined}
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-base font-black text-slate-900 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    {/* Screenshot Upload */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">
                        Payment Screenshot / Receipt
                      </label>
                      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:bg-slate-50 active:scale-98 transition-all">
                        {screenshotPreview ? (
                          <div className="relative">
                            <img src={screenshotPreview} alt="Receipt preview" className="w-24 h-24 object-cover rounded-xl shadow-md border" />
                            <span className="text-[10px] text-emerald-600 font-black block text-center mt-1">Tap to change</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-slate-400">
                            <UploadCloud size={28} className="mb-1 text-slate-400" />
                            <span className="text-xs font-bold text-slate-600">Tap to upload receipt image</span>
                            <span className="text-[10px] text-slate-400">JPG, PNG, WebP</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                      </label>
                    </div>

                    {/* Optional Note */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Note (Optional)</label>
                      <input
                        type="text"
                        value={transferNote}
                        onChange={e => setTransferNote(e.target.value)}
                        placeholder="e.g. End of day balance payout"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingTransfer || managerAccounts.length === 0}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-sm active:scale-95 transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                    >
                      {uploadingTransfer ? 'Submitting Transfer...' : '🚀 Submit Transfer to Manager'}
                    </button>
                  </form>
                ) : (
                  /* ── BALANCE & HISTORY VIEW ─────────────────────────── */
                  <>
                    {/* Balance Card */}
                    <div className={`rounded-3xl p-6 text-center shadow-2xl relative overflow-hidden border ${
                      balanceData.netRemaining >= 0
                        ? 'bg-gradient-to-br from-slate-950 via-zinc-900 to-black text-white border-slate-700/60 shadow-black/40'
                        : 'bg-gradient-to-br from-rose-950 via-red-950 to-black text-white border-rose-800/60 shadow-rose-950/40'
                    }`}>
                      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner">
                        <Fingerprint size={32} />
                      </div>
                      <p className="text-slate-400 text-[11px] font-bold mb-1">Live Net Remaining Balance</p>
                      <p className="text-4xl font-black text-white tracking-tight">
                        {balanceData.netRemaining >= 0 ? '+' : ''}
                        {balanceData.netRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white/10 text-xs font-black text-emerald-400 border border-emerald-400/30 backdrop-blur-sm">
                        ETB
                      </span>
                      <p className="text-slate-400 text-[11px] font-medium mt-3 border-t border-slate-800 pt-2">
                        Total profit minus approved manager payouts
                      </p>
                    </div>

                    {/* Transfer to Manager Action Button */}
                    <button
                      onClick={() => setShowTransferForm(true)}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white font-black text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/25 active:scale-95 transition-all"
                    >
                      <Send size={18} />
                      <span>Transfer to Manager</span>
                    </button>

                    {/* History Section Toggle */}
                    <button
                      onClick={() => setShowBalanceHistory(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200/80"
                    >
                      <div className="flex items-center space-x-2">
                        <Clock size={16} className="text-slate-600" />
                        <span className="font-black text-slate-800 text-sm">Transfer & Deduction History</span>
                        <span className="bg-slate-200 text-slate-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                          {totalHistoryCount}
                        </span>
                      </div>
                      {showBalanceHistory ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    </button>

                    {showBalanceHistory && (
                      <div className="space-y-2">
                        {totalHistoryCount === 0 ? (
                          <div className="py-8 text-center text-slate-400 bg-slate-50 rounded-2xl border">
                            <p className="text-xs font-bold text-slate-600">No Transfer History</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Use "Transfer to Manager" above to payout balance.</p>
                          </div>
                        ) : (
                          <>
                            {/* Worker Transfers List */}
                            {workerTransfers.map(tr => (
                              <div key={tr.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-800">
                                      {tr.bank_type}
                                    </span>
                                    <span className="text-xs font-bold text-slate-800">{tr.account_name}</span>
                                  </div>
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    tr.status === 'approved' 
                                      ? 'bg-emerald-100 text-emerald-700' 
                                      : tr.status === 'rejected'
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-amber-100 text-amber-700 animate-pulse'
                                  }`}>
                                    {tr.status === 'approved' ? '✅ Approved' : tr.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between">
                                  <p className="font-black text-base text-slate-900">
                                    -{tr.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                                  </p>
                                  {tr.screenshot_url && (
                                    <button
                                      type="button"
                                      onClick={() => setReceiptPreview(tr.screenshot_url)}
                                      className="text-xs text-blue-600 font-bold flex items-center space-x-1 hover:underline"
                                    >
                                      <Eye size={12} />
                                      <span>Receipt</span>
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200">
                                  <span>{tr.note || 'Transfer to Manager'}</span>
                                  <span>{new Date(tr.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                            ))}

                            {/* Manual reductions (legacy) */}
                            {manualReductions.map(r => (
                              <div key={r.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                                <div>
                                  <p className="font-black text-slate-900 text-sm">
                                    -{r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                                  </p>
                                  <p className="text-[10px] text-slate-500">{r.note || 'Manual Reduction'} • by {r.reduced_by}</p>
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(r.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}

              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 font-semibold">Failed to load balance.</div>
            )}
          </div>
        </div>
      )}

      {/* ── SELECT MANAGER ACCOUNT MODAL (Mobile-Screen First) ──────── */}
      {showAccountModal && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowAccountModal(false)}
        >
          <div 
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer top bar */}
            <div className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto -mt-1" />
            
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Select Manager Account</h3>
                <p className="text-[11px] text-slate-400 font-bold">Choose payment method to send net balance</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 pt-1">
              {managerAccounts.map(acc => {
                const isSelected = selectedAccountId === acc.id;
                const bankName = BANK_NAMES[acc.bank_type] || acc.bank_type.toUpperCase();
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setSelectedAccountId(acc.id);
                      setShowAccountModal(false);
                    }}
                    className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between text-left transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-sm'
                        : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3.5">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-sm shrink-0 ${
                        acc.bank_type === 'telebirr' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                        acc.bank_type === 'cbe' ? 'bg-gradient-to-br from-amber-500 to-orange-600' :
                        acc.bank_type === 'boa' ? 'bg-gradient-to-br from-blue-600 to-indigo-700' :
                        'bg-slate-700'
                      }`}>
                        {acc.bank_type === 'telebirr' ? 'TB' :
                         acc.bank_type === 'cbe' ? 'CBE' :
                         acc.bank_type === 'boa' ? 'BOA' : 'BANK'}
                      </div>
                      <div>
                        <span className="font-black text-slate-900 text-sm block">
                          {bankName}
                        </span>
                        <span className="text-[11px] text-slate-500 font-bold">
                          Official Manager Account
                        </span>
                      </div>
                    </div>

                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0">
                        <Check size={14} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── RECEIPT PREVIEW MODAL ────────────────────────────────────── */}
      {receiptPreview && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setReceiptPreview(null)}
        >
          <div className="relative max-w-sm w-full bg-slate-900 rounded-3xl p-3 border border-slate-700 shadow-2xl">
            <button 
              onClick={() => setReceiptPreview(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center border border-slate-600 shadow-lg"
            >
              <X size={16} />
            </button>
            <img 
              src={receiptPreview} 
              alt="Receipt Preview" 
              className="w-full max-h-[80vh] object-contain rounded-2xl" 
            />
          </div>
        </div>
      )}

      {/* ── DIRECT DEPOSIT (MANUAL CREDIT) MODAL ──────────────────────── */}
      {showDirectDepositModal && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!manualSubmitting) {
              setShowDirectDepositModal(false);
              setManualSuccessMsg(null);
              setManualErrorMsg(null);
            }
          }}
        >
          <div 
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer top bar handle */}
            <div className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto -mt-1 sm:hidden" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md">
                  <PlusCircle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    Direct Deposit / ተቀማጭ መዝግብ
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Credit user with screenshot or FT code
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!manualSubmitting) {
                    setShowDirectDepositModal(false);
                    setManualSuccessMsg(null);
                    setManualErrorMsg(null);
                  }
                }}
                disabled={manualSubmitting}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            {/* Success message banner */}
            {manualSuccessMsg && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start space-x-2.5 text-emerald-800 text-xs font-bold animate-in fade-in">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-black text-emerald-900">Deposit Approved & Credited!</p>
                  <p className="mt-0.5 leading-snug">{manualSuccessMsg}</p>
                </div>
              </div>
            )}

            {/* Error message banner */}
            {manualErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-2 text-rose-700 text-xs font-bold">
                <XCircle size={18} className="text-rose-500 shrink-0" />
                <span>{manualErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleManualDepositSubmit} className="space-y-4">
              {/* Step 1: User selection */}
              <div>
                <label className="text-xs font-black text-slate-700 flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <User size={14} className="text-emerald-600" />
                    <span>1. Select User (ተጠቃሚ ምረጥ)</span>
                  </span>
                  {selectedUser && (
                    <button
                      type="button"
                      onClick={() => setSelectedUser(null)}
                      className="text-[11px] text-orange-600 font-bold hover:underline"
                    >
                      Change User
                    </button>
                  )}
                </label>

                {!selectedUser ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={userSearchQuery}
                        onChange={e => setUserSearchQuery(e.target.value)}
                        placeholder="Search name, username, Telegram ID, or phone..."
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-2xl pl-10 pr-10 py-2.5 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none transition-colors"
                      />
                      {searchingUsers && (
                        <RefreshCw size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                      )}
                    </div>

                    {/* Search results list */}
                    {userSearchResults.length > 0 && (
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-lg">
                        {userSearchResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setSelectedUser(u);
                              setUserSearchQuery('');
                              setUserSearchResults([]);
                            }}
                            className="w-full p-2.5 flex items-center justify-between text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                                {(u.first_name || u.username || 'U')[0].toUpperCase()}
                              </div>
                              <div className="truncate">
                                <p className="font-black text-xs text-slate-800 truncate">
                                  {u.first_name || 'No Name'} {u.username ? <span className="text-slate-400 font-medium">(@{u.username})</span> : ''}
                                </p>
                                <p className="text-[10px] text-slate-400 font-semibold truncate">
                                  ID: <span className="text-slate-600">{u.telegram_id}</span>
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0 pl-2">
                              <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                {Number(u.main_balance || 0).toLocaleString()} ETB
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {userSearchQuery.trim() && !searchingUsers && userSearchResults.length === 0 && (
                      <p className="text-[11px] text-slate-400 text-center py-2 font-semibold">
                        No users found matching "{userSearchQuery}".
                      </p>
                    )}
                  </div>
                ) : (
                  /* Selected user display card */
                  <div className="p-3 rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                        {(selectedUser.first_name || selectedUser.username || 'U')[0].toUpperCase()}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center space-x-1.5">
                          <p className="font-black text-xs text-slate-900 truncate">
                            {selectedUser.first_name || 'No Name'}
                          </p>
                          {selectedUser.username && (
                            <span className="text-[11px] text-emerald-700 font-bold truncate">
                              @{selectedUser.username}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-semibold truncate">
                          ID: <span className="text-slate-700 font-mono">{selectedUser.telegram_id}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <p className="text-[10px] text-slate-400 font-bold">Current Bal</p>
                      <p className="text-xs font-black text-emerald-700">
                        {Number(selectedUser.main_balance || 0).toLocaleString()} ETB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Amount input */}
              <div>
                <label className="text-xs font-black text-slate-700 flex items-center gap-1.5 mb-1.5">
                  <Wallet size={14} className="text-emerald-600" />
                  <span>2. Deposit Amount (የብር መጠን)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={manualAmount}
                    onChange={e => setManualAmount(e.target.value)}
                    placeholder="Enter deposit amount (ETB)"
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-2xl px-4 py-2.5 text-base font-black text-slate-900 focus:outline-none transition-colors"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400">
                    ETB
                  </span>
                </div>

                {/* Quick amount chips */}
                <div className="flex items-center space-x-2 mt-2 overflow-x-auto hide-scrollbar pb-1">
                  {[50, 100, 200, 500, 1000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setManualAmount(String(val))}
                      className={`px-3 py-1 rounded-xl text-xs font-black border transition-all ${
                        manualAmount === String(val)
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 active:scale-95'
                      }`}
                    >
                      +{val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Deposit Method Selector */}
              <div>
                <label className="text-xs font-black text-slate-700 flex items-center gap-1.5 mb-1.5">
                  <Landmark size={14} className="text-emerald-600" />
                  <span>3. Payment Method (የክፍያ መንገድ)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {depositMethods.length > 0 ? (
                    depositMethods.map(m => {
                      const isSel = manualMethodId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setManualMethodId(m.id)}
                          className={`p-2.5 rounded-xl border text-left flex items-center space-x-2 transition-all ${
                            isSel
                              ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-black ring-1 ring-emerald-500'
                              : 'border-slate-200 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100'
                          }`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full border-2 border-emerald-600 flex items-center justify-center shrink-0">
                            {isSel && <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />}
                          </div>
                          <span className="text-xs truncate">{m.name}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="col-span-2 text-xs text-slate-400 font-semibold p-2 bg-slate-50 rounded-xl">
                      Standard Bank / Telebirr Transfer
                    </div>
                  )}
                </div>
              </div>

              {/* Step 4: Proof (Screenshot OR FT number) */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText size={14} className="text-emerald-600" />
                    <span>4. Payment Proof (FT ወይም ስክሪንሾት)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">At least 1 required</span>
                </label>

                {/* FT / Transaction Ref input */}
                <div>
                  <input
                    type="text"
                    value={manualFtNumber}
                    onChange={e => setManualFtNumber(e.target.value)}
                    placeholder="FT Number / Transaction Ref (e.g. FT2611...)"
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-2xl px-3.5 py-2 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>

                {/* Screenshot Uploader */}
                <div>
                  <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:bg-slate-50 active:scale-98 transition-all">
                    {manualScreenshotPreview ? (
                      <div className="relative flex items-center space-x-3 w-full">
                        <img 
                          src={manualScreenshotPreview} 
                          alt="Receipt Preview" 
                          className="w-14 h-14 object-cover rounded-xl shadow-xs border border-slate-200" 
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-800 truncate">
                            {manualScreenshotFile?.name || 'receipt.jpg'}
                          </p>
                          <p className="text-[10px] text-emerald-600 font-bold">
                            ✓ Screenshot attached (Auto-compressed)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setManualScreenshotFile(null);
                            setManualScreenshotPreview(null);
                          }}
                          className="w-7 h-7 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center hover:bg-rose-200 active:scale-90 shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 text-slate-500 py-1">
                        <UploadCloud size={20} className="text-slate-400" />
                        <span className="text-xs font-bold">Attach receipt photo (Optional if FT entered)</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleManualFileChange} 
                      className="hidden" 
                    />
                  </label>
                </div>

                {/* Optional Note */}
                <div>
                  <input
                    type="text"
                    value={manualNote}
                    onChange={e => setManualNote(e.target.value)}
                    placeholder="Worker note (e.g. Sent via Telegram support)"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={manualSubmitting || !selectedUser || !manualAmount || (!manualScreenshotFile && !manualFtNumber.trim())}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm shadow-lg shadow-emerald-600/30 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center space-x-2"
                >
                  {manualSubmitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin text-white" />
                      <span>Verifying & Crediting Deposit...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>
                        Approve & Credit {manualAmount ? `${Number(manualAmount).toLocaleString()} ETB` : 'Deposit'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
