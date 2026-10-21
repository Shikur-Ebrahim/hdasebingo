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
      <div className="bg-white px-4 pt-5 pb-4 border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              to="/admin"
              className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-slate-600 active:scale-95 transition-all"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                Financial Audit
              </p>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Worker & Profit Audit</h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={openManagerAccounts}
              className="px-3 py-2.5 rounded-2xl bg-amber-500 text-white flex items-center space-x-1.5 text-xs font-bold active:scale-95 transition-all shadow-sm shadow-amber-200"
            >
              <Building2 size={15} />
              <span>Accounts</span>
            </button>
            <button
              onClick={() => fetchAudit('', '')}
              className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-slate-500 active:scale-95 transition-all"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-500' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">

        {/* ── Date Presets ───────────────────────────────────────────── */}
        <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar snap-x">
          {['Today', 'Yesterday', '7 Days', '1 Month', '3 Months', 'All Time'].map(p => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`snap-start whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                activePreset === p
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => { setShowCustom(v => !v); setActivePreset('Custom'); }}
            className={`snap-start whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activePreset === 'Custom'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-600 border border-gray-200'
            }`}
          >
            <Calendar size={12} />
            Custom
          </button>
        </div>

        {/* ── Custom Date Picker ─────────────────────────────────────── */}
        {showCustom && (
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Custom period</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block font-medium">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block font-medium">To</label>
                <input
                  type="date"
                  value={customTo}
                  max={toDateStr(new Date())}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="w-full py-3 rounded-2xl bg-slate-900 text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.99] transition-transform"
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
            {/* ── Net Remaining Balance Hero ──────────────────────────── */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                  <ShieldCheck size={13} />
                  Live Net Remaining
                </span>
                <span className="text-xs text-slate-400 font-medium">{activePreset}</span>
              </div>
              <p className="text-4xl font-bold text-white tracking-tight mt-2">
                {data.netRemaining >= 0 ? '+' : ''}{fmt(data.netRemaining)}
                <span className="text-lg text-emerald-400 ml-1.5 font-semibold">ETB</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">After payouts & manager transfers</p>
              <div className="mt-4 pt-3 border-t border-slate-700 flex items-center justify-between text-xs font-medium">
                <span className="text-emerald-400">Profit: +{fmt(data.netProfit)}</span>
                <span className="text-slate-500">−</span>
                <span className="text-purple-400">Transferred: {fmt(data.totalReduced)}</span>
                <span className="text-slate-500">=</span>
                <span className="text-white font-bold">{fmt(data.netRemaining)}</span>
              </div>
            </div>

            {/* ── 2×2 Metric Cards ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2.5">
                  <ArrowDownToLine size={20} />
                </div>
                <p className="text-xs text-slate-500 font-medium">Total Deposits</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(data.totalDeposits)}</p>
                <span className="text-[11px] text-emerald-600 font-medium">Approved inflows</span>
              </div>

              <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-2.5">
                  <ArrowUpFromLine size={20} />
                </div>
                <p className="text-xs text-slate-500 font-medium">Total Payout</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(data.totalWithdrawals)}</p>
                <span className="text-[11px] text-rose-500 font-medium">Sent to users</span>
              </div>

              <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-2.5">
                  <Percent size={20} />
                </div>
                <p className="text-xs text-slate-500 font-medium">Fees Retained</p>
                <p className="text-lg font-bold text-amber-600 mt-0.5">+{fmt(data.totalFees)}</p>
                <span className="text-[11px] text-amber-500 font-medium">Platform cut</span>
              </div>

              <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-2.5">
                  <Minus size={20} />
                </div>
                <p className="text-xs text-slate-500 font-medium">Transferred Out</p>
                <p className="text-lg font-bold text-purple-600 mt-0.5">-{fmt(data.totalReduced)}</p>
                <span className="text-[11px] text-purple-500 font-medium">Manager payouts</span>
              </div>
            </div>

            {/* ── Net Profit Banner ─────────────────────────────────────── */}
            <div className={`rounded-3xl p-4 border shadow-sm flex items-center justify-between ${
              data.netProfit >= 0
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}>
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">Net Profit (Deposits − Payouts)</p>
                <p className={`text-2xl font-bold ${data.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {data.netProfit >= 0 ? '+' : ''}{fmt(data.netProfit)}
                  <span className="text-sm text-slate-400 ml-1 font-normal">ETB</span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gross requested: <strong className="text-slate-700">{fmt(data.grossRequested)} ETB</strong>
                </p>
              </div>
              <TrendingUp size={34} className={data.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
            </div>

            {/* ── Pending Worker Sends Banner ───────────────────────────── */}
            <button
              onClick={() => {
                setTransferFilter('pending');
                const el = document.getElementById('worker-transfers-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full rounded-3xl p-4 bg-white border-2 border-amber-200 shadow-sm flex items-center justify-between active:scale-[0.99] transition-all"
            >
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <Clock size={22} />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">Pending Worker Sends</span>
                    {pendingCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold animate-pulse">
                        {pendingCount}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-slate-400 text-[10px] font-medium">0</span>
                    )}
                  </div>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">
                    {pendingCount} <span className="text-xs font-normal text-slate-500">transfer{pendingCount === 1 ? '' : 's'}</span>
                  </p>
                  <p className="text-xs text-amber-600 font-medium">+{fmt(pendingAmount)} ETB awaiting approval</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-3 py-2 rounded-2xl">
                <span className="text-xs font-semibold">Review</span>
                <ChevronRight size={14} />
              </div>
            </button>

            {/* ── Worker Transfers Section ──────────────────────────────── */}
            <div id="worker-transfers-section" className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <Wallet size={17} className="text-amber-500" />
                    Worker Transfers to Manager
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Review and approve balance payouts</p>
                </div>
                {pendingCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-rose-500 text-white text-xs font-bold animate-pulse">
                    {pendingCount} Pending
                  </span>
                )}
              </div>

              {/* Filter Tabs with Counts */}
              <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-100 p-1.5 gap-1">
                {[
                  { id: 'pending',  label: 'Pending',  count: pendingCount  },
                  { id: 'approved', label: 'Approved', count: approvedCount },
                  { id: 'rejected', label: 'Rejected', count: rejectedCount },
                  { id: 'all',      label: 'All',      count: totalCount    },
                ].map(tab => {
                  const isActive = transferFilter === tab.id;
                  const badgeColors: Record<string, string> = {
                    pending:  isActive ? 'bg-amber-500 text-white' : (pendingCount > 0 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-gray-200 text-gray-500'),
                    approved: isActive ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500',
                    rejected: isActive ? 'bg-rose-500 text-white' : 'bg-gray-200 text-gray-500',
                    all:      isActive ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-500',
                  };
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setTransferFilter(tab.id as any)}
                      className={`py-2 px-1 rounded-2xl text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                        isActive ? 'bg-white shadow-sm text-slate-900 border border-gray-200' : 'text-slate-500'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${badgeColors[tab.id]}`}>
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
                    <Wallet size={36} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-sm font-semibold text-slate-500">No {transferFilter} transfers</p>
                    <p className="text-xs text-slate-400 mt-1">Transfer requests from workers appear here.</p>
                  </div>
                ) : (
                  filteredTransfers.map(tr => {
                    const isReviewing = reviewingId === tr.id;
                    const bankName    = BANK_NAMES[tr.bank_type] || tr.bank_type.toUpperCase();
                    const bankColors  = BANK_COLORS[tr.bank_type] || { bg: 'bg-gray-50', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-700' };

                    return (
                      <div key={tr.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Card Header */}
                        <div className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-[11px] text-slate-400 font-medium">From worker</p>
                              <p className="font-bold text-slate-900 text-sm">{tr.worker_name}</p>
                              <p className="text-[11px] text-slate-400 mt-1">{fmtDate(tr.created_at)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-2xl text-emerald-600">+{fmt(tr.amount)}</p>
                              <p className="text-xs text-slate-400 font-medium">ETB</p>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${bankColors.badge}`}>
                                {tr.bank_type.toUpperCase()}
                              </span>
                            </div>
                          </div>

                          {/* Manager Account */}
                          <div className={`mt-3 p-3 rounded-2xl ${bankColors.bg}`}>
                            <p className="text-[10px] text-slate-500 font-medium mb-1">Sent to manager account</p>
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold ${bankColors.text}`}>{tr.account_name}</span>
                              <span className="text-xs font-mono font-bold text-slate-700">{tr.account_number}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{bankName}</p>
                          </div>

                          {/* Note */}
                          {tr.note && (
                            <p className="text-xs text-slate-500 mt-2 italic">"{tr.note}"</p>
                          )}
                        </div>

                        {/* Screenshot */}
                        {tr.screenshot_url && (
                          <div className="px-4 pb-3">
                            <button
                              onClick={() => setPreviewImage(tr.screenshot_url)}
                              className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200 active:scale-[0.99] transition-all"
                            >
                              <div className="flex items-center gap-3">
                                <img
                                  src={tr.screenshot_url}
                                  alt="Receipt"
                                  className="w-12 h-12 object-cover rounded-xl border border-gray-200"
                                />
                                <div className="text-left">
                                  <p className="text-xs font-semibold text-slate-800">Payment Screenshot</p>
                                  <p className="text-[11px] text-slate-400">Tap to view full receipt</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-slate-600">
                                <Eye size={13} />
                                <span className="text-xs font-medium">View</span>
                              </div>
                            </button>
                          </div>
                        )}

                        {/* Actions / Status */}
                        {tr.status === 'pending' ? (
                          <div className="grid grid-cols-2 border-t border-gray-100">
                            <button
                              onClick={() => handleReviewTransfer(tr.id, 'approve')}
                              disabled={isReviewing}
                              className="py-3.5 flex items-center justify-center gap-1.5 text-emerald-700 font-semibold text-sm bg-emerald-50 hover:bg-emerald-100 border-r border-gray-100 active:scale-[0.99] transition-all disabled:opacity-50"
                            >
                              <CheckCircle2 size={17} />
                              <span>{isReviewing ? 'Processing...' : 'Approve'}</span>
                            </button>
                            <button
                              onClick={() => handleReviewTransfer(tr.id, 'reject')}
                              disabled={isReviewing}
                              className="py-3.5 flex items-center justify-center gap-1.5 text-rose-600 font-semibold text-sm bg-rose-50 hover:bg-rose-100 active:scale-[0.99] transition-all disabled:opacity-50"
                            >
                              <XCircle size={17} />
                              <span>{isReviewing ? '...' : 'Reject'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className={`px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs ${
                            tr.status === 'approved' ? 'bg-emerald-50' : 'bg-rose-50'
                          }`}>
                            <span className={`flex items-center gap-1.5 font-semibold ${
                              tr.status === 'approved' ? 'text-emerald-700' : 'text-rose-600'
                            }`}>
                              {tr.status === 'approved'
                                ? <><CheckCircle2 size={14} /> Approved</>
                                : <><XCircle size={14} /> Rejected</>
                              }
                            </span>
                            <span className="text-slate-400">
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

            <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Building2 size={19} className="text-amber-500" />
                <h2 className="text-base font-bold text-slate-900">Manager Receiving Accounts</h2>
              </div>
              <button
                onClick={() => setShowManagerModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-slate-500 active:scale-95"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Add Account Form */}
              <form onSubmit={handleAddAccount} className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-4">
                <p className="text-sm font-semibold text-slate-800">Add New Manager Account</p>
                {accountError && (
                  <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-200">{accountError}</p>
                )}

                {/* Bank Selector */}
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-2">Select Payment Method</label>
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
                          className={`p-3 rounded-2xl border-2 flex flex-col items-center text-center transition-all active:scale-95 ${
                            isSelected
                              ? 'border-slate-900 bg-white shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${m.grad} flex items-center justify-center text-white mb-1.5`}>
                            <Icon size={18} />
                          </div>
                          <span className="text-xs font-bold text-slate-900">{m.label}</span>
                          <span className="text-[9px] text-slate-400">{m.full}</span>
                          {isSelected && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-900" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1.5">Account Holder Name</label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={e => setNewAccountName(e.target.value)}
                    placeholder="e.g. Shikur Ebrahim"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1.5">Account / Phone Number</label>
                  <input
                    type="text"
                    value={newAccountNumber}
                    onChange={e => setNewAccountNumber(e.target.value)}
                    placeholder="e.g. 1000488262045 or 0912345678"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingAccount}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm active:scale-[0.99] transition-all disabled:opacity-50 shadow-sm"
                >
                  {savingAccount ? 'Saving...' : '+ Save Manager Account'}
                </button>
              </form>

              {/* Saved Accounts List */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Configured Accounts ({managerAccounts.length})</p>
                {loadingAccounts ? (
                  <p className="text-sm text-slate-400 text-center py-4">Loading...</p>
                ) : managerAccounts.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No accounts added yet.</p>
                ) : (
                  managerAccounts.map(acc => {
                    const col = BANK_COLORS[acc.bank_type] || { bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-700' };
                    return (
                      <div key={acc.id} className={`flex items-center justify-between p-3 rounded-2xl ${col.bg} border border-gray-200`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.badge}`}>
                              {acc.bank_type.toUpperCase()}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{acc.account_name}</span>
                          </div>
                          <p className="text-xs font-mono text-slate-600 mt-0.5">{acc.account_number}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 size={16} />
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
