import { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Percent, 
  Minus, RefreshCw, Trash2, Calendar, PlusCircle, ChevronDown, 
  ChevronUp, ShieldCheck, Wallet, History, AlertCircle, CheckCircle2, 
  XCircle, Building2, CreditCard, ExternalLink, X, Eye, Check, Clock,
  Landmark, Smartphone
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface ManagerAccount {
  id: string;
  bank_type: string;
  account_name: string;
  account_number: string;
  is_active: boolean;
  created_at: string;
}

interface WorkerTransfer {
  id: string;
  worker_telegram_id: string;
  worker_name: string;
  manager_account_id?: string;
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

interface AuditData {
  totalDeposits: number;
  totalWithdrawals: number;
  grossRequested: number;
  totalFees: number;
  netProfit: number;
  totalReduced: number;
  netRemaining: number;
  reductions: Reduction[];
  transfers: WorkerTransfer[];
}

const BANK_NAMES: Record<string, string> = {
  cbe: 'Commercial Bank of Ethiopia (CBE)',
  boa: 'Bank of Abyssinia (BOA)',
  telebirr: 'Telebirr',
};

const BANK_BADGES: Record<string, string> = {
  cbe: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  boa: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  telebirr: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminAudit() {
  const { user } = useGameStore();

  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState('All Time');
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Manager Accounts Modal
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [managerAccounts, setManagerAccounts] = useState<ManagerAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [newBankType, setNewBankType] = useState('cbe');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');

  // Worker Transfers Filter Tab
  const [transferFilter, setTransferFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const getHeaders = () => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    return { 'Content-Type': 'application/json', 'x-telegram-init-data': initData };
  };

  const fetchAudit = useCallback(async (fromIso = '', toIso = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromIso) params.append('from', fromIso);
      if (toIso) params.append('to', toIso);
      const res = await fetch(`${API_URL}/admin/audit?${params}`, { headers: getHeaders() });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchManagerAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch(`${API_URL}/admin/manager-accounts`, { headers: getHeaders() });
      if (res.ok) setManagerAccounts(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const openManagerAccounts = () => {
    setShowManagerModal(true);
    fetchManagerAccounts();
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError('');
    if (!newAccountName.trim() || !newAccountNumber.trim()) {
      setAccountError('Account name and account number are required.');
      return;
    }
    setSavingAccount(true);
    try {
      const res = await fetch(`${API_URL}/admin/manager-accounts`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          bank_type: newBankType,
          account_name: newAccountName.trim(),
          account_number: newAccountNumber.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAccountError(json.error || 'Failed to save account.');
        return;
      }
      setNewAccountName('');
      setNewAccountNumber('');
      fetchManagerAccounts();
    } catch (err: any) {
      setAccountError(err.message);
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Delete this manager account?')) return;
    try {
      await fetch(`${API_URL}/admin/manager-accounts/${id}`, { method: 'DELETE', headers: getHeaders() });
      fetchManagerAccounts();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReviewTransfer = async (transferId: string, action: 'approve' | 'reject') => {
    const confirmMsg = action === 'approve' 
      ? 'Approve this transfer? It will automatically deduct from Net Profit and update Net Remaining Balance.'
      : 'Reject this transfer? The amount will not be deducted.';
    if (!confirm(confirmMsg)) return;

    setReviewingId(transferId);
    try {
      const res = await fetch(`${API_URL}/admin/worker-transfers/${transferId}/review`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchAudit('', ''); // refresh live balance & transfers
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReviewingId(null);
    }
  };

  const startOf = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.toISOString(); };
  const endOf   = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c.toISOString(); };

  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    setShowCustom(false);
    const now = new Date();
    if (preset === 'Today')      { fetchAudit(startOf(now), endOf(now)); return; }
    if (preset === 'Yesterday')  { const y = new Date(now); y.setDate(y.getDate() - 1); fetchAudit(startOf(y), endOf(y)); return; }
    if (preset === '7 Days')     { const d = new Date(now); d.setDate(d.getDate() - 7); fetchAudit(startOf(d), endOf(now)); return; }
    if (preset === '1 Month')    { const d = new Date(now); d.setMonth(d.getMonth() - 1); fetchAudit(startOf(d), endOf(now)); return; }
    if (preset === '3 Months')   { const d = new Date(now); d.setMonth(d.getMonth() - 3); fetchAudit(startOf(d), endOf(now)); return; }
    fetchAudit('', ''); // All Time
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    setActivePreset('Custom');
    setShowCustom(false);
    fetchAudit(startOf(new Date(customFrom)), endOf(new Date(customTo)));
  };

  useEffect(() => { fetchAudit('', ''); }, [fetchAudit]);

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const transfers = data?.transfers || [];
  const pendingTransfers = transfers.filter(t => t.status === 'pending');
  const approvedTransfers = transfers.filter(t => t.status === 'approved');
  const rejectedTransfers = transfers.filter(t => t.status === 'rejected');

  const pendingCount = pendingTransfers.length;
  const approvedCount = approvedTransfers.length;
  const rejectedCount = rejectedTransfers.length;
  const totalCount = transfers.length;

  const pendingAmount = pendingTransfers.reduce((s, t) => s + Number(t.amount || 0), 0);
  const filteredTransfers = transfers.filter(t => transferFilter === 'all' ? true : t.status === transferFilter);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-20">
      
      {/* ── Top Header ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 px-4 pt-5 pb-5 border-b border-slate-800/80 sticky top-0 z-20 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link 
              to="/admin" 
              className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">FINANCIAL AUDIT</span>
              </div>
              <h1 className="text-xl font-black text-white leading-tight">Worker & Profit Audit</h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Manager Accounts Button */}
            <button
              onClick={openManagerAccounts}
              className="px-3 py-2 rounded-2xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 flex items-center space-x-1.5 text-xs font-black active:scale-95 transition-all"
              title="Manage Manager Accounts"
            >
              <Building2 size={16} />
              <span>Manager Accounts</span>
            </button>

            <button
              onClick={() => fetchAudit('', '')}
              className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-emerald-400 active:scale-95 transition-all"
              title="Refresh Audit Data"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-400' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">

        {/* ── Date Preset Pills ─────────────────────────────────────────── */}
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 pb-1 snap-x">
          {['Today', 'Yesterday', '7 Days', '1 Month', '3 Months', 'All Time'].map(p => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`snap-start whitespace-nowrap px-4 py-2 rounded-2xl text-[11px] font-black transition-all ${
                activePreset === p
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25 scale-105'
                  : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => { setShowCustom(v => !v); setActivePreset('Custom'); }}
            className={`snap-start whitespace-nowrap px-4 py-2 rounded-2xl text-[11px] font-black flex items-center space-x-1 transition-all ${
              activePreset === 'Custom' 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25' 
                : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-white'
            }`}
          >
            <Calendar size={12} />
            <span>Custom</span>
          </button>
        </div>

        {/* ── Custom Date Range Picker ───────────────────────────────────── */}
        {showCustom && (
          <div className="bg-slate-800/90 rounded-3xl p-4 shadow-xl border border-slate-700/80 backdrop-blur-md">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Custom Audit Period</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">From</label>
                <input 
                  type="date" 
                  value={customFrom} 
                  max={toDateStr(new Date())}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">To</label>
                <input 
                  type="date" 
                  value={customTo} 
                  max={toDateStr(new Date())}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" 
                />
              </div>
            </div>
            <button 
              onClick={applyCustom} 
              disabled={!customFrom || !customTo}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs disabled:opacity-40 active:scale-98 transition-transform"
            >
              Apply Custom Range
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Auditing Transactions...</p>
          </div>
        ) : data ? (
          <>
            {/* ── HERO CARD: Net Remaining Balance ─────────────────────────── */}
            <div className="rounded-3xl p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 border-2 border-emerald-500/40 shadow-2xl shadow-emerald-950/40 relative overflow-hidden">
              <div className="flex items-center justify-between mb-3 relative z-10">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  <ShieldCheck size={12} />
                  Live Net Remaining
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {activePreset}
                </span>
              </div>

              <div className="relative z-10">
                <p className="text-4xl font-black text-white tracking-tight">
                  {data.netRemaining >= 0 ? '+' : ''}{fmt(data.netRemaining)}
                  <span className="text-base text-emerald-400 ml-1.5 font-bold">ETB</span>
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  Actual money retained after worker payouts & manager transfers
                </p>
              </div>

              {/* Quick Math Breakdown Pill */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold relative z-10">
                <div className="flex items-center space-x-1 text-emerald-400">
                  <span>Profit:</span>
                  <span>+{fmt(data.netProfit)}</span>
                </div>
                <span className="text-slate-600 font-black">−</span>
                <div className="flex items-center space-x-1 text-purple-400">
                  <span>Transferred:</span>
                  <span>-{fmt(data.totalReduced)}</span>
                </div>
                <span className="text-slate-600 font-black">=</span>
                <div className="flex items-center space-x-1 text-white">
                  <span>Remaining:</span>
                  <span className="text-emerald-300">{fmt(data.netRemaining)}</span>
                </div>
              </div>
            </div>

            {/* ── 2x2 Financial Metric Grid ─────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Total Deposits */}
              <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/60 shadow-lg relative overflow-hidden">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-2.5">
                  <ArrowDownToLine size={20} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Deposits</p>
                <p className="text-lg font-black text-white mt-0.5">{fmt(data.totalDeposits)}</p>
                <span className="text-[10px] text-emerald-400 font-bold">Approved inflows</span>
              </div>

              {/* Actual Payout */}
              <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/60 shadow-lg relative overflow-hidden">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mb-2.5">
                  <ArrowUpFromLine size={20} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Actual Payout</p>
                <p className="text-lg font-black text-white mt-0.5">{fmt(data.totalWithdrawals)}</p>
                <span className="text-[10px] text-rose-400 font-bold">Sent to users (net)</span>
              </div>

              {/* Fees Collected */}
              <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/60 shadow-lg relative overflow-hidden">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-2.5">
                  <Percent size={20} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fees Retained</p>
                <p className="text-lg font-black text-amber-300 mt-0.5">+{fmt(data.totalFees)}</p>
                <span className="text-[10px] text-amber-400/80 font-bold">Platform profit cut</span>
              </div>

              {/* Total Transferred / Reduced */}
              <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/60 shadow-lg relative overflow-hidden">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mb-2.5">
                  <Minus size={20} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Transferred Out</p>
                <p className="text-lg font-black text-purple-300 mt-0.5">-{fmt(data.totalReduced)}</p>
                <span className="text-[10px] text-purple-400/80 font-bold">Manager payouts</span>
              </div>
            </div>

            {/* ── Net Profit Comparison Banner ─────────────────────────────── */}
            <div className={`rounded-3xl p-5 border shadow-xl flex items-center justify-between ${
              data.netProfit >= 0
                ? 'bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border-emerald-500/30'
                : 'bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 border-rose-500/30'
            }`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                  Net Profit (Deposits − Payouts)
                </p>
                <p className="text-2xl font-black text-white">
                  {data.netProfit >= 0 ? '+' : ''}{fmt(data.netProfit)} <span className="text-sm text-slate-400">ETB</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Gross requested by users: <strong className="text-slate-200">{fmt(data.grossRequested)} ETB</strong>
                </p>
              </div>
              <TrendingUp size={36} className={data.netProfit >= 0 ? 'text-emerald-500/30' : 'text-rose-500/30'} />
            </div>

            {/* ── PENDING WORKER SENDS CARD ─────────────────────────────────── */}
            <div 
              onClick={() => {
                setTransferFilter('pending');
                const el = document.getElementById('worker-transfers-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="rounded-3xl p-4 bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-900 border-2 border-amber-500/40 shadow-xl flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all hover:border-amber-400/70"
            >
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Clock size={24} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                      Pending Worker Sends
                    </span>
                    {pendingCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                        {pendingCount} Pending
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold">
                        0 Pending
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-black text-white mt-0.5">
                    {pendingCount} <span className="text-xs font-bold text-slate-400">Transfer Request{pendingCount === 1 ? '' : 's'}</span>
                  </p>
                  <p className="text-[11px] text-amber-300 font-bold">
                    +{fmt(pendingAmount)} ETB awaiting approval
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-amber-400 bg-amber-400/10 border border-amber-400/30 px-3 py-1.5 rounded-xl block">
                  Review ➔
                </span>
              </div>
            </div>

            {/* ── WORKER TRANSFERS (Review & Approvals) ─────────────────────── */}
            <div id="worker-transfers-section" className="bg-slate-800/90 rounded-3xl shadow-xl border border-slate-700/70 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-slate-700/60 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-white text-base flex items-center space-x-2">
                    <Wallet size={18} className="text-amber-400" />
                    <span>Worker Transfers to Manager</span>
                  </h2>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Review and approve balance payouts sent by workers
                  </p>
                </div>

                {pendingCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-xs font-black animate-pulse">
                    {pendingCount} Pending
                  </span>
                )}
              </div>

              {/* Status Filter Tabs with Real Counts */}
              <div className="grid grid-cols-4 border-b border-slate-700/60 bg-slate-900/60 p-1.5 gap-1">
                {[
                  { id: 'pending', label: 'Pending', count: pendingCount, activeBadge: 'bg-amber-500 text-slate-950 font-black', idleBadge: pendingCount > 0 ? 'bg-rose-500 text-white font-black animate-pulse' : 'bg-slate-800 text-slate-400' },
                  { id: 'approved', label: 'Approved', count: approvedCount, activeBadge: 'bg-emerald-500 text-slate-950 font-black', idleBadge: 'bg-slate-800 text-slate-400' },
                  { id: 'rejected', label: 'Rejected', count: rejectedCount, activeBadge: 'bg-rose-500 text-white font-black', idleBadge: 'bg-slate-800 text-slate-400' },
                  { id: 'all', label: 'All', count: totalCount, activeBadge: 'bg-slate-700 text-white font-black', idleBadge: 'bg-slate-800 text-slate-400' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setTransferFilter(tab.id as any)}
                    className={`py-2 px-1 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 ${
                      transferFilter === tab.id
                        ? 'bg-slate-800 text-white shadow-md border border-slate-700'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      transferFilter === tab.id ? tab.activeBadge : tab.idleBadge
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Transfer Cards List */}
              <div className="p-3 space-y-3">
                {filteredTransfers.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <Wallet size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-bold uppercase tracking-wider">No {transferFilter} transfers</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      When workers send net balance to manager, requests appear here.
                    </p>
                  </div>
                ) : (
                  filteredTransfers.map(tr => {
                    const isReviewing = reviewingId === tr.id;
                    const bankName = BANK_NAMES[tr.bank_type] || tr.bank_type.toUpperCase();
                    const bankBadge = BANK_BADGES[tr.bank_type] || 'bg-slate-700 text-slate-300';

                    return (
                      <div 
                        key={tr.id} 
                        className="bg-slate-900/90 rounded-2xl p-4 border border-slate-700/70 shadow-md space-y-3"
                      >
                        {/* Top: Worker & Amount */}
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              From Worker
                            </span>
                            <p className="font-black text-white text-sm">{tr.worker_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-xl text-emerald-400 tracking-tight">
                              +{fmt(tr.amount)} <span className="text-xs text-slate-400">ETB</span>
                            </p>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${bankBadge}`}>
                              {tr.bank_type.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Middle: Manager Account Sent To */}
                        <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs space-y-1">
                          <p className="text-slate-400 text-[10px] font-bold uppercase">Sent to Manager Account:</p>
                          <div className="flex items-center justify-between font-bold text-slate-200">
                            <span>{tr.account_name}</span>
                            <span className="font-mono text-amber-300">{tr.account_number}</span>
                          </div>
                          <p className="text-[10px] text-slate-400">{bankName}</p>
                        </div>

                        {/* Note & Date */}
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="truncate max-w-[200px]">{tr.note || 'No note'}</span>
                          <span>
                            {new Date(tr.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Screenshot Thumbnail */}
                        {tr.screenshot_url && (
                          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/50 border border-slate-700/40">
                            <div className="flex items-center space-x-2">
                              <img 
                                src={tr.screenshot_url} 
                                alt="Receipt" 
                                className="w-12 h-12 object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setPreviewImage(tr.screenshot_url)}
                              />
                              <div>
                                <p className="text-xs font-bold text-white">Payment Screenshot</p>
                                <p className="text-[10px] text-slate-400">Tap image to view full receipt</p>
                              </div>
                            </div>
                            <button
                              onClick={() => setPreviewImage(tr.screenshot_url)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-700 text-xs font-bold text-slate-200 hover:text-white flex items-center space-x-1"
                            >
                              <Eye size={12} />
                              <span>View</span>
                            </button>
                          </div>
                        )}

                        {/* Status / Actions */}
                        {tr.status === 'pending' ? (
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                            <button
                              onClick={() => handleReviewTransfer(tr.id, 'approve')}
                              disabled={isReviewing}
                              className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center space-x-1 active:scale-95 transition-all shadow-md shadow-emerald-900/30 disabled:opacity-50"
                            >
                              <CheckCircle2 size={16} />
                              <span>{isReviewing ? '...' : 'Approve Transfer'}</span>
                            </button>
                            <button
                              onClick={() => handleReviewTransfer(tr.id, 'reject')}
                              disabled={isReviewing}
                              className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center space-x-1 active:scale-95 transition-all shadow-md shadow-rose-900/30 disabled:opacity-50"
                            >
                              <XCircle size={16} />
                              <span>{isReviewing ? '...' : 'Reject'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                            <span className="text-[11px] text-slate-400">
                              Reviewed by <strong className="text-white">{tr.reviewed_by || 'Admin'}</strong>
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              tr.status === 'approved' 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            }`}>
                              {tr.status === 'approved' ? '✅ Approved' : '❌ Rejected'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </>
        ) : (
          <div className="py-20 text-center text-slate-400 font-bold">
            Failed to load audit data.
          </div>
        )}

      </div>

      {/* ── MANAGER ACCOUNTS MODAL ─────────────────────────────────────── */}
      {showManagerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowManagerModal(false)}>
          <div className="bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-700 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Building2 size={20} className="text-amber-400" />
                <h2 className="text-lg font-black text-white">Manager Receiving Accounts</h2>
              </div>
              <button onClick={() => setShowManagerModal(false)} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Add Account Form */}
              <form onSubmit={handleAddAccount} className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/70 space-y-3">
                <p className="text-xs font-black uppercase tracking-wider text-amber-400">Add New Manager Account</p>
                {accountError && (
                  <p className="text-xs text-rose-400 font-bold bg-rose-500/10 p-2 rounded-xl">{accountError}</p>
                )}

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'cbe', label: 'CBE', full: 'Commercial Bank', icon: Landmark, gradient: 'from-amber-500 to-orange-600' },
                      { key: 'boa', label: 'BOA', full: 'Bank of Abyssinia', icon: Building2, gradient: 'from-blue-600 to-indigo-700' },
                      { key: 'telebirr', label: 'Telebirr', full: 'Telebirr', icon: Smartphone, gradient: 'from-emerald-500 to-teal-600' },
                    ].map(m => {
                      const isSelected = newBankType === m.key;
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setNewBankType(m.key)}
                          className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center text-center transition-all active:scale-95 ${
                            isSelected
                              ? 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10 ring-1 ring-amber-400/30'
                              : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center text-white mb-1.5 shadow-sm`}>
                            <Icon size={18} />
                          </div>
                          <span className="text-xs font-black text-white block">{m.label}</span>
                          <span className="text-[9px] text-slate-400 font-bold block">{m.full}</span>
                          {isSelected && (
                            <span className="mt-1 w-2 h-2 rounded-full bg-amber-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Account Holder Name</label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={e => setNewAccountName(e.target.value)}
                    placeholder="e.g. Shikur Ebrahim"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Account / Phone Number</label>
                  <input
                    type="text"
                    value={newAccountNumber}
                    onChange={e => setNewAccountNumber(e.target.value)}
                    placeholder="e.g. 100023456789 or 0912345678"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingAccount}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs active:scale-95 transition-all disabled:opacity-50"
                >
                  {savingAccount ? 'Saving...' : '➕ Save Manager Account'}
                </button>
              </form>

              {/* Accounts List */}
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Configured Accounts ({managerAccounts.length})</p>
                {loadingAccounts ? (
                  <p className="text-xs text-slate-500 text-center py-4">Loading accounts...</p>
                ) : managerAccounts.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No accounts added yet.</p>
                ) : (
                  managerAccounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${BANK_BADGES[acc.bank_type] || 'bg-slate-700'}`}>
                            {acc.bank_type.toUpperCase()}
                          </span>
                          <span className="font-bold text-white text-xs">{acc.account_name}</span>
                        </div>
                        <p className="text-xs font-mono text-amber-300 font-bold mt-1">{acc.account_number}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteAccount(acc.id)}
                        className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── IMAGE PREVIEW MODAL ────────────────────────────────────────── */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-sm w-full bg-slate-900 rounded-3xl p-3 border border-slate-700 shadow-2xl">
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center border border-slate-600 shadow-lg"
            >
              <X size={16} />
            </button>
            <img 
              src={previewImage} 
              alt="Receipt Preview" 
              className="w-full max-h-[80vh] object-contain rounded-2xl" 
            />
          </div>
        </div>
      )}

    </div>
  );
}
