import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';
import {
  Megaphone,
  Search,
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Percent,
  Check,
  Wallet,
  Zap,
  TrendingUp,
  X,
  ExternalLink,
  ChevronDown
} from 'lucide-react';

interface PromotedRoom {
  id: string;
  room_name: string;
  agent_id?: string;
  agent_name?: string;
  status: 'active' | 'inactive' | 'paused';
  total_games: number;
  commission_rate?: number;
  promoter_commission_rate?: number;
}

interface PromoterUser {
  id: string;
  telegram_id: string;
  username: string;
  first_name: string;
  role: string;
  status: string;
  main_balance: number;
  bonus_balance: number;
  created_at: string;
  rooms?: PromotedRoom[];
  total_rooms?: number;
  total_invited?: number;
}

interface AvailableRoom {
  id: string;
  room_name: string;
  agent_name?: string;
  status: string;
  promoter_id?: string | null;
  promoter_commission_rate?: number;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';
// Promoter commission rate (default 3%)

export default function AdminPromoters() {
  const { user } = useGameStore();
  const [telegramIdInput, setTelegramIdInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedUser, setSearchedUser] = useState<PromoterUser | null>(null);

  // Assign room to promoter form
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [promoterCommRate, setPromoterCommRate] = useState<number>(3); // default 3%
  const [assigning, setAssigning] = useState(false);

  // All promoters
  const [promoters, setPromoters] = useState<PromoterUser[]>([]);
  const [loadingPromoters, setLoadingPromoters] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Edit room promoter modal
  const [editingRoom, setEditingRoom] = useState<AvailableRoom | null>(null);
  const [editPromoterId, setEditPromoterId] = useState('');
  const [editCommissionRate, setEditCommissionRate] = useState<number>(3);
  const [savingEdit, setSavingEdit] = useState(false);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'x-telegram-init-data': typeof WebApp !== 'undefined' ? WebApp.initData : '',
  });

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPromoters = async () => {
    setLoadingPromoters(true);
    try {
      const res = await fetch(`${API_URL}/admin/promoters`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPromoters(data.promoters || []);
      }
    } catch {
      showToast('error', 'Failed to load promoters');
    } finally {
      setLoadingPromoters(false);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/rooms`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAvailableRooms(data.rooms || []);
        if (data.rooms && data.rooms.length > 0 && !selectedRoomId) {
          setSelectedRoomId(data.rooms[0].id);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchPromoters();
    fetchRooms();
  }, []);

  const handleSearchUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const tid = telegramIdInput.trim();
    if (!tid) return;

    setSearchLoading(true);
    setSearchedUser(null);
    try {
      const res = await fetch(`${API_URL}/admin/agents/search/${tid}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSearchedUser(data.user);
      } else {
        const err = await res.json();
        showToast('error', err.error || 'User not found');
      }
    } catch {
      showToast('error', 'Search failed. Network error.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSetRolePromoter = async () => {
    if (!searchedUser) return;
    try {
      const res = await fetch(`${API_URL}/admin/users/${searchedUser.telegram_id}/role`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ role: 'promoter' })
      });
      if (res.ok) {
        showToast('success', `Assigned Promoter role to ${searchedUser.first_name}!`);
        setSearchedUser({ ...searchedUser, role: 'promoter' });
        fetchPromoters();
      } else {
        showToast('error', 'Failed to update role');
      }
    } catch {
      showToast('error', 'Network error');
    }
  };

  const handleAssignRoomToPromoter = async () => {
    if (!searchedUser || !selectedRoomId) return;
    setAssigning(true);
    try {
      const res = await fetch(`${API_URL}/admin/promoters/assign-room`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          roomId: selectedRoomId,
          promoterId: searchedUser.id, // Store promoter UUID!
          promoter_commission_rate: Number(promoterCommRate) || 3,
        })
      });
      if (res.ok) {
        showToast('success', `Room linked to promoter with ${promoterCommRate}% commission!`);
        fetchPromoters();
        fetchRooms();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to assign room');
      }
    } catch {
      showToast('error', 'Network error');
    } finally {
      setAssigning(false);
    }
  };

  const handleSaveRoomEdit = async () => {
    if (!editingRoom) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${API_URL}/admin/rooms/${editingRoom.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          promoter_id: editPromoterId.trim() || null,
          promoter_commission_rate: Number(editCommissionRate) || 3,
        })
      });
      if (res.ok) {
        showToast('success', 'Room promoter configuration updated!');
        setEditingRoom(null);
        fetchPromoters();
        fetchRooms();
      } else {
        showToast('error', 'Failed to update room');
      }
    } catch {
      showToast('error', 'Network error');
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredPromoters = promoters.filter(p => {
    const q = searchFilter.toLowerCase();
    return (
      p.first_name?.toLowerCase().includes(q) ||
      p.username?.toLowerCase().includes(q) ||
      p.telegram_id?.includes(q) ||
      p.id?.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20 select-none">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className={`px-4 py-2.5 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-black text-white ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-30 px-4 py-3 shadow-2xs">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-violet-600 to-purple-500 text-white flex items-center justify-center shadow-sm">
              <Megaphone size={18} />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 leading-tight">Promoter Management</h1>
              <p className="text-[10px] text-slate-400 font-medium">Room recruitment & 3% default commission</p>
            </div>
          </div>
          <button
            onClick={() => { fetchPromoters(); fetchRooms(); }}
            disabled={loadingPromoters}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all"
            title="Refresh"
          >
            <RefreshCw size={14} className={loadingPromoters ? 'animate-spin text-purple-600' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* ─── SEARCH / ASSIGN PROMOTER CARD ─── */}
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center space-x-1">
              <Search size={13} className="text-violet-500" />
              <span>Search & Assign Promoter</span>
            </span>
            <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
              ⚡ 3% Default Commission
            </span>
          </div>

          <form onSubmit={handleSearchUser} className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter Telegram ID..."
              value={telegramIdInput}
              onChange={(e) => setTelegramIdInput(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-violet-500 font-mono"
            />
            <button
              type="submit"
              disabled={searchLoading || !telegramIdInput.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl text-xs font-black active:scale-95 disabled:opacity-50 transition-all flex items-center space-x-1 shadow-sm"
            >
              {searchLoading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
              <span>Search</span>
            </button>
          </form>

          {/* User Result */}
          {searchedUser && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-purple-500 text-white font-black text-sm flex items-center justify-center shrink-0">
                    {(searchedUser.first_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">{searchedUser.first_name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">TG: {searchedUser.telegram_id}</p>
                    <p className="text-[9px] text-slate-400 font-mono truncate">UUID: {searchedUser.id}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    searchedUser.role === 'promoter'
                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    <ShieldCheck size={11} />
                    <span>{searchedUser.role}</span>
                  </span>
                  <p className="text-[10px] font-black text-emerald-600 mt-1">
                    {Number(searchedUser.main_balance || 0).toLocaleString()} ETB
                  </p>
                </div>
              </div>

              {/* Action buttons if not promoter */}
              {searchedUser.role !== 'promoter' ? (
                <button
                  type="button"
                  onClick={handleSetRolePromoter}
                  className="w-full py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-xs font-black active:scale-95 transition-all shadow-sm"
                >
                  Promote to Promoter (Role: promoter)
                </button>
              ) : (
                <div className="space-y-2.5 pt-1 border-t border-slate-200">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Link a Room to this Promoter
                  </label>
                  
                  <select
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-violet-500"
                  >
                    {availableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room_name} ({r.agent_name || 'Agent'}) — Status: {r.status}
                      </option>
                    ))}
                  </select>

                  {/* Promoter Commission Rate % - Clean Number Input */}
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50/50 p-3.5 rounded-2xl border border-violet-200/70 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
                          <Percent size={13} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800">Promoter Commission</p>
                          <p className="text-[9px] text-slate-400 font-medium">From platform's 20% house fee</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-violet-700 bg-violet-100 px-2.5 py-0.5 rounded-full border border-violet-200">
                        {promoterCommRate || 0}% of pot
                      </span>
                    </div>

                    {/* Free-form number input */}
                    <div className="flex items-center space-x-2.5 bg-white rounded-xl border border-violet-200 px-3 py-2 shadow-xs">
                      <Percent size={13} className="text-violet-500 shrink-0" />
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        value={promoterCommRate}
                        onChange={e => setPromoterCommRate(Math.min(20, Math.max(0, Number(e.target.value))))}
                        className="flex-1 bg-transparent outline-none text-xs font-black text-slate-800 placeholder-slate-300"
                        placeholder="3"
                      />
                      <span className="text-[11px] font-bold text-slate-400">% (Default: 3)</span>
                    </div>

                    <p className="text-[9px] text-slate-400 font-medium leading-tight">
                      ℹ️ Commission is automatically credited to the promoter's wallet after each completed game.
                    </p>
                  </div>

                  <button
                    onClick={handleAssignRoomToPromoter}
                    disabled={assigning || !selectedRoomId}
                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-black active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    {assigning ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                    <span>Link Room & Set Commission</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── ALL PROMOTERS DASHBOARD ─── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider">
              Registered Promoters ({promoters.length})
            </h2>
            <span className="text-[10px] font-bold text-slate-400">
              ⚡ Default: 3%
            </span>
          </div>

          {/* Search filter */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter promoters..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-violet-500"
            />
          </div>

          {loadingPromoters ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-20 bg-slate-100 rounded-2xl" />
              <div className="h-20 bg-slate-100 rounded-2xl" />
            </div>
          ) : filteredPromoters.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center text-slate-400">
              <Megaphone size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-black text-slate-700">No Promoters Found</p>
              <p className="text-[10px] text-slate-400 mt-1">Search a user by Telegram ID above to assign the promoter role.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredPromoters.map((promoter) => (
                <div
                  key={promoter.id}
                  className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center font-black text-xs shrink-0">
                        {(promoter.first_name || 'P').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <p className="text-xs font-black text-slate-900 truncate">{promoter.first_name}</p>
                          <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                            Promoter
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {promoter.username ? `@${promoter.username}` : `TG: ${promoter.telegram_id}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-emerald-600">
                        {Number(promoter.main_balance || 0).toLocaleString()} ETB
                      </p>
                      <p className="text-[9px] text-slate-400 font-medium">Wallet Balance</p>
                    </div>
                  </div>

                  {/* Metrics bar */}
                  <div className="grid grid-cols-2 gap-2 text-center text-[10px] bg-slate-50 p-2 rounded-xl">
                    <div>
                      <p className="text-slate-400 font-bold uppercase text-[8px]">Promoted Rooms</p>
                      <p className="font-black text-violet-700 text-xs">{promoter.total_rooms || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-bold uppercase text-[8px]">Referred Players</p>
                      <p className="font-black text-slate-800 text-xs">{promoter.total_invited || 0}</p>
                    </div>
                  </div>

                  {/* Linked Rooms list */}
                  {promoter.rooms && promoter.rooms.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Linked Rooms:</p>
                      {promoter.rooms.map((rm) => (
                        <div
                          key={rm.id}
                          className="flex items-center justify-between bg-violet-50/50 border border-violet-100 px-2.5 py-1.5 rounded-xl text-[10px]"
                        >
                          <div className="flex items-center space-x-1.5 truncate mr-2">
                            <Building2 size={11} className="text-violet-600 shrink-0" />
                            <span className="font-bold text-slate-800 truncate">{rm.room_name}</span>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            <span className="font-black text-violet-700 bg-white px-1.5 py-0.5 rounded-md border border-violet-200">
                              ⚡ {rm.promoter_commission_rate ?? 3}%
                            </span>
                            <button
                              onClick={() => {
                                setEditingRoom(rm as any);
                                setEditPromoterId(promoter.id);
                                setEditCommissionRate(rm.promoter_commission_rate ?? 3);
                              }}
                              className="text-[9px] font-bold text-slate-500 hover:text-slate-800 underline"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── EDIT ROOM PROMOTER MODAL ─── */}
      {editingRoom && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-3.5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center space-x-2">
                <Building2 size={16} className="text-violet-600" />
                <h3 className="text-sm font-black text-slate-900">{editingRoom.room_name}</h3>
              </div>
              <button
                onClick={() => setEditingRoom(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X size={14} />
              </button>
            </div>

            {/* Promoter UUID Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">
                Promoter UUID
              </label>
              <input
                type="text"
                value={editPromoterId}
                onChange={(e) => setEditPromoterId(e.target.value)}
                placeholder="Promoter UUID (leave blank to unlink)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-violet-500"
              />
            </div>

            {/* Commission Rate - Clean Number Input */}
            <div className="bg-gradient-to-br from-violet-50 to-purple-50/50 p-3.5 rounded-2xl border border-violet-200/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
                    <Percent size={13} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Promoter Commission</p>
                    <p className="text-[9px] text-slate-400 font-medium">From platform's 20% house fee</p>
                  </div>
                </div>
                <span className="text-xs font-black text-violet-700 bg-violet-100 px-2.5 py-0.5 rounded-full border border-violet-200">
                  {editCommissionRate || 0}% of pot
                </span>
              </div>

              {/* Free-form number input */}
              <div className="flex items-center space-x-2.5 bg-white rounded-xl border border-violet-200 px-3 py-2 shadow-xs">
                <Percent size={13} className="text-violet-500 shrink-0" />
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={editCommissionRate}
                  onChange={e => setEditCommissionRate(Math.min(20, Math.max(0, Number(e.target.value))))}
                  className="flex-1 bg-transparent outline-none text-xs font-black text-slate-800 placeholder-slate-300"
                  placeholder="3"
                />
                <span className="text-[11px] font-bold text-slate-400">% (Default: 3)</span>
              </div>

              <p className="text-[9px] text-slate-400 font-medium leading-tight">
                ℹ️ Automatically applies to all future game pots in this room.
              </p>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-black active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRoomEdit}
                disabled={savingEdit}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all flex items-center justify-center space-x-1 shadow-sm"
              >
                {savingEdit ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
