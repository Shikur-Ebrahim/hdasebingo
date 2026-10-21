/**
 * AdminAgentWithdrawals — Dedicated Admin Management Page for Agent Withdrawals
 * Route: /admin/agent-withdrawals
 * Completely independent from standard user withdrawals!
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  RefreshCw,
  Copy,
  Check,
  Building2,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API = import.meta.env.VITE_API_URL || '/api';

interface AgentWithdrawal {
  id: string;
  telegram_id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  created_at: string;
  processed_at?: string;
  users?: {
    first_name: string;
    username?: string;
    role?: string;
    main_balance?: number;
  };
}

export default function AdminAgentWithdrawals() {
  const { user } = useGameStore();
  const [withdrawals, setWithdrawals] = useState<AgentWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
      WebApp.HapticFeedback.impactOccurred(style);
    }
  };

  const handleCopy = (text: string, key: string) => {
    haptic('light');
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getHeaders = () => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    return { 'Content-Type': 'application/json', 'x-telegram-init-data': initData };
  };

  const fetchWithdrawals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/admin/agent-withdrawals/list?status=${activeTab}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setWithdrawals(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-10 text-center font-bold text-slate-600">
        Access Denied. Admin role only.
      </div>
    );
  }

  // Approve Payout
  const handleApprove = async (id: string, amount: number) => {
    if (!window.confirm(`Approve payout of ${amount.toLocaleString()} ETB for this agent?`)) return;
    setProcessingId(id);
    haptic('heavy');
    try {
      const res = await fetch(`${API}/admin/agent-withdrawals/approve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status: 'approved' } : w));
        if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
          WebApp.HapticFeedback.notificationOccurred('success');
        }
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch {
      alert('Network error.');
    } finally {
      setProcessingId(null);
    }
  };

  // Reject & Refund
  const handleRejectSubmit = async () => {
    if (!rejectModalId) return;
    setProcessingId(rejectModalId);
    haptic('heavy');
    try {
      const res = await fetch(`${API}/admin/agent-withdrawals/reject`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          id: rejectModalId,
          admin_note: rejectReason.trim() || 'Rejected by admin',
        }),
      });
      if (res.ok) {
        setWithdrawals(prev =>
          prev.map(w =>
            w.id === rejectModalId
              ? { ...w, status: 'rejected', admin_note: rejectReason.trim() || 'Rejected by admin' }
              : w
          )
        );
        setRejectModalId(null);
        setRejectReason('');
        if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
          WebApp.HapticFeedback.notificationOccurred('success');
        }
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch {
      alert('Network error.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20 select-none font-sans">
      {/* ── Top Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-3.5 sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center space-x-3">
            <Link
              to="/admin"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-tight">
                Agent & Promoter Withdrawals
              </h1>
              <p className="text-[10px] font-bold text-slate-400">
                Official Agent & Promoter commission payouts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchWithdrawals}
            disabled={loading}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-amber-500' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* ── Filter Tabs ── */}
        <div className="flex bg-slate-200/80 p-1 rounded-2xl space-x-1 text-xs font-black">
          {(['pending', 'approved', 'rejected', 'all'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                haptic('light');
                setActiveTab(tab);
              }}
              className={`flex-1 py-2 rounded-xl transition-all capitalize ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── List Content ── */}
        {loading && withdrawals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RefreshCw size={28} className="animate-spin text-amber-500" />
            <p className="text-xs font-bold text-slate-400">Loading agent payouts...</p>
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-slate-100 text-center space-y-3 shadow-2xs">
            <Building2 size={36} className="mx-auto text-slate-300" />
            <p className="text-sm font-black text-slate-800">No {activeTab} agent withdrawals</p>
            <p className="text-xs text-slate-400">
              Agent withdrawal requests will appear here when submitted.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {withdrawals.map(w => {
              const isPending = w.status === 'pending';
              const isApproved = w.status === 'approved';
              const isRejected = w.status === 'rejected';
              const userRole = (w.users?.role || '').toLowerCase();
              const isPromoter = userRole === 'promoter';
              const roleTitle = isPromoter ? 'PROMOTER' : 'AGENT';

              return (
                <div
                  key={w.id}
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 transition-all"
                >
                  {/* Top: Profile & Amount */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-2xl ${
                        isPromoter
                          ? 'bg-gradient-to-tr from-purple-500 to-indigo-500'
                          : 'bg-gradient-to-tr from-amber-500 to-orange-500'
                      } text-white flex items-center justify-center font-black text-sm shadow-xs`}>
                        {(w.users?.first_name || (isPromoter ? 'P' : 'A')).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <p className="text-sm font-black text-slate-900 leading-tight">
                            {w.users?.first_name || (isPromoter ? 'Promoter' : 'Agent')}
                          </p>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${
                            isPromoter
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {roleTitle}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-bold mt-0.5">
                          {w.users?.username ? `@${w.users.username}` : `ID: ${w.telegram_id}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-black text-slate-900 leading-none">
                        {Number(w.amount).toLocaleString()} <span className="text-xs font-bold text-slate-400">ETB</span>
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full mt-1.5 capitalize ${
                          isApproved
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isRejected
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                        }`}
                      >
                        {isApproved && <CheckCircle2 size={10} />}
                        {isRejected && <XCircle size={10} />}
                        {isPending && <Clock size={10} />}
                        {w.status}
                      </span>
                    </div>
                  </div>

                  {/* Destination Bank Details Card */}
                  <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-100 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold text-[11px]">Bank:</span>
                      <span className="font-black text-slate-900">{w.bank_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold text-[11px]">Account Holder:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-slate-900">{w.account_holder_name}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(w.account_holder_name, `${w.id}-holder`)}
                          className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 active:scale-95"
                          title="Copy Holder Name"
                        >
                          {copiedField === `${w.id}-holder` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold text-[11px]">Account Number:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-slate-900 select-all">
                          {w.account_number}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(w.account_number, `${w.id}-acc`)}
                          className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 active:scale-95"
                          title="Copy Account Number"
                        >
                          {copiedField === `${w.id}-acc` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Note / Rejection reason */}
                  {w.admin_note && (
                    <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 rounded-xl px-3 py-1.5 border border-rose-100">
                      📝 {w.admin_note}
                    </p>
                  )}

                  {/* Footer & Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400 font-bold">
                      {new Date(w.created_at).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {/* Pending Action Buttons */}
                    {isPending && (
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          disabled={processingId === w.id}
                          onClick={() => {
                            setRejectModalId(w.id);
                            setRejectReason('');
                          }}
                          className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-black text-xs active:scale-95 transition-all"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={processingId === w.id}
                          onClick={() => handleApprove(w.id, Number(w.amount))}
                          className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-xs shadow-xs hover:from-emerald-600 hover:to-teal-600 active:scale-95 transition-all flex items-center gap-1"
                        >
                          {processingId === w.id ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={13} />
                          )}
                          <span>Approve</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Reject Modal Sheet ── */}
      {rejectModalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setRejectModalId(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">
                Reject Agent Withdrawal
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                The amount will be automatically refunded back to the agent's main balance.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Reason / Note (Sent to Agent)
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Account number mismatch, please check"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalId(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingId === rejectModalId}
                onClick={handleRejectSubmit}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs active:scale-95 transition-all"
              >
                {processingId === rejectModalId ? 'Rejecting...' : 'Reject & Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
