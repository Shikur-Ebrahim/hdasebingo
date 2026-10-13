import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Clock, User, Phone, RefreshCw, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Withdrawal {
  id: string;
  telegram_id: string;
  amount: number;
  account_name: string;
  account_number: string;
  status: 'pending' | 'approved';
  created_at: string;
  withdrawal_methods?: { type: string; logo_url?: string };
  users?: { first_name: string; username?: string };
}

const typeLabels: Record<string, string> = {
  cbe: 'Commercial Bank',
  boa: 'Bank of Abyssinia',
  telebirr: 'Telebirr',
  mpesa: 'M-Pesa',
};

const typeBadgeColors: Record<string, string> = {
  cbe: 'bg-yellow-100 text-yellow-700',
  boa: 'bg-blue-100 text-blue-700',
  telebirr: 'bg-purple-100 text-purple-700',
  mpesa: 'bg-green-100 text-green-700',
};

const timeFilters = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: '3months', label: '3 Months' },
  { id: '6months', label: '6 Months' },
  { id: 'year', label: '1 Year' },
];

export default function AdminWithdrawals() {
  const { user } = useGameStore();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [timeFilter, setTimeFilter] = useState('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
      WebApp.HapticFeedback.impactOccurred('light');
    }
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };


  const getHeaders = () => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    return { 'Content-Type': 'application/json', 'x-telegram-init-data': initData };
  };

  const fetchWithdrawals = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/withdrawals`, { headers: getHeaders() });
      if (res.ok) setWithdrawals(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWithdrawals(); }, [fetchWithdrawals]);

  if (!user || (user.role !== 'admin' && !(user.role === 'worker' && user.permissions?.withdrawals))) {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied</div>;
  }

  const handleApprove = async (id: string) => {
    if (!window.confirm('Approve this withdrawal?')) return;
    setProcessingId(id);
    try {
      const res = await fetch(`${API_URL}/admin/withdrawals/${id}/approve`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status: 'approved' } : w));
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm('Reject and refund this withdrawal?')) return;
    setProcessingId(id);
    try {
      const res = await fetch(`${API_URL}/admin/withdrawals/${id}/reject`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        setWithdrawals(prev => prev.filter(w => w.id !== id));
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const now = new Date();
  const filteredWithdrawals = withdrawals.filter(w => {
    if (w.status !== activeTab) return false;
    if (timeFilter === 'all') return true;
    const date = new Date(w.created_at);
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (timeFilter === 'today') return diffDays <= 1;
    if (timeFilter === 'week') return diffDays <= 7;
    if (timeFilter === 'month') return diffDays <= 30;
    if (timeFilter === '3months') return diffDays <= 90;
    if (timeFilter === '6months') return diffDays <= 180;
    if (timeFilter === 'year') return diffDays <= 365;
    return true;
  });

  const pendingCount = withdrawals.filter(w => w.status === 'pending').length;

  return (
    <div className="min-h-screen bg-slate-50 ">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-4 pt-6 pb-5 sticky top-0 z-10 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Link to={user?.role === 'worker' ? '/worker' : '/admin'} className="text-white/80 hover:text-white p-1"><ArrowLeft size={22} /></Link>
            <div>
              <h1 className="text-xl font-black text-white">Withdrawals</h1>
              <p className="text-rose-200 text-xs">{pendingCount} pending</p>
            </div>
          </div>
          <button onClick={fetchWithdrawals} className="text-white/80 hover:text-white p-2 rounded-xl bg-white /10">
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-black/20 rounded-xl p-1 gap-1">
          {[
            { key: 'pending', label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
            { key: 'approved', label: 'Approved History' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-white bg-white/10 hover:bg-white/20'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time Filter */}
      <div className="overflow-x-auto px-4 py-3 flex gap-2 no-scrollbar">
        {timeFilters.map(f => (
          <button
            key={f.id}
            onClick={() => setTimeFilter(f.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              timeFilter === f.id
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white  text-slate-600  border border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 pb-8 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center py-16 space-y-3">
            <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading withdrawals...</p>
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Clock size={48} className="mb-3 opacity-30" />
            <p className="font-bold text-slate-500 ">No {activeTab} withdrawals</p>
            <p className="text-sm mt-1">
              {activeTab === 'pending' ? 'All caught up!' : 'No history for this period'}
            </p>
          </div>
        ) : (
          filteredWithdrawals.map(w => {
            const type = w.withdrawal_methods?.type || 'unknown';
            const badgeColor = typeBadgeColors[type] || 'bg-slate-100  text-slate-600 ';
            const methodLabel = typeLabels[type] || type.toUpperCase();
            const isProcessing = processingId === w.id;

            return (
              <div key={w.id} className="bg-white  rounded-2xl shadow-sm border border-gray-100  overflow-hidden">
                {/* Top row */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-50">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-slate-100  rounded-full flex items-center justify-center font-black text-slate-600  text-sm">
                      {(w.users?.first_name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-black text-slate-800  text-sm">{w.users?.first_name || 'Unknown'}</p>
                      {w.users?.username && (
                        <p className="text-xs text-slate-400">@{w.users.username}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-800  text-lg">{Number(w.amount).toLocaleString('en-US')} <span className="text-sm font-bold text-slate-500 ">ETB</span></p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{methodLabel}</span>
                  </div>
                </div>

                {/* Account details */}
                <div className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center space-x-2 text-slate-600 ">
                    <User size={13} className="text-slate-400" />
                    <span className="text-xs font-semibold">{w.account_name}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 ">
                    <div className="flex items-center space-x-2">
                      <Phone size={13} className="text-slate-400" />
                      <span className="text-xs font-mono font-bold">{w.account_number}</span>
                    </div>
                    <button
                      onClick={() => handleCopy(w.account_number, w.id)}
                      className="p-1.5 rounded-lg bg-slate-50  text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      {copiedId === w.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">{timeAgo(w.created_at)}</p>
                </div>

                {/* Action buttons — only for pending */}
                {w.status === 'pending' && (
                  <div className="grid grid-cols-2 gap-0 border-t border-gray-100 ">
                    <button
                      onClick={() => handleApprove(w.id)}
                      disabled={isProcessing}
                      className="flex items-center justify-center space-x-1.5 py-3 text-emerald-600 font-black text-sm hover:bg-emerald-50 transition-colors border-r border-gray-100  active:scale-95 disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} />
                      <span>{isProcessing ? '...' : 'Approve'}</span>
                    </button>
                    <button
                      onClick={() => handleReject(w.id)}
                      disabled={isProcessing}
                      className="flex items-center justify-center space-x-1.5 py-3 text-rose-600 font-black text-sm hover:bg-rose-50 transition-colors active:scale-95 disabled:opacity-50"
                    >
                      <XCircle size={16} />
                      <span>{isProcessing ? '...' : 'Reject'}</span>
                    </button>
                  </div>
                )}

                {/* Approved badge */}
                {w.status === 'approved' && (
                  <div className="flex items-center justify-center space-x-1.5 py-3 border-t border-gray-50 text-emerald-600 text-xs font-black">
                    <CheckCircle2 size={14} />
                    <span>Approved</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
