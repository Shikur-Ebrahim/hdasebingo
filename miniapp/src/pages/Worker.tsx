import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { Navigate, Link } from 'react-router-dom';
import { 
  ArrowDownToLine, ArrowUpFromLine, TrendingUp, Calendar, RefreshCw, 
  Search, Fingerprint, X, Minus, ChevronDown, ChevronUp, ChevronRight, 
  Send, Copy, Check, UploadCloud, ArrowLeft, Building2, Eye, Clock, CheckCircle2, XCircle,
  Landmark, Smartphone
} from 'lucide-react';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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
  const [stats, setStats] = useState({ totalDeposits: 0, totalWithdrawals: 0, totalFees: 0, netProfit: 0 });
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
        setStats(await res.json());
      } else if (res.status === 404) {
        alert("Backend update required! Please run 'git pull' and 'docker compose up -d --build' on your VPS.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

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
        <div className="grid grid-cols-2 gap-3 mt-4">
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
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Select Date Range</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">To</label>
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
              className={`snap-start whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-black transition-all ${
                activePreset === preset
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <ArrowDownToLine size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Deposits</p>
              <p className="text-xl font-black text-slate-800">{stats.totalDeposits.toLocaleString()} ETB</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <ArrowUpFromLine size={24} />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Withdrawals</p>
              <p className="text-xl font-black text-slate-800">{stats.totalWithdrawals.toLocaleString()} ETB</p>
            </div>
          </div>

          <div className={`rounded-2xl p-5 shadow-sm flex items-center justify-between ${
            stats.netProfit >= 0
              ? 'bg-gradient-to-r from-orange-500 to-amber-500'
              : 'bg-gradient-to-r from-rose-500 to-red-500'
          }`}>
            <div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Net Profit</p>
              <p className="text-3xl font-black text-white">
                {stats.netProfit > 0 ? '+' : ''}{stats.netProfit.toLocaleString()} ETB
              </p>
            </div>
            <TrendingUp size={40} className="text-white/20" />
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
                      <label className="text-[11px] font-black uppercase text-slate-500 block mb-1.5">
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
                                 selectedAccount?.bank_type === 'boa' ? 'BOA' : 'BANK'}
                              </div>
                              <div>
                                <span className="font-black text-sm text-slate-900 block leading-tight">
                                  {selectedAccount ? (BANK_NAMES[selectedAccount.bank_type] || selectedAccount.bank_type.toUpperCase()) : 'Select Payment Method'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
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
                          <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-amber-200 font-black">
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
                        <label className="text-[11px] font-black uppercase text-slate-500">Transfer Amount (ETB)</label>
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
                      <label className="text-[11px] font-black uppercase text-slate-500 block mb-1">
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
                      <label className="text-[11px] font-black uppercase text-slate-500 block mb-1">Note (Optional)</label>
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
                      <p className="text-slate-400 text-[11px] font-black uppercase tracking-wider mb-1">Live Net Remaining Balance</p>
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
                            <p className="text-xs font-bold uppercase tracking-wider">No Transfer History</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Use "Transfer to Manager" above to payout balance.</p>
                          </div>
                        ) : (
                          <>
                            {/* Worker Transfers List */}
                            {workerTransfers.map(tr => (
                              <div key={tr.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 uppercase">
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

    </>
  );
}
