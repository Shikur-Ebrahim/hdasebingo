import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, RefreshCw, Plus, CheckCircle2, AlertCircle, Trash2, Edit3, Shield, Users, DoorOpen, PlayCircle, X } from 'lucide-react';
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

export default function AdminAgents() {
  const { user } = useGameStore();
  const [telegramIdInput, setTelegramIdInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedUser, setSearchedUser] = useState<AgentUser | null>(null);
  const [searchedRoom, setSearchedRoom] = useState<AgentRoom | null>(null);

  // Assign room form state
  const [newRoomName, setNewRoomName] = useState('');
  const [assigning, setAssigning] = useState(false);

  // All rooms state
  const [allRooms, setAllRooms] = useState<AgentRoom[]>([]);
  const [allAgents, setAllAgents] = useState<AgentUser[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Edit room modal state
  const [editingRoom, setEditingRoom] = useState<AgentRoom | null>(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomStatus, setEditRoomStatus] = useState<'active' | 'inactive'>('active');
  const [editRoomPlayers, setEditRoomPlayers] = useState('0');
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
      } else {
        const err = await res.json();
        showToast('error', err.error || 'User not found');
      }
    } catch (err) {
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
          status: 'active'
        })
      });

      if (res.ok) {
        const data = await res.json();
        showToast('success', `Room "${data.room.room_name}" successfully assigned!`);
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
    setEditRoomStatus(room.status === 'active' ? 'active' : 'inactive');
    setEditRoomPlayers(String(room.total_players || 0));
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
          total_players: Number(editRoomPlayers) || 0,
          total_games: Number(editRoomGames) || 0,
        })
      });
      if (res.ok) {
        showToast('success', 'Room updated successfully');
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

  if (!user || user.role !== 'admin') {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied! Admin only.</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-20">
      {/* TOAST */}
      {toast && (
        <div className={`fixed top-3 left-3 right-3 z-50 flex items-center space-x-2 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold text-white transition-all ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-white px-4 py-3.5 shadow-sm border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-2.5">
          <Link to="/admin" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 active:bg-slate-200">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-black text-slate-800 leading-tight">Agent Rooms</h1>
            <p className="text-[10px] text-slate-400 font-medium">{allRooms.length} rooms assigned</p>
          </div>
        </div>
        <button onClick={fetchRoomsAndAgents} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:bg-slate-200">
          <RefreshCw size={14} className={loadingRooms ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* SEARCH AGENT CARD */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
              <Search size={16} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800">Find or Assign Agent</h2>
              <p className="text-[10px] text-slate-400">Enter Telegram ID to check agent and assign a room</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter Telegram ID (e.g. 12345678)"
              value={telegramIdInput}
              onChange={e => setTelegramIdInput(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={searchLoading || !telegramIdInput.trim()}
              className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-black flex items-center space-x-1.5 active:scale-95 disabled:opacity-50 transition-all"
            >
              {searchLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              <span>Search</span>
            </button>
          </form>

          {/* SEARCH RESULT: USER CARD */}
          {searchedUser && (
            <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm ${searchedUser.role === 'agent' ? 'bg-sky-600' : 'bg-slate-600'}`}>
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
                    className="px-2.5 py-1 bg-sky-600 text-white text-[10px] font-black rounded-lg active:scale-95"
                  >
                    Set as Agent
                  </button>
                )}
              </div>

              {/* USER STATS */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-100">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Main Balance</p>
                  <p className="text-xs font-black text-emerald-600">{searchedUser.main_balance || 0} ETB</p>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-100">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Total Wins</p>
                  <p className="text-xs font-black text-violet-600">{searchedUser.total_wins || 0}</p>
                </div>
              </div>

              {/* ASSIGNED ROOM STATUS */}
              {searchedRoom ? (
                <div className="p-3 bg-white rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-emerald-700">
                      <DoorOpen size={16} />
                      <span className="text-xs font-black">{searchedRoom.room_name}</span>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${searchedRoom.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {searchedRoom.status}
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
                      onClick={() => handleToggleRoomStatus(searchedRoom)}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-black ${searchedRoom.status === 'active' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-500 text-white'}`}
                    >
                      {searchedRoom.status === 'active' ? 'Deactivate Room' : 'Activate Room'}
                    </button>
                    <button
                      onClick={() => openEditRoomModal(searchedRoom)}
                      className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black hover:bg-slate-200"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(searchedRoom.id)}
                      className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-black hover:bg-rose-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-white rounded-xl border border-sky-100 space-y-2.5">
                  <p className="text-xs font-black text-slate-800">🏠 Assign a Room to this Agent</p>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Room Name</label>
                    <input
                      type="text"
                      value={newRoomName}
                      onChange={e => setNewRoomName(e.target.value)}
                      placeholder="e.g. Alpha Room"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                    />
                  </div>
                  <button
                    onClick={handleAssignRoom}
                    disabled={assigning || !newRoomName.trim()}
                    className="w-full py-2 bg-sky-600 text-white rounded-xl text-xs font-black active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center space-x-1.5"
                  >
                    {assigning ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>Assign Room & Save to DB</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ALL ASSIGNED ROOMS LIST */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider">All Agent Rooms ({allRooms.length})</h2>
          </div>

          {loadingRooms ? (
            <div className="p-8 flex items-center justify-center">
              <RefreshCw size={24} className="animate-spin text-sky-500" />
            </div>
          ) : allRooms.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center space-y-2">
              <DoorOpen size={32} className="mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-500">No rooms assigned yet.</p>
              <p className="text-[10px] text-slate-400">Search an agent by Telegram ID above to create their room!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allRooms.map(room => (
                <div key={room.id} className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black text-slate-800">{room.room_name}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${room.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {room.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">Agent: <span className="font-bold text-slate-600">{room.agent_name || 'Agent'}</span> (ID: {room.agent_id})</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditRoomModal(room)}
                        className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteRoom(room.id)}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl text-center text-[10px]">
                    <div>
                      <p className="text-slate-400 font-semibold uppercase text-[9px]">Players</p>
                      <p className="font-black text-slate-800">{room.total_players}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-semibold uppercase text-[9px]">Games</p>
                      <p className="font-black text-slate-800">{room.total_games}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleRoomStatus(room)}
                    className={`w-full py-1.5 rounded-xl text-[10px] font-black transition-all ${room.status === 'active' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    {room.status === 'active' ? 'Pause / Deactivate' : 'Activate Room'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* EDIT MODAL */}
      {editingRoom && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">Edit Room</h3>
              <button onClick={() => setEditingRoom(null)} className="p-1 rounded-full text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Room Name</label>
              <input
                type="text"
                value={editRoomName}
                onChange={e => setEditRoomName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Status</label>
              <div className="flex space-x-2 mt-1">
                <button
                  type="button"
                  onClick={() => setEditRoomStatus('active')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-black ${editRoomStatus === 'active' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setEditRoomStatus('inactive')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-black ${editRoomStatus === 'inactive' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  Inactive
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Players</label>
                <input
                  type="number"
                  min="0"
                  value={editRoomPlayers}
                  onChange={e => setEditRoomPlayers(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Total Games</label>
                <input
                  type="number"
                  min="0"
                  value={editRoomGames}
                  onChange={e => setEditRoomGames(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit || !editRoomName.trim()}
                onClick={handleSaveEditRoom}
                className="flex-1 py-2 bg-sky-600 text-white rounded-xl text-xs font-black disabled:opacity-50 flex items-center justify-center space-x-1"
              >
                {savingEdit ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
