import { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Percent, 
  Minus, RefreshCw, Trash2, Calendar, ShieldCheck, Wallet,
  CheckCircle2, XCircle, Building2, X, Eye, Check, Clock,
  Landmark, Smartphone, ChevronRight
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

const BANK_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  cbe:      { bg: 'bg-amber-50',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700' },
  boa:      { bg: 'bg-blue-50',    text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700' },
  telebirr: { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
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

  // Worker Transfers Filter
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
      setAccountError('Account name and number are required.');
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
      if (!res.ok) { setAccountError(json.error || 'Failed to save.'); return; }
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
    } catch (e) { console.error(e); }
  };

  const handleReviewTransfer = async (transferId: string, action: 'approve' | 'reject') => {
    const msg = action === 'approve'
      ? 'Approve this transfer? It will deduct from Net Profit.'
      : 'Reject this transfer?';
    if (!confirm(msg)) return;
    setReviewingId(transferId);
    try {
      const res = await fetch(`${API_URL}/admin/worker-transfers/${transferId}/review`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ action }),
      });
      if (res.ok) fetchAudit('', '');
    } catch (e) { console.error(e); }
    finally { setReviewingId(null); }
  };

  const startOf = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.toISOString(); };
  const endOf   = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c.toISOString(); };

  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    setShowCustom(false);
    const now = new Date();
    if (preset === 'Today')     { fetchAudit(startOf(now), endOf(now)); return; }
    if (preset === 'Yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); fetchAudit(startOf(y), endOf(y)); return; }
    if (preset === '7 Days')    { const d = new Date(now); d.setDate(d.getDate() - 7); fetchAudit(startOf(d), endOf(now)); return; }
    if (preset === '1 Month')   { const d = new Date(now); d.setMonth(d.getMonth() - 1); fetchAudit(startOf(d), endOf(now)); return; }
    if (preset === '3 Months')  { const d = new Date(now); d.setMonth(d.getMonth() - 3); fetchAudit(startOf(d), endOf(now)); return; }
    fetchAudit('', '');
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    setActivePreset('Custom');
    setShowCustom(false);
    fetchAudit(startOf(new Date(customFrom)), endOf(new Date(customTo)));
  };

  useEffect(() => { fetchAudit('', ''); }, [fetchAudit]);

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  const fmt = (n: number | undefined) =>
    (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const transfers     = data?.transfers || [];
  const pendingTransfers  = transfers.filter(t => t.status === 'pending');
  const approvedTransfers = transfers.filter(t => t.status === 'approved');
  const rejectedTransfers = transfers.filter(t => t.status === 'rejected');
  const pendingCount  = pendingTransfers.length;
  const approvedCount = approvedTransfers.length;
  const rejectedCount = rejectedTransfers.length;
  const totalCount    = transfers.length;
  const pendingAmount = pendingTransfers.reduce((s, t) => s + Number(t.amount || 0), 0);
  const filteredTransfers = transfers.filter(t => transferFilter === 'all' ? true : t.status === transferFilter);

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 pb-24">

      {/* ── Top Header ─────────────────────────────────────────────── */}
      <div className="bg-white px-4 py-3 border-b border-slate-100 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Link
              to="/admin"
              className="w-9 h-9 rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                Financial Audit
              </p>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Worker & Profit Audit</h1>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={openManagerAccounts}
              className="h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white flex items-center space-x-1.5 text-xs font-bold active:scale-95 transition-all shadow-sm"
            >
              <Building2 size={14} />
              <span>Accounts</span>
            </button>
            <button
              onClick={() => fetchAudit('', '')}
              className="w-9 h-9 rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-emerald-600' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-3.5 pt-3.5 space-y-3.5 max-w-lg mx-auto">

        {/* ── Date Presets ───────────────────────────────────────────── */}
        <div className="flex overflow-x-auto gap-1.5 pb-1 no-scrollbar snap-x">
          {['Today', 'Yesterday', '7 Days', '1 Month', '3 Months', 'All Time'].map(p => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`snap-start shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                activePreset === p
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 active:bg-slate-50'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => { setShowCustom(v => !v); setActivePreset('Custom'); }}
            className={`snap-start shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
              activePreset === 'Custom'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 active:bg-slate-50'
            }`}
          >
            <Calendar size={12} />
            <span>Custom</span>
          </button>
        </div>

        {/* ── Custom Date Picker ─────────────────────────────────────── */}
        {showCustom && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
            <p className="text-xs font-bold text-slate-700">Custom Period Range</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block font-semibold">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block font-semibold">To</label>
                <input
                  type="date"
                  value={customTo}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm"
            >
              Apply Range
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading audit data...</p>
          </div>
        ) : data ? (
          <>
            {/* ── Net Remaining Balance Hero (Light & Mobile-First) ──────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  <span>Live Net Remaining</span>
                </span>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">{activePreset}</span>
              </div>

              <div>
                <p className="text-3xl font-black text-slate-900 tracking-tight">
                  {data.netRemaining >= 0 ? '+' : ''}{fmt(data.netRemaining)}
                  <span className="text-sm font-bold text-emerald-600 ml-1.5">ETB</span>
                </p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">After payouts & manager transfers</p>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-700">Profit: +{fmt(data.netProfit)}</span>
                <span className="text-slate-300">−</span>
                <span className="text-purple-700">Transferred: {fmt(data.totalReduced)}</span>
                <span className="text-slate-300">=</span>
                <span className="text-slate-900">{fmt(data.netRemaining)} ETB</span>
              </div>
            </div>

            {/* ── 2×2 Metric Cards ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                  <ArrowDownToLine size={18} />
                </div>
                <p className="text-xs text-slate-500 font-medium">Total Deposits</p>
                <p className="text-lg font-black text-slate-900 mt-0.5">{fmt(data.totalDeposits)}</p>
                <span className="text-[11px] text-emerald-600 font-medium">Approved inflows</span>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-2">
                  <ArrowUpFromLine size={18} />
                </div>
                <p className="text-xs text-slate-500 font-medium">Total Payout</p>
                <p className="text-lg font-black text-slate-900 mt-0.5">{fmt(data.totalWithdrawals)}</p>
                <span className="text-[11px] text-rose-500 font-medium">Sent to users</span>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
                  <Percent size={18} />
                </div>
                <p className="text-xs text-slate-500 font-medium">Fees Retained</p>
                <p className="text-lg font-black text-amber-600 mt-0.5">+{fmt(data.totalFees)}</p>
                <span className="text-[11px] text-amber-500 font-medium">Platform cut</span>
              </div>

              <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-2">
                  <Minus size={18} />
                </div>
                <p className="text-xs text-slate-500 font-medium">Transferred Out</p>
                <p className="text-lg font-black text-purple-600 mt-0.5">-{fmt(data.totalReduced)}</p>
                <span className="text-[11px] text-purple-500 font-medium">Manager payouts</span>
              </div>
            </div>

            {/* ── Net Profit Banner ─────────────────────────────────────── */}
            <div className={`rounded-2xl p-3.5 border shadow-sm flex items-center justify-between ${
              data.netProfit >= 0
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}>
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">Net Profit (Deposits − Payouts)</p>
                <p className={`text-2xl font-black ${data.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {data.netProfit >= 0 ? '+' : ''}{fmt(data.netProfit)}
                  <span className="text-xs text-slate-400 ml-1 font-normal">ETB</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Gross requested: <strong className="text-slate-700">{fmt(data.grossRequested)} ETB</strong>
                </p>
              </div>
              <TrendingUp size={30} className={data.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
            </div>

            {/* ── Pending Worker Sends Banner ───────────────────────────── */}
            <button
              onClick={() => {
                setTransferFilter('pending');
                const el = document.getElementById('worker-transfers-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full rounded-2xl p-3.5 bg-white border border-amber-200 hover:border-amber-300 shadow-sm flex items-center justify-between active:scale-[0.98] transition-all"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <Clock size={20} />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">Pending Worker Sends</span>
                    {pendingCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold animate-pulse">
                        {pendingCount}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-medium">0</span>
                    )}
                  </div>
                  <p className="text-lg font-black text-slate-900 mt-0.5">
                    {pendingCount} <span className="text-xs font-normal text-slate-500">transfer{pendingCount === 1 ? '' : 's'}</span>
                  </p>
                  <p className="text-[11px] text-amber-600 font-semibold">+{fmt(pendingAmount)} ETB awaiting approval</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-100">
                <span className="text-xs font-bold">Review</span>
                <ChevronRight size={14} />
              </div>
            </button>

            {/* ── Worker Transfers Section ──────────────────────────────── */}
            <div id="worker-transfers-section" className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 pt-3.5 pb-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Wallet size={16} className="text-amber-500" />
                    <span>Worker Transfers to Manager</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Review and approve balance payouts</p>
                </div>
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                    {pendingCount} Pending
                  </span>
                )}
              </div>

              {/* Filter Tabs with Counts */}
              <div className="grid grid-cols-4 bg-slate-50 border-b border-slate-100 p-1.5 gap-1">
                {[
                  { id: 'pending',  label: 'Pending',  count: pendingCount  },
                  { id: 'approved', label: 'Approved', count: approvedCount },
                  { id: 'rejected', label: 'Rejected', count: rejectedCount },
                  { id: 'all',      label: 'All',      count: totalCount    },
                ].map(tab => {
                  const isActive = transferFilter === tab.id;
                  const badgeColors: Record<string, string> = {
                    pending:  isActive ? 'bg-amber-500 text-white' : (pendingCount > 0 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-slate-200 text-slate-500'),
                    approved: isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500',
                    rejected: isActive ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-500',
                    all:      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500',
                  };
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setTransferFilter(tab.id as any)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 active:scale-95 ${
                        isActive ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`text-[10px] px-2 py-0.2 rounded-full font-black ${badgeColors[tab.id]}`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Transfer Cards */}
              <div className="p-3 space-y-3">
                {filteredTransfers.length === 0 ? (
                  <div className="py-12 text-center">
                    <Wallet size={36} className="mx-auto mb-2 text-slate-200" />
                    <p className="text-xs font-bold text-slate-500">No {transferFilter} transfers</p>
                    <p className="text-[11px] text-slate-400 mt-1">Transfer requests from workers appear here.</p>
                  </div>
                ) : (
                  filteredTransfers.map(tr => {
                    const isReviewing = reviewingId === tr.id;
                    const bankName    = BANK_NAMES[tr.bank_type] || tr.bank_type.toUpperCase();
                    const bankColors  = BANK_COLORS[tr.bank_type] || { bg: 'bg-slate-50', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-700' };

                    return (
                      <div key={tr.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {/* Card Header */}
                        <div className="p-3.5">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-[10px] text-slate-400 font-semibold">From worker</p>
                              <p className="font-bold text-slate-900 text-sm">{tr.worker_name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(tr.created_at)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-xl text-emerald-600">+{fmt(tr.amount)}</p>
                              <p className="text-[10px] text-slate-400 font-semibold">ETB</p>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${bankColors.badge}`}>
                                {tr.bank_type.toUpperCase()}
                              </span>
                            </div>
                          </div>

                          {/* Manager Account */}
                          <div className={`mt-2.5 p-2.5 rounded-xl ${bankColors.bg}`}>
                            <p className="text-[10px] text-slate-500 font-semibold mb-0.5">Sent to manager account</p>
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold ${bankColors.text}`}>{tr.account_name}</span>
                              <span className="text-xs font-mono font-bold text-slate-700">{tr.account_number}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{bankName}</p>
                          </div>

                          {/* Note */}
                          {tr.note && (
                            <p className="text-xs text-slate-500 mt-2 italic">"{tr.note}"</p>
                          )}
                        </div>

                        {/* Screenshot */}
                        {tr.screenshot_url && (
                          <div className="px-3.5 pb-3">
                            <button
                              onClick={() => setPreviewImage(tr.screenshot_url)}
                              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 active:scale-[0.99] transition-all"
                            >
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={tr.screenshot_url}
                                  alt="Receipt"
                                  className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                                />
                                <div className="text-left">
                                  <p className="text-xs font-bold text-slate-800">Payment Screenshot</p>
                                  <p className="text-[10px] text-slate-400">Tap to view full receipt</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold">
                                <Eye size={12} />
                                <span>View</span>
                              </div>
                            </button>
                          </div>
                        )}

                        {/* Actions / Status */}
                        {tr.status === 'pending' ? (
                          <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-100 bg-slate-50/50">
                            <button
                              onClick={() => handleReviewTransfer(tr.id, 'approve')}
                              disabled={isReviewing}
                              className="py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-white font-bold text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
                            >
                              <CheckCircle2 size={15} />
                              <span>{isReviewing ? 'Processing...' : 'Approve'}</span>
                            </button>
                            <button
                              onClick={() => handleReviewTransfer(tr.id, 'reject')}
                              disabled={isReviewing}
                              className="py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-rose-600 font-bold text-xs bg-white hover:bg-rose-50 border border-rose-200 active:scale-95 transition-all disabled:opacity-50"
                            >
                              <XCircle size={15} />
                              <span>{isReviewing ? '...' : 'Reject'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className={`px-3.5 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs ${
                            tr.status === 'approved' ? 'bg-emerald-50/70' : 'bg-rose-50/70'
                          }`}>
                            <span className={`flex items-center gap-1.5 font-bold ${
                              tr.status === 'approved' ? 'text-emerald-700' : 'text-rose-600'
                            }`}>
                              {tr.status === 'approved'
                                ? <><CheckCircle2 size={13} /> Approved</>
                                : <><XCircle size={13} /> Rejected</>
                              }
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">
                              by {tr.reviewed_by || 'Admin'}
                              {tr.reviewed_at ? ` · ${fmtDate(tr.reviewed_at)}` : ''}
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
          <div className="py-20 text-center text-slate-400 font-medium">
            Failed to load audit data.
          </div>
        )}
      </div>

      {/* ── Manager Accounts Modal ──────────────────────────────────── */}
      {showManagerModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowManagerModal(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer handle */}
            <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mt-3 mb-1" />

            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-amber-500" />
                <h2 className="text-sm font-bold text-slate-900">Manager Receiving Accounts</h2>
              </div>
              <button
                onClick={() => setShowManagerModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Add Account Form */}
              <form onSubmit={handleAddAccount} className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-3.5">
                <p className="text-xs font-bold text-slate-800">Add New Manager Account</p>
                {accountError && (
                  <p className="text-xs text-rose-600 font-semibold bg-rose-50 p-2.5 rounded-xl border border-rose-200">{accountError}</p>
                )}

                {/* Bank Selector */}
                <div>
                  <label className="text-[11px] text-slate-500 font-semibold block mb-1.5">Select Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'cbe',      label: 'CBE',     full: 'Commercial Bank',   icon: Landmark,    grad: 'from-amber-400 to-orange-500' },
                      { key: 'boa',      label: 'BOA',     full: 'Bank of Abyssinia', icon: Building2,   grad: 'from-blue-500 to-indigo-600' },
                      { key: 'telebirr', label: 'Telebirr',full: 'Telebirr',          icon: Smartphone,  grad: 'from-emerald-400 to-teal-500' },
                    ].map(m => {
                      const isSelected = newBankType === m.key;
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setNewBankType(m.key)}
                          className={`p-2.5 rounded-xl border-2 flex flex-col items-center text-center transition-all active:scale-95 ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50/40 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${m.grad} flex items-center justify-center text-white mb-1`}>
                            <Icon size={16} />
                          </div>
                          <span className="text-xs font-bold text-slate-900">{m.label}</span>
                          <span className="text-[9px] text-slate-400 font-medium">{m.full}</span>
                          {isSelected && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-500 font-semibold block mb-1">Account Holder Name</label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={e => setNewAccountName(e.target.value)}
                    placeholder="e.g. Shikur Ebrahim"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-500 font-semibold block mb-1">Account / Phone Number</label>
                  <input
                    type="text"
                    value={newAccountNumber}
                    onChange={e => setNewAccountNumber(e.target.value)}
                    placeholder="e.g. 1000488262045 or 0912345678"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingAccount}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
                >
                  {savingAccount ? 'Saving...' : '+ Save Manager Account'}
                </button>
              </form>

              {/* Saved Accounts List */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700">Configured Accounts ({managerAccounts.length})</p>
                {loadingAccounts ? (
                  <p className="text-xs text-slate-400 text-center py-4">Loading...</p>
                ) : managerAccounts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No accounts added yet.</p>
                ) : (
                  managerAccounts.map(acc => {
                    const col = BANK_COLORS[acc.bank_type] || { bg: 'bg-slate-50', badge: 'bg-slate-100 text-slate-700' };
                    return (
                      <div key={acc.id} className={`flex items-center justify-between p-3 rounded-xl ${col.bg} border border-slate-200`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.badge}`}>
                              {acc.bank_type.toUpperCase()}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{acc.account_name}</span>
                          </div>
                          <p className="text-xs font-mono font-semibold text-slate-600 mt-0.5">{acc.account_number}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Preview Modal ─────────────────────────────────────── */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-sm w-full bg-white rounded-3xl p-3 shadow-2xl">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-slate-700 flex items-center justify-center border border-gray-200 shadow-lg"
            >
              <X size={16} />
            </button>
            <img src={previewImage} alt="Receipt" className="w-full max-h-[80vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
