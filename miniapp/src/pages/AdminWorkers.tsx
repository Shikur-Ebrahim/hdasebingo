import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { ArrowLeft, UserCog, ShieldCheck, Search } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface WorkerPerms {
  deposits: boolean;
  withdrawals: boolean;
  users: boolean;
  settings: boolean;
  reports: boolean;
  games: boolean;
}

interface WorkerData {
  id: string;
  telegram_id: string;
  username: string;
  first_name: string;
  status: string;
  permissions: WorkerPerms;
  created_at: string;
}

const PERMISSIONS_DEF = [
  { key: 'deposits', label: 'Verify Deposits' },
  { key: 'withdrawals', label: 'Verify Withdrawals' },
  { key: 'users', label: 'Manage Users' },
  { key: 'reports', label: 'View Tx Reports' },
  { key: 'games', label: 'View Games Report' },
  { key: 'settings', label: 'Manage Settings' },
];

export default function AdminWorkers() {
  const { user } = useGameStore();
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const getHeaders = () => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    return { 'Content-Type': 'application/json', 'x-telegram-init-data': initData };
  };

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchWorkers = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/workers`, { headers: getHeaders() });
      if (res.ok) {
        const d = await res.json();
        setWorkers(d.workers || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  const togglePermission = async (telegramId: string, currentPerms: WorkerPerms, key: keyof WorkerPerms) => {
    setSaving(telegramId);
    try {
      const newPerms = { ...currentPerms, [key]: !currentPerms[key] };
      const res = await fetch(`${API_URL}/admin/workers/${telegramId}/permissions`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ permissions: newPerms }),
      });
      const d = await res.json();
      if (res.ok) {
        setWorkers(prev => prev.map(w => w.telegram_id === telegramId ? { ...w, permissions: newPerms } : w));
        showToast('success', 'Permissions updated');
      } else {
        showToast('error', d.error || 'Failed to update');
      }
    } catch {
      showToast('error', 'Network error');
    } finally {
      setSaving(null);
    }
  };

  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg font-bold text-[11px] animate-bounce-in ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center justify-between shadow-sm relative z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <Link to="/admin" className="p-2 bg-slate-100 rounded-full text-slate-600 active:scale-95 transition-all">
            <ArrowLeft size={18} strokeWidth={2.5} />
          </Link>
          <div>
            <h1 className="font-black text-slate-800 text-lg">Workers ({workers.length})</h1>
            <p className="text-[10px] text-slate-400 font-medium">Manage permissions</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin mb-3"></div>
            <p className="text-xs font-bold">Loading workers...</p>
          </div>
        ) : workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <UserCog size={48} strokeWidth={1} className="mb-3 opacity-20" />
            <p className="text-sm font-bold text-slate-500 mb-1">No workers found</p>
            <p className="text-xs text-center px-4">Change a user's role to 'worker' in the Users tab first.</p>
          </div>
        ) : (
          workers.map(w => (
            <div key={w.telegram_id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-black uppercase">
                    {w.first_name[0]}
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <h2 className="font-black text-sm text-slate-800">{w.first_name}</h2>
                      {w.status === 'inactive' && <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-black">Inactive</span>}
                    </div>
                    <p className="text-[10px] font-medium text-slate-400">@{w.username} • ID: {w.telegram_id}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Permissions</p>
                <div className="grid grid-cols-2 gap-2">
                  {PERMISSIONS_DEF.map(p => {
                    const hasPerm = w.permissions?.[p.key as keyof WorkerPerms];
                    return (
                      <button
                        key={p.key}
                        disabled={saving === w.telegram_id}
                        onClick={() => togglePermission(w.telegram_id, w.permissions || {} as WorkerPerms, p.key as keyof WorkerPerms)}
                        className={`flex items-center justify-between p-2 rounded-xl text-left transition-all border ${hasPerm ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                      >
                        <span className="text-[10px] font-bold truncate pr-2">{p.label}</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${hasPerm ? 'bg-orange-500 text-white' : 'bg-slate-200 text-transparent'}`}>
                          <ShieldCheck size={10} strokeWidth={3} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
