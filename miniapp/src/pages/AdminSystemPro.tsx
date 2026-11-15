import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Search,
  Filter,
  Eye,
  X,
  AlertCircle,
  Building2,
  Calendar,
  DollarSign
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface ProRequest {
  id: string;
  room_id: string;
  room_name: string;
  agent_id: string;
  agent_name: string;
  bank_type: string;
  account_name: string;
  account_number: string;
  amount: number;
  screenshot_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export default function AdminSystemPro() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ProRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [search, setSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Review action modal state
  const [selectedRequest, setSelectedRequest] = useState<ProRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    try {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred(type);
      }
    } catch {}
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/system-players/admin/requests?status=${filter}`, {
        headers: { 'x-telegram-init-data': initData },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const handleReview = async (id: string, action: 'approve' | 'reject', reason?: string) => {
    triggerHaptic('heavy');
    setActionLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/system-players/admin/requests/${id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({ action, reason }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Action failed');
      }

      setToastMsg({
        type: 'success',
        text: action === 'approve' ? '🎉 Pro Level 1 Approved & Activated!' : 'Request Rejected',
      });
      setTimeout(() => setToastMsg(null), 3000);
      setShowRejectModal(false);
      setSelectedRequest(null);
      setRejectReason('');
      fetchRequests();
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message || 'Action failed' });
      setTimeout(() => setToastMsg(null), 3500);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.room_name && r.room_name.toLowerCase().includes(q)) ||
      (r.agent_name && r.agent_name.toLowerCase().includes(q)) ||
      (r.bank_type && r.bank_type.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/admin')}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-90 transition-all"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <Bot size={18} className="text-amber-500" />
              <h2 className="font-black text-sm text-slate-800">System Pro Requests</h2>
            </div>
            <p className="text-[10px] text-slate-400 font-bold">Review & activate Room Pro Level 1</p>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div
          className={`mx-4 mt-3 p-3 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-md animate-in fade-in ${
            toastMsg.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {toastMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                triggerHaptic('light');
                setFilter(tab);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                filter === tab
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search room name or agent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Requests List */}
      <div className="px-4 space-y-3">
        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">Loading requests...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400 bg-white rounded-3xl border border-slate-100 p-8 space-y-2">
            <Bot size={28} className="mx-auto text-slate-300" />
            <p>No {filter !== 'all' ? filter : ''} System Pro upgrade requests found.</p>
          </div>
        ) : (
          filteredRequests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3"
            >
              {/* Top row: Room & Status */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-xs text-slate-900">{req.room_name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase bg-indigo-50 text-indigo-700">
                      {req.bank_type}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    Agent: {req.agent_name} • {new Date(req.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  {req.status === 'pending' && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-800 flex items-center gap-1">
                      <Clock size={10} /> Pending
                    </span>
                  )}
                  {req.status === 'approved' && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 size={10} /> Approved
                    </span>
                  )}
                  {req.status === 'rejected' && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-100 text-rose-800 flex items-center gap-1">
                      <XCircle size={10} /> Rejected
                    </span>
                  )}
                </div>
              </div>

              {/* Amount & Account */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Transfer Amount:</span>
                <span className="text-sm font-black text-amber-600">{req.amount} ETB</span>
              </div>

              {/* Screenshot Preview */}
              {req.screenshot_url && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center space-x-2">
                    <img
                      src={req.screenshot_url}
                      alt="Transfer Proof"
                      className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer"
                      onClick={() => setPreviewImage(req.screenshot_url)}
                    />
                    <div className="text-[10px] text-slate-500 font-bold">
                      <p>Payment Screenshot</p>
                      <button
                        onClick={() => setPreviewImage(req.screenshot_url)}
                        className="text-indigo-600 hover:underline flex items-center gap-0.5 mt-0.5"
                      >
                        <Eye size={10} /> View Full Image
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Rejection reason if any */}
              {req.status === 'rejected' && req.rejection_reason && (
                <div className="p-2 rounded-xl bg-rose-50 text-rose-700 text-[10px] font-bold">
                  Reason: {req.rejection_reason}
                </div>
              )}

              {/* Action Buttons for Pending */}
              {req.status === 'pending' && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleReview(req.id, 'approve')}
                    className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    <span>Approve (Activate Pro)</span>
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => {
                      setSelectedRequest(req);
                      setShowRejectModal(true);
                    }}
                    className="py-2.5 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <XCircle size={14} />
                    <span>Reject</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Reject Reason Modal */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">Reject Upgrade Request</h3>
              <button
                onClick={() => setShowRejectModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Provide a reason for rejecting the Pro upgrade request for <b>{selectedRequest.room_name}</b>:
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Invalid transaction screenshot, amount mismatch..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-rose-500"
            />
            <div className="flex items-center gap-2">
              <button
                disabled={actionLoading}
                onClick={() => setShowRejectModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 font-black text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={() => handleReview(selectedRequest.id, 'reject', rejectReason)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-black text-xs shadow-xs"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Image Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/90 backdrop-blur-md animate-in fade-in cursor-pointer"
        >
          <div className="relative max-w-md w-full max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center"
            >
              <X size={18} />
            </button>
            <img
              src={previewImage}
              alt="Proof"
              className="max-h-[85vh] w-auto object-contain rounded-2xl shadow-2xl border border-white/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}
