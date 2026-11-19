import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import {
  ArrowLeft,
  Bot,
  Sparkles,
  Clock,
  ShieldCheck,
  Users,
  CheckCircle2,
  RefreshCw,
  Coins,
  Flame,
  Activity,
  Zap,
  AlertCircle,
  Save,
  Check,
  UserCheck,
  Calendar,
  Layers,
  Search,
  Edit2,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Sliders,
  Award
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const HDASE_ROOM_ID = 'd7c9114a-e112-426f-8f9b-13c00050279c';

interface StakeConfig {
  min: number;
  max: number;
  enabled: boolean;
}

interface WaiterStakeConfig {
  min: number;
  max: number;
  enabled: boolean;
}

interface LiveGameInfo {
  id: string;
  stake: number;
  status: 'waiting' | 'calling' | 'finished';
  start_at: string;
  prize_pool: number;
  called_count: number;
  real_count: number;
  system_count: number;
  waiter_count: number;
  cartelas_count: number;
}

interface SystemBot {
  id: string;
  first_name: string;
  telegram_id: string;
  total_won: number;
  created_at?: string;
}

export default function AdminHdaseBingo() {
  const navigate = useNavigate();

  // Active view tab: settings & live tables OR full 1,000 bot pool viewer & editor
  const [activeTab, setActiveTab] = useState<'settings' | 'pool'>('settings');

  // Loading & toast states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected Room & All Rooms List (allows managing ANY room by room_id)
  const [selectedRoomId, setSelectedRoomId] = useState<string>(HDASE_ROOM_ID);
  const [allRooms, setAllRooms] = useState<any[]>([]);
  const [upgradingPro, setUpgradingPro] = useState(false);
  const [showRoomPickerModal, setShowRoomPickerModal] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState<'all' | 'pro' | 'official' | 'free'>('all');

  // Room data & live metrics
  const [room, setRoom] = useState<any>(null);
  const [botCount, setBotCount] = useState<number>(1000);
  const [liveGames, setLiveGames] = useState<LiveGameInfo[]>([]);

  // Form states: Stakes (Strict 4 Tiers)
  const [stakes, setStakes] = useState<number[]>([5, 10, 20, 35]);

  // Form states: Auto-Bustle System Players
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [scheduleStart, setScheduleStart] = useState('00:00');
  const [scheduleEnd, setScheduleEnd] = useState('24:00');
  const [riskPercent, setRiskPercent] = useState<number>(25);
  const [stakeConfigs, setStakeConfigs] = useState<Record<string, StakeConfig>>({
    stake_1: { min: 2, max: 5, enabled: true },
    stake_2: { min: 2, max: 5, enabled: true },
    stake_3: { min: 1, max: 3, enabled: true },
    stake_4: { min: 1, max: 2, enabled: true },
  });

  // Form states: Waiter Players
  const [waiterEnabled, setWaiterEnabled] = useState(true);
  const [waiterStakeConfigs, setWaiterStakeConfigs] = useState<Record<string, WaiterStakeConfig>>({
    stake_1: { min: 1, max: 2, enabled: true },
    stake_2: { min: 1, max: 2, enabled: true },
    stake_3: { min: 1, max: 2, enabled: false },
    stake_4: { min: 1, max: 2, enabled: false },
  });

  // Bot Pool Browsing & Editing states
  const [bots, setBots] = useState<SystemBot[]>([]);
  const [botPage, setBotPage] = useState(1);
  const [totalBotPages, setTotalBotPages] = useState(1);
  const [totalBots, setTotalBots] = useState(0);
  const [botSearch, setBotSearch] = useState('');
  const [loadingBots, setLoadingBots] = useState(false);

  // Edit bot modal states
  const [editingBot, setEditingBot] = useState<SystemBot | null>(null);
  const [editBotName, setEditBotName] = useState('');
  const [savingBotName, setSavingBotName] = useState(false);

  // Add custom bot modal states
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [addingBot, setAddingBot] = useState(false);

  // Track initial load so polling NEVER stomps active user edits or toggles
  const initialLoadedRef = useRef(false);
  const pollIntervalRef = useRef<any>(null);

  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    try {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred(type);
      }
    } catch {}
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const getAuthHeaders = (): Record<string, string> => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    const pwaToken = typeof window !== 'undefined' ? (localStorage.getItem('hdase_pwa_token') || localStorage.getItem('pwa_token')) : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (initData) headers['x-telegram-init-data'] = initData;
    if (pwaToken) {
      headers['x-pwa-token'] = pwaToken;
      headers['x-pwa-auth'] = pwaToken;
      headers['Authorization'] = `Bearer ${pwaToken}`;
    }
    return headers;
  };

  // Fetch all rooms for selector
  const fetchAllRooms = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/rooms/all`, { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setAllRooms(d.rooms || []);
      }
    } catch {}
  };

  // Fetch Room data. Crucial: when isSilent is true, NEVER overwrite form states or toggles!
  const fetchHdaseRoom = useCallback(async (isSilent = false, roomIdParam?: string) => {
    try {
      const targetRoomId = roomIdParam || selectedRoomId || HDASE_ROOM_ID;
      if (!isSilent && !initialLoadedRef.current) setLoading(true);
      const res = await fetch(`${API_URL}/admin/hdase-room?roomId=${targetRoomId}`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        const r = data.room;
        setRoom(r);
        setBotCount(data.bot_count || 0);
        setLiveGames(data.live_games || []);

        // ONLY initialize or update form states on initial explicit load or after manual save!
        if (!isSilent || !initialLoadedRef.current) {
          if (Array.isArray(r.stakes) && r.stakes.length === 4) {
            setStakes(r.stakes.map(Number));
          }
          setSystemEnabled(r.system_players_enabled !== undefined ? Boolean(r.system_players_enabled) : true);
          const rawStart = (r.system_players_schedule_start || '00:00').trim();
          let rawEnd = (r.system_players_schedule_end || '24:00').trim();
          if (rawEnd === '00:00' && rawStart === '00:00') rawEnd = '24:00';
          setScheduleStart(rawStart || '00:00');
          setScheduleEnd(rawEnd || '24:00');
          setRiskPercent(Number(r.system_players_risk_percent ?? 25));

          if (r.system_players_stake_configs) {
            setStakeConfigs(prev => ({ ...prev, ...r.system_players_stake_configs }));
          }

          setWaiterEnabled(r.waiter_players_enabled !== undefined ? Boolean(r.waiter_players_enabled) : true);
          if (r.waiter_players_stake_configs) {
            setWaiterStakeConfigs(prev => ({ ...prev, ...r.waiter_players_stake_configs }));
          }

          initialLoadedRef.current = true;
        }
      } else {
        if (!isSilent) showToast('error', 'Failed to load room details');
      }
    } catch {
      if (!isSilent) showToast('error', 'Network error connecting to server');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [selectedRoomId]);

  // Handle switching rooms
  const handleRoomChange = (newRoomId: string) => {
    triggerHaptic('light');
    setSelectedRoomId(newRoomId);
    initialLoadedRef.current = false;
    fetchHdaseRoom(false, newRoomId);
    if (activeTab === 'pool') {
      fetchBots(1, botSearch, newRoomId);
    }
  };

  // One-click upgrade room to PRO Level 1
  const handleUpgradeToPro = async () => {
    triggerHaptic('heavy');
    setUpgradingPro(true);
    try {
      const res = await fetch(`${API_URL}/admin/hdase-room`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          roomId: selectedRoomId,
          system_players_pro_level: 1,
          system_players_pro_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        }),
      });
      if (res.ok) {
        showToast('success', `${room?.room_name || 'Room'} upgraded to PRO Level 1 successfully!`);
        initialLoadedRef.current = false;
        fetchHdaseRoom(false, selectedRoomId);
        fetchAllRooms();
      } else {
        showToast('error', 'Failed to upgrade room to Pro');
      }
    } catch {
      showToast('error', 'Network error');
    } finally {
      setUpgradingPro(false);
    }
  };

  // Filtered rooms for room picker modal
  const filteredRooms = allRooms.filter((r) => {
    const q = roomSearchQuery.trim().toLowerCase();
    const nameMatch = (r.room_name || '').toLowerCase().includes(q);
    const idMatch = (r.id || '').toLowerCase().includes(q);
    if (q && !nameMatch && !idMatch) return false;

    if (roomFilter === 'pro') return r.system_players_pro_level >= 1;
    if (roomFilter === 'official') return r.id === HDASE_ROOM_ID;
    if (roomFilter === 'free') return (!r.system_players_pro_level || r.system_players_pro_level < 1) && r.id !== HDASE_ROOM_ID;
    return true;
  });

  // Fetch paginated bot pool
  const fetchBots = useCallback(async (page = 1, search = '', roomIdParam?: string) => {
    try {
      setLoadingBots(true);
      const rId = roomIdParam || selectedRoomId || HDASE_ROOM_ID;
      const res = await fetch(
        `${API_URL}/admin/hdase-room/bots?roomId=${rId}&page=${page}&limit=25&search=${encodeURIComponent(search)}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setBots(data.players || []);
        setBotPage(data.page || 1);
        setTotalBotPages(data.total_pages || 1);
        setTotalBots(data.total || 0);
      }
    } catch {
      showToast('error', 'Failed to load bot pool');
    } finally {
      setLoadingBots(false);
    }
  }, [selectedRoomId]);

  useEffect(() => {
    fetchAllRooms();
    fetchHdaseRoom(false, selectedRoomId);

    // Fast polling for live games monitoring every 3s — isSilent=true ensures form is NEVER overwritten!
    pollIntervalRef.current = setInterval(() => {
      fetchHdaseRoom(true, selectedRoomId);
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [selectedRoomId]);

  // Load bot pool when switching to pool tab or page changes
  useEffect(() => {
    if (activeTab === 'pool') {
      fetchBots(botPage, botSearch);
    }
  }, [activeTab, botPage, fetchBots]);

  // Instant optimistic toggle for System Players with auto-save
  const toggleSystemPlayers = async () => {
    triggerHaptic('medium');
    const nextVal = !systemEnabled;
    setSystemEnabled(nextVal);
    try {
      const res = await fetch(`${API_URL}/admin/hdase-room`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ roomId: selectedRoomId, system_players_enabled: nextVal }),
      });
      if (res.ok) {
        showToast('success', `System players ${nextVal ? 'activated' : 'paused'}`);
      } else {
        showToast('error', 'Failed to update system players');
      }
    } catch {
      showToast('error', 'Network error updating toggle');
    }
  };

  // Instant optimistic toggle for Waiter Players with auto-save
  const toggleWaiterPlayers = async () => {
    triggerHaptic('medium');
    const nextVal = !waiterEnabled;
    setWaiterEnabled(nextVal);
    try {
      const res = await fetch(`${API_URL}/admin/hdase-room`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ roomId: selectedRoomId, waiter_players_enabled: nextVal }),
      });
      if (res.ok) {
        showToast('success', `Waiter players ${nextVal ? 'activated' : 'disabled'}`);
      } else {
        showToast('error', 'Failed to update waiter players');
      }
    } catch {
      showToast('error', 'Network error updating toggle');
    }
  };

  // Handle Save All Settings
  const handleSave = async () => {
    triggerHaptic('medium');
    setSaving(true);
    try {
      const payload = {
        roomId: selectedRoomId,
        stakes: stakes.map(Number),
        system_players_enabled: systemEnabled,
        system_players_schedule_start: scheduleStart,
        system_players_schedule_end: scheduleEnd,
        system_players_stake_configs: stakeConfigs,
        system_players_risk_percent: Number(riskPercent),
        waiter_players_enabled: waiterEnabled,
        waiter_players_stake_configs: waiterStakeConfigs,
      };

      const res = await fetch(`${API_URL}/admin/hdase-room`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast('success', `${room?.room_name || 'Room'} settings saved successfully!`);
        // Update baseline
        initialLoadedRef.current = false;
        fetchHdaseRoom(false, selectedRoomId);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to save settings');
      }
    } catch {
      showToast('error', 'Network error saving settings');
    } finally {
      setSaving(false);
    }
  };

  // Handle Re-seed 1,000 Bots
  const handleReseed = async () => {
    const confirmed = window.confirm(
      `Re-seed 1,000 Ethiopian system players for ${room?.room_name || 'this room'} with unique creative handles (@, $, %, emojis) and sequential Telegram IDs (10000000000..)?`
    );
    if (!confirmed) return;

    triggerHaptic('heavy');
    setReseeding(true);
    try {
      const res = await fetch(`${API_URL}/admin/hdase-room/reseed?roomId=${selectedRoomId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const d = await res.json();
        setBotCount(d.bot_count || 1000);
        showToast('success', d.message || '1,000 bots seeded successfully!');
        if (activeTab === 'pool') {
          fetchBots(1, botSearch, selectedRoomId);
        }
      } else {
        showToast('error', 'Failed to seed bots');
      }
    } catch {
      showToast('error', 'Network error seeding bots');
    } finally {
      setReseeding(false);
    }
  };

  // Handle Edit Bot Handle
  const handleSaveBotName = async () => {
    if (!editingBot || !editBotName.trim()) return;
    triggerHaptic('medium');
    setSavingBotName(true);
    try {
      const cleanName = editBotName.trim();
      const res = await fetch(`${API_URL}/admin/hdase-room/bots/${editingBot.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ first_name: cleanName }),
      });
      if (res.ok) {
        setBots(prev => prev.map(b => (b.id === editingBot.id ? { ...b, first_name: cleanName } : b)));
        showToast('success', `Bot handle updated to "${cleanName}"`);
        setEditingBot(null);
        setEditBotName('');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to update bot name');
      }
    } catch {
      showToast('error', 'Network error updating bot');
    } finally {
      setSavingBotName(false);
    }
  };

  // Handle Add Custom Bot
  const handleAddBot = async () => {
    if (!newBotName.trim()) return;
    triggerHaptic('medium');
    setAddingBot(true);
    try {
      const cleanName = newBotName.trim();
      const res = await fetch(`${API_URL}/admin/hdase-room/bots`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ roomId: selectedRoomId, first_name: cleanName }),
      });
      if (res.ok) {
        const d = await res.json();
        showToast('success', d.message || `Bot "${cleanName}" added to pool`);
        setNewBotName('');
        setShowAddBotModal(false);
        setBotCount(prev => prev + 1);
        fetchBots(1, botSearch, selectedRoomId);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to add bot');
      }
    } catch {
      showToast('error', 'Network error adding bot');
    } finally {
      setAddingBot(false);
    }
  };

  const handleStakeChange = (index: number, val: string) => {
    const num = Math.max(1, parseInt(val) || 0);
    setStakes(prev => {
      const next = [...prev];
      next[index] = num;
      return next;
    });
  };

  const set24Hours = () => {
    triggerHaptic('light');
    setScheduleStart('00:00');
    setScheduleEnd('24:00');
    showToast('success', '24/7 Always Active selected (00:00 - 24:00)');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
        <RefreshCw size={36} className="text-amber-500 animate-spin mb-3" />
        <p className="text-sm font-black text-slate-700">Loading HDASE BINGO Platform...</p>
        <p className="text-xs text-slate-400 mt-1">Permanent Pro Room & System Players Setup</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      {/* ─── TOAST NOTIFICATION ─── */}
      {toastMsg && (
        <div
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-black transition-all ${
            toastMsg.type === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-500/20'
              : 'bg-rose-600 text-white shadow-rose-500/20'
          }`}
        >
          {toastMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ─── HEADER BAR ─── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                triggerHaptic('light');
                navigate('/admin');
              }}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center space-x-1.5">
                <Flame size={16} className="text-amber-500 fill-amber-500" />
                <h1 className="font-black text-base text-slate-900 tracking-tight">{room?.room_name || 'HDASE BINGO'}</h1>
                {selectedRoomId === HDASE_ROOM_ID ? (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 uppercase tracking-wider">
                    OFFICIAL
                  </span>
                ) : (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                    AGENT ROOM
                  </span>
                )}
              </div>
              <p className="text-[10.5px] text-slate-400 font-semibold truncate max-w-[220px]">
                ID: {selectedRoomId.slice(0, 8)}... • {room?.system_players_pro_level && room.system_players_pro_level >= 1 ? 'PRO ACTIVE' : 'FREE ROOM'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              triggerHaptic('light');
              if (activeTab === 'settings') {
                fetchHdaseRoom(false, selectedRoomId);
              } else {
                fetchBots(botPage, botSearch, selectedRoomId);
              }
            }}
            className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center active:scale-95 transition-transform hover:bg-amber-100"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* ─── ULTRA-ATTRACTIVE MOBILE ROOM SELECTOR & QUICK PRO UPGRADE ─── */}
        <div className="mt-2.5 bg-gradient-to-r from-slate-50 to-slate-100/90 border border-slate-200/90 rounded-2xl p-2 flex items-center justify-between gap-2 shadow-2xs">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowRoomPickerModal(true);
            }}
            className="flex items-center space-x-2.5 min-w-0 flex-1 text-left active:scale-[0.98] transition-transform cursor-pointer bg-white border border-slate-200/80 rounded-xl p-2 shadow-2xs hover:border-amber-400"
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold shadow-2xs ${
                selectedRoomId === HDASE_ROOM_ID
                  ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
                  : room?.system_players_pro_level >= 1
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {selectedRoomId === HDASE_ROOM_ID ? (
                <Flame size={16} className="fill-white" />
              ) : room?.system_players_pro_level >= 1 ? (
                <Zap size={16} className="fill-white" />
              ) : (
                <Layers size={16} />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Current Room</span>
                {selectedRoomId === HDASE_ROOM_ID ? (
                  <span className="text-[8px] font-black px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 uppercase">
                    OFFICIAL
                  </span>
                ) : room?.system_players_pro_level >= 1 ? (
                  <span className="text-[8px] font-black px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 uppercase">
                    PRO L1
                  </span>
                ) : (
                  <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-500 uppercase">
                    FREE
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between pr-1">
                <span className="text-xs font-black text-slate-900 truncate max-w-[170px]">
                  {room?.room_name || 'Select Room...'}
                </span>
                <span className="text-[10px] font-bold text-amber-600 flex items-center gap-0.5 shrink-0 bg-amber-50 px-1.5 py-0.5 rounded-lg border border-amber-200/60">
                  <span>Change</span>
                  <ChevronDown size={11} />
                </span>
              </div>
            </div>
          </button>

          {room && (!room.system_players_pro_level || room.system_players_pro_level < 1) && (
            <button
              onClick={handleUpgradeToPro}
              disabled={upgradingPro}
              className="px-2.5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-xs flex items-center gap-1 shrink-0 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Zap size={11} className={upgradingPro ? 'animate-bounce' : ''} />
              <span>{upgradingPro ? 'Upgrading...' : 'Upgrade to Pro'}</span>
            </button>
          )}
        </div>

        {/* ─── TAB NAVIGATION ─── */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl mt-3">
          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('settings');
            }}
            className={`py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'settings'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sliders size={14} className={activeTab === 'settings' ? 'text-amber-500' : ''} />
            <span>Settings & Monitor</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('pool');
            }}
            className={`py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'pool'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Bot size={14} className={activeTab === 'pool' ? 'text-purple-600' : ''} />
            <span>1,000 Bot Pool</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 font-black">
              {botCount.toLocaleString()}
            </span>
          </button>
        </div>
      </div>

      {/* ─── TAB 1: SETTINGS & LIVE MONITOR ─── */}
      {activeTab === 'settings' && (
        <div className="p-4 space-y-4 max-w-xl mx-auto">
          {/* Room Badge Card */}
          {selectedRoomId === HDASE_ROOM_ID ? (
            <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-4 text-white shadow-md relative overflow-hidden">
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-white/5 rounded-full blur-2xl -mr-8" />
              <div className="relative z-10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-200 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-400/30">
                    PERMANENT OFFICIAL ROOM
                  </span>
                  <span className="flex items-center space-x-1 text-xs font-black bg-white/20 px-2 py-0.5 rounded-full text-emerald-100 backdrop-blur-xs">
                    <ShieldCheck size={13} />
                    <span>PRO ACTIVE ✓</span>
                  </span>
                </div>
                <h2 className="text-base font-black tracking-tight">Zero Admin Balance Required</h2>
                <p className="text-[11px] text-emerald-100 leading-relaxed font-medium">
                  Unlike third-party agent rooms, <strong>HDASE BINGO</strong> never requires monthly Pro upgrades or deposit stakes. Waiter bots and system players operate 24/7 on platform logic — <strong>wins, losses, and joins never deduct or touch the admin wallet balance</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className={`rounded-3xl p-4 text-white shadow-md relative overflow-hidden ${
              room?.system_players_pro_level && room.system_players_pro_level >= 1
                ? 'bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800'
                : 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900'
            }`}>
              <div className="relative z-10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-200 bg-black/30 px-2 py-0.5 rounded-full border border-white/20">
                    AGENT ROOM • {room?.room_name}
                  </span>
                  {room?.system_players_pro_level && room.system_players_pro_level >= 1 ? (
                    <span className="flex items-center space-x-1 text-xs font-black bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 rounded-full backdrop-blur-xs">
                      <ShieldCheck size={13} />
                      <span>PRO LEVEL {room.system_players_pro_level} ACTIVE ✓</span>
                    </span>
                  ) : (
                    <button
                      onClick={handleUpgradeToPro}
                      disabled={upgradingPro}
                      className="flex items-center space-x-1 text-xs font-black bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-0.5 rounded-full shadow-xs cursor-pointer active:scale-95 transition-all"
                    >
                      <Zap size={12} className={upgradingPro ? 'animate-bounce' : ''} />
                      <span>{upgradingPro ? 'Upgrading...' : '⚡ Upgrade to Pro Level 1'}</span>
                    </button>
                  )}
                </div>
                <h2 className="text-base font-black tracking-tight">{room?.room_name} System Players</h2>
                <p className="text-[11px] text-indigo-100 leading-relaxed font-medium">
                  System Players and Waiter Bots for <strong>{room?.room_name}</strong> (Room ID: <code className="bg-black/30 px-1 py-0.5 rounded text-[10px] font-mono">{selectedRoomId}</code>) operate strictly on this room's configured 4 stakes and schedule.
                </p>
              </div>
            </div>
          )}

          {/* ─── SECTION 1: ROOM STAKES (4 TIERS) ─── */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Coins size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800">Room Stakes (4 Tiers)</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Configure the 4 active game entry stakes for HDASE BINGO</p>
                </div>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                4 STAKES
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-1">
              {stakes.map((stk, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 text-center space-y-1">
                  <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">
                    Tier {idx + 1}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={stk}
                    onChange={(e) => handleStakeChange(idx, e.target.value)}
                    className="w-full text-center font-black text-sm text-slate-900 bg-white border border-slate-200 rounded-xl py-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <span className="text-[9px] font-bold text-slate-500 block">ETB</span>
                </div>
              ))}
            </div>

            {/* Quick Stake Preset Buttons */}
            <div className="flex items-center justify-end space-x-1.5 pt-1">
              <span className="text-[9px] font-bold text-slate-400">Presets:</span>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setStakes([5, 10, 20, 35]);
                }}
                className="text-[9.5px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                5/10/20/35
              </button>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setStakes([10, 20, 50, 100]);
                }}
                className="text-[9.5px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                10/20/50/100
              </button>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setStakes([2, 5, 10, 25]);
                }}
                className="text-[9.5px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                2/5/10/25
              </button>
            </div>
          </div>

          {/* ─── SECTION 2: AUTO-BUSTLE SYSTEM PLAYERS SETTINGS ─── */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800">System Players (Auto-Bustle)</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Automatic realistic player filling based on schedule</p>
                </div>
              </div>

              {/* Instant Toggle */}
              <button
                onClick={toggleSystemPlayers}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer ${
                  systemEnabled ? 'bg-amber-500' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                    systemEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {systemEnabled ? (
              <div className="space-y-4 pt-1">
                {/* Active Schedule Window (Clean 24h Selector) */}
                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                      <Clock size={14} className="text-amber-500" />
                      24h Schedule Interval
                    </span>
                    <button
                      type="button"
                      onClick={set24Hours}
                      className={`text-[10px] font-black px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                        scheduleStart === '00:00' && (scheduleEnd === '24:00' || scheduleEnd === '23:59')
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      }`}
                    >
                      <Sparkles size={11} />
                      <span>{scheduleStart === '00:00' && (scheduleEnd === '24:00' || scheduleEnd === '23:59') ? '24/7 ON ✓' : 'Set 24/7 (00:00 - 24:00)'}</span>
                    </button>
                  </div>

                  {/* 24-Hour Military Format Selectors */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                        Start Time (24h)
                      </span>
                      <select
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                      >
                        {Array.from({ length: 24 }).map((_, h) => {
                          const val = `${h.toString().padStart(2, '0')}:00`;
                          return (
                            <option key={val} value={val}>
                              {val} {h === 0 ? '(00:00 Midnight)' : h === 12 ? '(12:00 Noon)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                        End Time (24h)
                      </span>
                      <select
                        value={scheduleEnd}
                        onChange={(e) => setScheduleEnd(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                      >
                        <option value="24:00">24:00 (Full 24 Hours / All Day)</option>
                        {Array.from({ length: 24 }).map((_, h) => {
                          const val = `${h.toString().padStart(2, '0')}:00`;
                          return (
                            <option key={val} value={val}>
                              {val} {h === 0 ? '(00:00 Midnight)' : h === 12 ? '(12:00 Noon)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {/* 24-Hour Active Indicator Banner */}
                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-[10.5px] text-amber-950 font-medium">
                    {scheduleStart === '00:00' && (scheduleEnd === '24:00' || scheduleEnd === '23:59' || scheduleEnd === '00:00') ? (
                      <span className="flex items-center gap-1.5 text-emerald-800 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span><strong>24/7 Mode Active:</strong> System players join all games around the clock (00:00 - 24:00) every day.</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <Clock size={13} className="text-amber-600 shrink-0" />
                        <span>Active window: <strong>{scheduleStart}</strong> to <strong>{scheduleEnd}</strong> (24h Ethiopian time UTC+3).</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Stakes Min / Max Bot Config */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Bots per Tier (4 Tiers)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {stakes.map((stk, idx) => {
                      const key = `stake_${idx + 1}`;
                      const cfg = stakeConfigs[key] || { min: 2, max: 5, enabled: idx < 2 };

                      return (
                        <div
                          key={key}
                          className={`p-3 rounded-2xl border transition-all ${
                            cfg.enabled
                              ? 'bg-amber-50/40 border-amber-300/80 shadow-2xs'
                              : 'bg-slate-50 border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-xs text-slate-800">{stk} ETB Game</span>
                              <span className="text-[8px] font-bold text-slate-400 uppercase">Tier {idx + 1}</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={cfg.enabled}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setStakeConfigs(prev => ({
                                  ...prev,
                                  [key]: { ...cfg, enabled: checked },
                                }));
                              }}
                              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-400"
                            />
                          </div>

                          {cfg.enabled && (
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/50">
                              <div>
                                <span className="text-[8px] font-bold text-slate-500 uppercase">Min Bots</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={cfg.max}
                                  value={cfg.min}
                                  onChange={(e) => {
                                    const v = Math.max(1, parseInt(e.target.value) || 1);
                                    setStakeConfigs(prev => ({
                                      ...prev,
                                      [key]: { ...cfg, min: v },
                                    }));
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-slate-800 mt-0.5"
                                />
                              </div>
                              <div>
                                <span className="text-[8px] font-bold text-slate-500 uppercase">Max Bots</span>
                                <input
                                  type="number"
                                  min={cfg.min}
                                  max={25}
                                  value={cfg.max}
                                  onChange={(e) => {
                                    const v = Math.max(cfg.min, parseInt(e.target.value) || cfg.min);
                                    setStakeConfigs(prev => ({
                                      ...prev,
                                      [key]: { ...cfg, max: v },
                                    }));
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-slate-800 mt-0.5"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Risk Percent */}
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-black text-xs text-slate-800 block">System Players Risk Rate</span>
                    <span className="text-[9.5px] text-slate-400 font-medium">Standard default: 25% (saved for reference)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                      className="w-14 text-center font-black text-sm text-slate-800 bg-white border border-slate-300 rounded-xl py-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <span className="text-xs font-black text-slate-600">%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs font-semibold text-slate-400">
                System players are currently paused for HDASE BINGO. Toggle switch above to activate.
              </div>
            )}
          </div>

          {/* ─── SECTION 3: WAITER PLAYERS SETTINGS ─── */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800">Waiter Players</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Auto-join after 10s only when a real player is waiting</p>
                </div>
              </div>

              {/* Instant Toggle */}
              <button
                onClick={toggleWaiterPlayers}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer ${
                  waiterEnabled ? 'bg-purple-600' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                    waiterEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {waiterEnabled ? (
              <div className="space-y-3 pt-1">
                <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-2xl text-[10.5px] text-purple-900 leading-relaxed">
                  💡 <strong>Waiter Mode Rule:</strong> Bots join after 10 seconds only when at least 1 real player is in the lobby to start calling. For HDASE BINGO, this is fully platform-backed with zero admin wallet deductions.
                </div>

                {/* Waiter Stakes Config */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stakes.map((stk, idx) => {
                    const key = `stake_${idx + 1}`;
                    const wCfg = waiterStakeConfigs[key] || { min: 1, max: 2, enabled: idx < 2 };

                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-2xl border transition-all ${
                          wCfg.enabled
                            ? 'bg-purple-50/40 border-purple-300/80 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-xs text-slate-800">{stk} ETB Game</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase">Tier {idx + 1}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={wCfg.enabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setWaiterStakeConfigs(prev => ({
                                ...prev,
                                [key]: { ...wCfg, enabled: checked },
                              }));
                            }}
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-400"
                          />
                        </div>

                        {wCfg.enabled && (
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-purple-200/50">
                            <div>
                              <span className="text-[8px] font-bold text-slate-500 uppercase">Min Waiters</span>
                              <input
                                type="number"
                                min={1}
                                max={wCfg.max}
                                value={wCfg.min}
                                onChange={(e) => {
                                  const v = Math.max(1, parseInt(e.target.value) || 1);
                                  setWaiterStakeConfigs(prev => ({
                                    ...prev,
                                    [key]: { ...wCfg, min: v },
                                  }));
                                }}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-slate-800 mt-0.5"
                              />
                            </div>
                            <div>
                              <span className="text-[8px] font-bold text-slate-500 uppercase">Max Waiters</span>
                              <input
                                type="number"
                                min={wCfg.min}
                                max={10}
                                value={wCfg.max}
                                onChange={(e) => {
                                  const v = Math.max(wCfg.min, parseInt(e.target.value) || wCfg.min);
                                  setWaiterStakeConfigs(prev => ({
                                    ...prev,
                                    [key]: { ...wCfg, max: v },
                                  }));
                                }}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-slate-800 mt-0.5"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs font-semibold text-slate-400">
                Waiter players are currently disabled for HDASE BINGO.
              </div>
            )}
          </div>

          {/* ─── SECTION 4: LIVE MONITOR (STRICT 4 TIERS - NO DUPLICATE REPETITION) ─── */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800">Live Monitor & Bot Pool</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Real-time status across active HDASE BINGO games</p>
                </div>
              </div>

              <button
                onClick={handleReseed}
                disabled={reseeding}
                className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
              >
                <RefreshCw size={11} className={reseeding ? 'animate-spin' : ''} />
                <span>{reseeding ? 'Seeding...' : 'Re-seed 1k Pool'}</span>
              </button>
            </div>

            {/* Bot Pool Summary Banner with Direct Link to Pool Tab */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-3 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-black">
                  🤖
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Ethiopian Bot Pool</p>
                  <p className="text-sm font-black text-white">{botCount.toLocaleString()} Unique Bots Ready</p>
                </div>
              </div>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab('pool');
                }}
                className="text-[10px] font-black px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-sm flex items-center gap-1 active:scale-95 transition-all"
              >
                <span>View & Edit Pool</span>
                <ChevronRight size={13} />
              </button>
            </div>

            {/* Live Matches Across STRICT 4 Stakes (ZERO Duplicate Repetition) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Live Tables (4 Tiers Active)
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                    Strict 4 Stakes
                  </span>
                </div>
                <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live 3s Polling
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stakes.map((stk, idx) => {
                  const g = liveGames.find(game => Number(game.stake) === Number(stk));
                  const isCalling = g?.status === 'calling';
                  return (
                    <div
                      key={`tier-${idx}-${stk}`}
                      className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2 shadow-2xs hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-xs text-slate-800">{stk} ETB</span>
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-slate-200/80 text-slate-600 uppercase">
                            Tier {idx + 1}
                          </span>
                          <span
                            className={`text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase ${
                              isCalling
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {isCalling ? `Calling (${g.called_count}/75)` : 'Waiting...'}
                          </span>
                        </div>
                        <span className="font-black text-xs text-amber-700">{g?.prize_pool ?? 0} ETB Pot</span>
                      </div>

                      <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-200/60 text-center">
                        <div className="bg-white rounded-lg p-1 border border-slate-100">
                          <span className="text-[7.5px] font-bold text-slate-400 block uppercase">Real</span>
                          <span className="text-xs font-black text-emerald-600">{g?.real_count ?? 0}</span>
                        </div>
                        <div className="bg-white rounded-lg p-1 border border-slate-100">
                          <span className="text-[7.5px] font-bold text-slate-400 block uppercase">Bots</span>
                          <span className="text-xs font-black text-amber-600">{g?.system_count ?? 0}</span>
                        </div>
                        <div className="bg-white rounded-lg p-1 border border-slate-100">
                          <span className="text-[7.5px] font-bold text-slate-400 block uppercase">Waiters</span>
                          <span className="text-xs font-black text-purple-600">{g?.waiter_count ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: SYSTEM PLAYER POOL (1,000 BOTS VIEWER & NAME EDITOR) ─── */}
      {activeTab === 'pool' && (
        <div className="p-4 space-y-4 max-w-xl mx-auto">
          {/* Pool Header with Stats and Actions */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-black">
                  <Bot size={22} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800">System Player Pool</h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {totalBots.toLocaleString()} Bots • Telegram IDs (10000000000..)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setShowAddBotModal(true);
                  }}
                  className="text-[10px] font-black px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                >
                  <Plus size={12} />
                  <span>Add Bot</span>
                </button>
                <button
                  onClick={handleReseed}
                  disabled={reseeding}
                  className="text-[10px] font-black px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 active:scale-95 transition-all disabled:opacity-50"
                  title="Reseed Pool"
                >
                  <RefreshCw size={11} className={reseeding ? 'animate-spin' : ''} />
                  <span>Reseed</span>
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={botSearch}
                onChange={(e) => {
                  setBotSearch(e.target.value);
                  setBotPage(1);
                  fetchBots(1, e.target.value);
                }}
                placeholder="Search bot handle or name (e.g. @miki, Dani, ✨)..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {botSearch && (
                <button
                  onClick={() => {
                    setBotSearch('');
                    fetchBots(1, '');
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Bot List */}
          <div className="space-y-2">
            {loadingBots ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
                <RefreshCw size={24} className="text-amber-500 animate-spin mx-auto mb-2" />
                <p className="text-xs font-black text-slate-600">Loading system players...</p>
              </div>
            ) : bots.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-gray-100 shadow-sm space-y-2">
                <Bot size={32} className="text-slate-300 mx-auto" />
                <p className="text-xs font-black text-slate-600">No system players found</p>
                <p className="text-[11px] text-slate-400">Try clearing your search query or re-seed the pool.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {bots.map((bot) => (
                  <div
                    key={bot.id}
                    className="bg-white rounded-2xl p-3 border border-gray-100 shadow-xs flex items-center justify-between hover:border-amber-200 transition-colors"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-100 to-orange-100 text-amber-700 flex items-center justify-center font-black text-sm shrink-0">
                        🤖
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <p className="font-black text-xs text-slate-900 truncate">{bot.first_name}</p>
                          <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            BOT
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 truncate">
                          ID: <span className="text-slate-600 font-semibold">{bot.telegram_id || '10000000000'}</span>
                          {bot.total_won > 0 && (
                            <span className="ml-2 text-emerald-600 font-bold">🏆 {bot.total_won} ETB Won</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        setEditingBot(bot);
                        setEditBotName(bot.first_name);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-amber-50 hover:text-amber-700 text-slate-600 border border-slate-200 text-[10px] font-black flex items-center gap-1 active:scale-95 transition-all shrink-0"
                    >
                      <Edit2 size={11} />
                      <span>Edit</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalBotPages > 1 && (
              <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm flex items-center justify-between">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    if (botPage > 1) {
                      const prevPage = botPage - 1;
                      setBotPage(prevPage);
                      fetchBots(prevPage, botSearch);
                    }
                  }}
                  disabled={botPage <= 1}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-black flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all"
                >
                  <ChevronLeft size={14} />
                  <span>Prev</span>
                </button>

                <span className="text-xs font-black text-slate-600">
                  Page {botPage} of {totalBotPages} ({totalBots} bots)
                </span>

                <button
                  onClick={() => {
                    triggerHaptic('light');
                    if (botPage < totalBotPages) {
                      const nextPage = botPage + 1;
                      setBotPage(nextPage);
                      fetchBots(nextPage, botSearch);
                    }
                  }}
                  disabled={botPage >= totalBotPages}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-black flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all"
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── BOTTOM FLOATING SAVE ACTION BAR (IN SETTINGS TAB) ─── */}
      {activeTab === 'settings' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 pb-safe shadow-lg max-w-xl mx-auto">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Saving {room?.room_name || 'Room'} Settings...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Save {room?.room_name || 'Room'} Settings</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ─── MODAL: EDIT BOT NAME / HANDLE ─── */}
      {editingBot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                  <Edit2 size={16} />
                </div>
                <div>
                  <h4 className="font-black text-sm text-slate-900">Edit Bot Handle</h4>
                  <p className="text-[10px] text-slate-400">Telegram ID: {editingBot.telegram_id}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingBot(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                Bot Name / Telegram Handle
              </label>
              <input
                type="text"
                value={editBotName}
                onChange={(e) => setEditBotName(e.target.value)}
                placeholder="e.g. @miki_01, ⚡Dani$, Alex%10..."
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                autoFocus
              />
              <p className="text-[10px] text-slate-400">
                You can use handles like @name, symbols ($, %, _), and emojis.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setEditingBot(null)}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBotName}
                disabled={savingBotName || !editBotName.trim()}
                className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
              >
                {savingBotName ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Save Handle</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD CUSTOM BOT ─── */}
      {showAddBotModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                  <Plus size={18} />
                </div>
                <div>
                  <h4 className="font-black text-sm text-slate-900">Add Custom Bot</h4>
                  <p className="text-[10px] text-slate-400">Next Sequential 11-digit Telegram ID</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddBotModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                Bot Handle / Name
              </label>
              <input
                type="text"
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                placeholder="e.g. @yared_vip, $Abebe$, 👑King_01..."
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                autoFocus
              />
              <p className="text-[10px] text-slate-400">
                Will be automatically registered with the sequential Telegram ID pattern (10000000000..).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setShowAddBotModal(false)}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBot}
                disabled={addingBot || !newBotName.trim()}
                className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
              >
                {addingBot ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    <span>Add Bot to Pool</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ULTRA-ATTRACTIVE MOBILE ROOM PICKER BOTTOM SHEET MODAL ─── */}
      {showRoomPickerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          {/* Backdrop click to dismiss */}
          <div
            className="absolute inset-0"
            onClick={() => {
              triggerHaptic('light');
              setShowRoomPickerModal(false);
            }}
          />

          {/* Modal / Bottom Sheet Container */}
          <div className="relative z-10 bg-white rounded-t-[32px] sm:rounded-3xl p-4 sm:p-5 w-full max-w-lg mx-auto shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-250">
            {/* Mobile Drag Indicator Bar */}
            <div className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto mb-3 shrink-0 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-black">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">Select Bingo Room</h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {allRooms.length} Registered Rooms • Switch to manage settings
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowRoomPickerModal(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={roomSearchQuery}
                  onChange={(e) => setRoomSearchQuery(e.target.value)}
                  placeholder="Search room name or ID..."
                  className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  autoFocus
                />
                {roomSearchQuery && (
                  <button
                    onClick={() => setRoomSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center space-x-1.5 pb-2.5 overflow-x-auto no-scrollbar shrink-0">
              {(['all', 'pro', 'official', 'free'] as const).map((f) => {
                const count =
                  f === 'all'
                    ? allRooms.length
                    : f === 'pro'
                    ? allRooms.filter((r) => r.system_players_pro_level >= 1).length
                    : f === 'official'
                    ? 1
                    : allRooms.filter(
                        (r) => (!r.system_players_pro_level || r.system_players_pro_level < 1) && r.id !== HDASE_ROOM_ID
                      ).length;

                return (
                  <button
                    key={f}
                    onClick={() => {
                      triggerHaptic('light');
                      setRoomFilter(f);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                      roomFilter === f
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'all' && `All (${count})`}
                    {f === 'pro' && `⚡ Pro (${count})`}
                    {f === 'official' && '★ Official'}
                    {f === 'free' && `Free (${count})`}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Room Card List */}
            <div className="overflow-y-auto space-y-2 pr-0.5 py-1 flex-1 max-h-[55vh]">
              {filteredRooms.map((r) => {
                const isSelected = r.id === selectedRoomId;
                const isOfficial = r.id === HDASE_ROOM_ID;
                const isPro = r.system_players_pro_level >= 1;

                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      triggerHaptic('medium');
                      handleRoomChange(r.id);
                      setShowRoomPickerModal(false);
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99] ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-400 shadow-xs ring-2 ring-amber-400/30'
                        : 'bg-white hover:bg-slate-50 border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {/* Avatar Icon */}
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-bold shadow-2xs ${
                          isOfficial
                            ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
                            : isPro
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isOfficial ? (
                          <Flame size={20} className="fill-white" />
                        ) : isPro ? (
                          <Zap size={20} className="fill-white" />
                        ) : (
                          <Layers size={18} />
                        )}
                      </div>

                      {/* Room Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span
                            className={`text-xs font-black truncate max-w-[190px] ${
                              isSelected ? 'text-amber-950' : 'text-slate-800'
                            }`}
                          >
                            {r.room_name}
                          </span>
                          {isOfficial ? (
                            <span className="text-[8.5px] font-black px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 uppercase tracking-wider shrink-0">
                              OFFICIAL
                            </span>
                          ) : isPro ? (
                            <span className="text-[8.5px] font-black px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                              <Zap size={9} />
                              PRO L1
                            </span>
                          ) : (
                            <span className="text-[8.5px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-500 uppercase tracking-wider shrink-0">
                              FREE
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                          ID: {r.id.slice(0, 14)}...
                        </p>
                      </div>
                    </div>

                    {/* Checkmark or Selection Arrow */}
                    <div className="shrink-0 flex items-center space-x-2">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                          <ChevronRight size={14} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredRooms.length === 0 && (
                <div className="py-8 text-center space-y-1">
                  <p className="text-xs font-bold text-slate-500">No rooms match your filter</p>
                  <p className="text-[10px] text-slate-400">Try adjusting your search query or tab</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
