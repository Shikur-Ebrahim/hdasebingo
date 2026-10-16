import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Search,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  Pin,
  PinOff,
  DoorOpen,
  DollarSign,
  Users,
  Gamepad2,
  X,
  Sparkles,
  Percent,
  Check
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface AgentRoom {
  id: string;
  room_name: string;
  agent_id: string;
  agent_name?: string;
  total_players: number;
  total_games: number;
  status: 'active' | 'inactive' | 'paused';
  commission_rate?: number;
  is_pinned?: boolean;
  agent_balance?: number;
  created_at: string;
}

interface AgentUser {
  id: string;
  telegram_id: string;
  username: string;
  first_name: string;
  role: string;
  status: string;
  main_balance: number;
  bonus_balance: number;
  total_wins: number;
  created_at: string;
  room?: AgentRoom | null;
}

const COMMISSION_PRESETS = [5, 8, 10, 12, 15, 20];

export default function AdminAgents() {
  const { user } = useGameStore();
  const [telegramIdInput, setTelegramIdInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedUser, setSearchedUser] = useState<AgentUser | null>(null);
  const [searchedRoom, setSearchedRoom] = useState<AgentRoom | null>(null);

  // Assign room form state
  const [newRoomName, setNewRoomName] = useState('');
  const [newCommissionRate, setNewCommissionRate] = useState<number>(8); // default 8%
  const [newIsPinned, setNewIsPinned] = useState(false); // default not pinned
  const [assigning, setAssigning] = useState(false);

  // All rooms & filter state
  const [allRooms, setAllRooms] = useState<AgentRoom[]>([]);
  const [allAgents, setAllAgents] = useState<AgentUser[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomFilter, setRoomFilter] = useState<'all' | 'active' | 'pinned' | 'inactive'>('all');
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Edit room modal state
  const [editingRoom, setEditingRoom] = useState<AgentRoom | null>(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomStatus, setEditRoomStatus] = useState<'active' | 'inactive' | 'paused'>('active');
  const [editCommissionRate, setEditCommissionRate] = useState<number>(8);
  const [editIsPinned, setEditIsPinned] = useState(false);
  const [editRoomGames, setEditRoomGames] = useState('0');
  const [savingEdit, setSavingEdit] = useState(false);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'x-telegram-init-data': typeof WebApp !== 'undefined' ? WebApp.initData : '',
  });

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRoomsAndAgents = async () => {
    setLoadingRooms(true);
    try {
      const [roomsRes, agentsRes] = await Promise.all([
        fetch(`${API_URL}/admin/rooms`, { headers: getHeaders() }),
        fetch(`${API_URL}/admin/agents`, { headers: getHeaders() })
      ]);

      if (roomsRes.ok) {
        const data = await roomsRes.json();
        setAllRooms(data.rooms || []);
      }
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAllAgents(data.agents || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchRoomsAndAgents();
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const tid = telegramIdInput.trim();
    if (!tid) return;

    setSearchLoading(true);
    setSearchedUser(null);
    setSearchedRoom(null);
    try {
      const res = await fetch(`${API_URL}/admin/agents/search/${tid}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSearchedUser(data.user);
        setSearchedRoom(data.room);
        setNewRoomName(`${data.user.first_name || data.user.username || 'Agent'}'s Room`);
        setNewCommissionRate(data.room?.commission_rate ?? 8);
        setNewIsPinned(Boolean(data.room?.is_pinned));
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

  const handlePromoteToAgent = async () => {
    if (!searchedUser) return;
    try {
      const res = await fetch(`${API_URL}/admin/users/${searchedUser.telegram_id}/role`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ role: 'agent' })
      });
      if (res.ok) {
        showToast('success', `Promoted ${searchedUser.first_name} to Agent!`);
        setSearchedUser({ ...searchedUser, role: 'agent' });
        fetchRoomsAndAgents();
      } else {
        showToast('error', 'Failed to update role');
      }
    } catch {
      showToast('error', 'Network error');
    }
  };

  const handleAssignRoom = async () => {
    if (!searchedUser) return;
    setAssigning(true);
    try {
      const res = await fetch(`${API_URL}/admin/agents/assign-room`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          telegramId: searchedUser.telegram_id,
          roomName: newRoomName.trim(),
          status: 'active',
          commission_rate: Number(newCommissionRate) || 8,
          is_pinned: Boolean(newIsPinned)
        })
      });

      if (res.ok) {
        const data = await res.json();
        showToast('success', `Room "${data.room.room_name}" successfully assigned with ${data.room.commission_rate ?? 8}% commission!`);
        setSearchedRoom(data.room);
        setSearchedUser({ ...searchedUser, role: 'agent' });
        fetchRoomsAndAgents();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to assign room');
      }
    } catch {
      showToast('error', 'Network error while assigning room');
    } finally {
      setAssigning(false);
    }
  };

  // Instant 1-tap Pin / Unpin toggle
  const handleTogglePin = async (room: AgentRoom) => {
    const nextPin = !room.is_pinned;
    try {
      const res = await fetch(`${API_URL}/admin/rooms/${room.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ is_pinned: nextPin })
      });
      if (res.ok) {
        showToast('success', nextPin ? `📌 Room "${room.room_name}" pinned to top!` : `Room "${room.room_name}" unpinned`);
        fetchRoomsAndAgents();
      } else {
        showToast('error', 'Failed to update pin state');
      }
    } catch {
      showToast('error', 'Network error');
    }
  };

  const handleToggleRoomStatus = async (room: AgentRoom) => {
    const nextStatus = room.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`${API_URL}/admin/rooms/${room.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        showToast('success', `Room set to ${nextStatus}`);
        if (searchedRoom && searchedRoom.id === room.id) {
          setSearchedRoom({ ...searchedRoom, status: nextStatus });
        }
        fetchRoomsAndAgents();
      }
    } catch {
      showToast('error', 'Failed to update room');
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to remove this assigned room?')) return;
    try {
      const res = await fetch(`${API_URL}/admin/rooms/${roomId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        showToast('success', 'Room removed successfully');
        if (searchedRoom && searchedRoom.id === roomId) {
          setSearchedRoom(null);
        }
        fetchRoomsAndAgents();
      }
    } catch {
      showToast('error', 'Failed to delete room');
    }
  };

  const openEditRoomModal = (room: AgentRoom) => {
    setEditingRoom(room);
    setEditRoomName(room.room_name);
    setEditRoomStatus(room.status);
    setEditCommissionRate(room.commission_rate ?? 8);
    setEditIsPinned(Boolean(room.is_pinned));
    setEditRoomGames(String(room.total_games || 0));
  };

  const handleSaveEditRoom = async () => {
    if (!editingRoom) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${API_URL}/admin/rooms/${editingRoom.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          room_name: editRoomName.trim(),
          status: editRoomStatus,
          commission_rate: Number(editCommissionRate) || 8,
          is_pinned: Boolean(editIsPinned),
          total_games: Number(editRoomGames) || 0,
        })
      });
      if (res.ok) {
        showToast('success', 'Room updated successfully!');
        setEditingRoom(null);
        fetchRoomsAndAgents();
      } else {
        showToast('error', 'Failed to update room');
      }
    } catch {
      showToast('error', 'Network error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Filter & Search rooms
  const filteredRooms = allRooms
    .filter(r => {
      if (roomFilter === 'active') return r.status === 'active';
      if (roomFilter === 'pinned') return r.is_pinned;
      if (roomFilter === 'inactive') return r.status !== 'active';
      return true;
    })
    .filter(r => {
      if (!roomSearchQuery.trim()) return true;
      const q = roomSearchQuery.toLowerCase();
      return (
        r.room_name.toLowerCase().includes(q) ||
        (r.agent_name || '').toLowerCase().includes(q) ||
        (r.agent_id || '').includes(q)
      );
    });

  const pinnedCount = allRooms.filter(r => r.is_pinned).length;
  const activeCount = allRooms.filter(r => r.status === 'active').length;

  if (!user || user.role !== 'admin') {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied! Admin only.</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-24 select-none">
      {/* TOAST */}
      {toast && (
        <div className={`fixed top-3 left-3 right-3 z-50 flex items-center space-x-2 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold text-white transition-all ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <div className="bg-white px-4 py-3.5 shadow-sm border-b border-gray-100 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center space-x-2.5">
          <Link to="/admin" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 active:bg-slate-200">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-black text-slate-800 leading-tight">Agent Rooms Center</h1>
            <p className="text-[10px] text-slate-400 font-medium">{allRooms.length} rooms · {pinnedCount} pinned</p>
          </div>
        </div>
        <button onClick={fetchRoomsAndAgents} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:bg-slate-200">
          <RefreshCw size={14} className={loadingRooms ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* ─── OVERVIEW METRICS ─── */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">Total Rooms</p>
            <p className="text-xl font-black text-slate-800 mt-0.5">{allRooms.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">Active</p>
            <p className="text-xl font-black text-emerald-600 mt-0.5">{activeCount}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-amber-200/80 bg-amber-50/40 shadow-sm text-center">
            <p className="text-[9px] font-bold text-amber-700 uppercase flex items-center justify-center space-x-1">
              <span>📌</span>
              <span>Pinned</span>
            </p>
            <p className="text-xl font-black text-amber-600 mt-0.5">{pinnedCount}</p>
          </div>
        </div>

        {/* ─── SEARCH & ASSIGN AGENT CARD ─── */}
        <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center shadow-xs">
              <Search size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800">Find & Assign Room to Agent</h2>
              <p className="text-[10px] text-slate-400">Search by Telegram ID to configure room, commission & pin status</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter Telegram ID (e.g. 7898071735)"
              value={telegramIdInput}
              onChange={e => setTelegramIdInput(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={searchLoading || !telegramIdInput.trim()}
              className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-black flex items-center space-x-1.5 active:scale-95 disabled:opacity-50 transition-all shadow-sm"
            >
              {searchLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              <span>Search</span>
            </button>
          </form>

          {/* SEARCH RESULT: USER & ASSIGN FORM */}
          {searchedUser && (
            <div className="mt-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-sm ${searchedUser.role === 'agent' ? 'bg-sky-600' : 'bg-slate-700'}`}>
                    {searchedUser.first_name ? searchedUser.first_name[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-black text-slate-800">{searchedUser.first_name}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${searchedUser.role === 'agent' ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'}`}>
                        {searchedUser.role}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">@{searchedUser.username || 'unknown'} · ID: {searchedUser.telegram_id}</p>
                  </div>
                </div>
                {searchedUser.role !== 'agent' && (
                  <button
                    onClick={handlePromoteToAgent}
                    className="px-2.5 py-1 bg-sky-600 text-white text-[10px] font-black rounded-lg active:scale-95 shadow-xs"
                  >
                    Set as Agent
                  </button>
                )}
              </div>

              {/* USER STATS */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-2xs">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Main Balance</p>
                  <p className="text-xs font-black text-emerald-600">{searchedUser.main_balance || 0} ETB</p>
                </div>
                <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-2xs">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Total Wins</p>
                  <p className="text-xs font-black text-violet-600">{searchedUser.total_wins || 0}</p>
                </div>
              </div>

              {/* ASSIGNED ROOM STATUS */}
              {searchedRoom ? (
                <div className="p-3.5 bg-white rounded-2xl border border-emerald-200 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-emerald-700">
                      <DoorOpen size={16} />
                      <span className="text-xs font-black">{searchedRoom.room_name}</span>
                      {searchedRoom.is_pinned && <span className="text-xs">📌</span>}
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${searchedRoom.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {searchedRoom.status}
                    </span>
                  </div>

                  {/* Commission badge */}
                  <div className="flex items-center space-x-2 bg-emerald-50/70 border border-emerald-100 rounded-xl px-2.5 py-1.5">
                    <DollarSign size={13} className="text-emerald-600" />
                    <span className="text-[11px] font-black text-emerald-800">
                      Agent Commission: {searchedRoom.commission_rate ?? 8}% per game pot
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-center text-[10px]">
                    <div className="bg-slate-50 p-1.5 rounded-lg">
                      <span className="text-slate-400 font-semibold">Players:</span> <span className="font-black text-slate-700">{searchedRoom.total_players}</span>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded-lg">
                      <span className="text-slate-400 font-semibold">Games:</span> <span className="font-black text-slate-700">{searchedRoom.total_games}</span>
                    </div>
                  </div>

                  <div className="flex space-x-1.5 pt-1">
                    <button
                      onClick={() => handleTogglePin(searchedRoom)}
                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black border flex items-center space-x-1 transition-all ${
                        searchedRoom.is_pinned ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      <Pin size={11} className={searchedRoom.is_pinned ? 'text-amber-600' : ''} />
                      <span>{searchedRoom.is_pinned ? 'Pinned' : 'Pin'}</span>
                    </button>
                    <button
                      onClick={() => handleToggleRoomStatus(searchedRoom)}
                      className={`flex-1 py-1.5 rounded-xl text-[10px] font-black ${searchedRoom.status === 'active' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-500 text-white'}`}
                    >
                      {searchedRoom.status === 'active' ? 'Pause Room' : 'Activate Room'}
                    </button>
                    <button
                      onClick={() => openEditRoomModal(searchedRoom)}
                      className="px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black hover:bg-slate-200"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(searchedRoom.id)}
                      className="px-2.5 py-1.5 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black hover:bg-rose-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-white rounded-2xl border border-sky-100 space-y-3 shadow-xs">
                  <div className="flex items-center space-x-1.5 text-slate-800">
                    <Sparkles size={15} className="text-sky-600" />
                    <p className="text-xs font-black">Configure & Assign New Room</p>
                  </div>

                  {/* Room Name */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Room Name</label>
                    <input
                      type="text"
                      value={newRoomName}
                      onChange={e => setNewRoomName(e.target.value)}
                      placeholder="e.g. VIP Alpha Room"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Game Commission Rate % */}
                  <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center space-x-1">
                        <Percent size={11} className="text-emerald-600" />
                        <span>Game Commission Rate (% per pot)</span>
                      </label>
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {newCommissionRate}%
                      </span>
                    </div>

                    {/* Quick preset chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {COMMISSION_PRESETS.map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewCommissionRate(preset)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-all ${
                            newCommissionRate === preset
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                          }`}
                        >
                          {preset}% {preset === 8 && '(Default)'}
                        </button>
                      ))}
                    </div>

                    <p className="text-[9px] text-slate-400 font-medium leading-tight">
                      Agent automatically receives {newCommissionRate}% of the total game pot when a game finishes in this room.
                    </p>
                  </div>

                  {/* Pin Room to Top Switch */}
                  <div className="flex items-center justify-between bg-amber-50/50 border border-amber-200/70 p-2.5 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-700 flex items-center justify-center">
                        <Pin size={14} />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">Pin Room to Top</p>
                        <p className="text-[9px] text-slate-400 font-medium">Shows this room first in Home & Game screens (Default: OFF)</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewIsPinned(!newIsPinned)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                        newIsPinned ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'
                      }`}
                    >
                      <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
                    </button>
                  </div>

                  <button
                    onClick={handleAssignRoom}
                    disabled={assigning || !newRoomName.trim()}
                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center space-x-1.5 shadow-md shadow-sky-600/20"
                  >
                    {assigning ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>Assign Room & Save Configuration</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── ALL ASSIGNED ROOMS DASHBOARD ─── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider">
              Assigned Rooms ({allRooms.length})
            </h2>
            <span className="text-[10px] font-bold text-slate-400">
              📌 {pinnedCount} Pinned
            </span>
          </div>

          {/* Search & Filter Row */}
          <div className="space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search rooms by name, agent..."
                value={roomSearchQuery}
                onChange={e => setRoomSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-sky-500 shadow-2xs"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex space-x-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {[
                { key: 'all', label: `All (${allRooms.length})` },
                { key: 'pinned', label: `📌 Pinned (${pinnedCount})` },
                { key: 'active', label: `✅ Active (${activeCount})` },
                { key: 'inactive', label: `Paused/Inactive` },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setRoomFilter(f.key as any)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                    roomFilter === f.key
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rooms List */}
          {loadingRooms ? (
            <div className="p-8 flex items-center justify-center">
              <RefreshCw size={24} className="animate-spin text-sky-500" />
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-gray-100 text-center space-y-2 shadow-sm">
              <DoorOpen size={32} className="mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-500">
                {roomSearchQuery.trim() ? `No rooms matching "${roomSearchQuery}"` : 'No rooms match this filter.'}
              </p>
              <p className="text-[10px] text-slate-400">Search an agent above to create and assign rooms!</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRooms.map(room => (
                <div
                  key={room.id}
                  className={`bg-white rounded-2xl p-3.5 border shadow-sm space-y-2.5 transition-all ${
                    room.is_pinned ? 'border-amber-300 ring-1 ring-amber-300/50 shadow-amber-500/10' : 'border-gray-100'
                  }`}
                >
                  {/* Top Row: Room name, Pinned & Status Badges, Quick Actions */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5 flex-1 min-w-0 mr-2">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        <span className="text-xs font-black text-slate-800 truncate">{room.room_name}</span>
                        {room.is_pinned && (
                          <span className="inline-flex items-center space-x-0.5 bg-amber-500/90 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-2xs">
                            <span>📌</span>
                            <span>PINNED</span>
                          </span>
                        )}
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                          room.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : room.status === 'paused'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {room.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium truncate">
                        Agent: <span className="font-bold text-slate-700">{room.agent_name || 'Agent'}</span> (ID: {room.agent_id})
                        {room.agent_balance !== undefined && (
                          <span className="ml-1 text-emerald-600 font-bold">· Bal: {room.agent_balance} ETB</span>
                        )}
                      </p>
                    </div>

                    {/* Action Buttons: Pin, Edit, Delete */}
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleTogglePin(room)}
                        className={`p-1.5 rounded-lg border transition-all active:scale-95 ${
                          room.is_pinned
                            ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600'
                        }`}
                        title={room.is_pinned ? 'Unpin Room' : 'Pin Room to Top'}
                      >
                        {room.is_pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                      <button
                        onClick={() => openEditRoomModal(room)}
                        className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95"
                        title="Edit Room"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteRoom(room.id)}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95"
                        title="Delete Room"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Commission Rate & Metrics Row */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-xl text-center text-[10px]">
                    <div className="bg-white rounded-lg p-1 border border-slate-100">
                      <p className="text-slate-400 font-semibold uppercase text-[8px]">Commission</p>
                      <p className="font-black text-emerald-600 flex items-center justify-center">
                        {room.commission_rate ?? 8}%
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-1 border border-slate-100">
                      <p className="text-slate-400 font-semibold uppercase text-[8px]">Players</p>
                      <p className="font-black text-slate-800">{room.total_players || 0}</p>
                    </div>
                    <div className="bg-white rounded-lg p-1 border border-slate-100">
                      <p className="text-slate-400 font-semibold uppercase text-[8px]">Games</p>
                      <p className="font-black text-violet-600">{room.total_games || 0}</p>
                    </div>
                  </div>

                  {/* Status Toggle Button */}
                  <button
                    onClick={() => handleToggleRoomStatus(room)}
                    className={`w-full py-1.5 rounded-xl text-[10px] font-black transition-all ${
                      room.status === 'active'
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                    }`}
                  >
                    {room.status === 'active' ? 'Pause / Deactivate' : 'Activate Room'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── EDIT ROOM MODAL ─── */}
      {editingRoom && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-3.5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                  <Edit3 size={14} />
                </div>
                <h3 className="text-sm font-black text-slate-800">Edit Room Configuration</h3>
              </div>
              <button onClick={() => setEditingRoom(null)} className="p-1 rounded-full text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            {/* Room Name */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Room Name</label>
              <input
                type="text"
                value={editRoomName}
                onChange={e => setEditRoomName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
              />
            </div>

            {/* Commission Rate (%) */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center space-x-1">
                  <Percent size={11} className="text-emerald-600" />
                  <span>Agent Commission Rate (%)</span>
                </label>
                <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {editCommissionRate}%
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COMMISSION_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setEditCommissionRate(preset)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black border transition-all ${
                      editCommissionRate === preset
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            {/* Pin to Top Switch */}
            <div className="flex items-center justify-between bg-amber-50/60 border border-amber-200 p-2.5 rounded-xl">
              <div className="flex items-center space-x-2">
                <Pin size={14} className="text-amber-600" />
                <div>
                  <p className="text-xs font-black text-slate-800">Pin Room to Top</p>
                  <p className="text-[9px] text-slate-400 font-medium">Show this room first in room listings</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditIsPinned(!editIsPinned)}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  editIsPinned ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
              </button>
            </div>

            {/* Status Selector */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Room Status</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setEditRoomStatus('active')}
                  className={`py-1.5 rounded-xl text-xs font-black border ${editRoomStatus === 'active' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setEditRoomStatus('inactive')}
                  className={`py-1.5 rounded-xl text-xs font-black border ${editRoomStatus === 'inactive' ? 'bg-rose-600 text-white border-rose-600 shadow-xs' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                >
                  Inactive
                </button>
              </div>
            </div>

            {/* Total Games */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Total Games</label>
              <input
                type="number"
                min="0"
                value={editRoomGames}
                onChange={e => setEditRoomGames(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
              />
            </div>

            {/* Action buttons */}
            <div className="flex space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit || !editRoomName.trim()}
                onClick={handleSaveEditRoom}
                className="flex-1 py-2 bg-sky-600 text-white rounded-xl text-xs font-black disabled:opacity-50 flex items-center justify-center space-x-1 active:scale-95 transition-all shadow-md shadow-sky-600/20"
              >
                {savingEdit ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
