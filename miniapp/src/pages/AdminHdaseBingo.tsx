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
  Layers
} from 'lucide-react';
import { supabase } from '../lib/supabase';

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

export default function AdminHdaseBingo() {
  const navigate = useNavigate();

  // Loading & toast states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Room data
  const [room, setRoom] = useState<any>(null);
  const [botCount, setBotCount] = useState<number>(1000);
  const [liveGames, setLiveGames] = useState<LiveGameInfo[]>([]);

  // Form states: Stakes
  const [stakes, setStakes] = useState<number[]>([5, 10, 20, 35]);

  // Form states: Auto-Bustle System Players
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [scheduleStart, setScheduleStart] = useState('00:00');
  const [scheduleEnd, setScheduleEnd] = useState('24:00');
  const [riskPercent, setRiskPercent] = useState<number>(25);
  const [stakeConfigs, setStakeConfigs] = useState<Record<string, StakeConfig>>({
    stake_1: { min: 2, max: 5, enabled: true },
    stake_2: { min: 2, max: 5, enabled: true },
    stake_3: { min: 1, max: 3, enabled: false },
    stake_4: { min: 1, max: 2, enabled: false },
  });

  // Form states: Waiter Players
  const [waiterEnabled, setWaiterEnabled] = useState(true);
  const [waiterStakeConfigs, setWaiterStakeConfigs] = useState<Record<string, WaiterStakeConfig>>({
    stake_1: { min: 1, max: 2, enabled: true },
    stake_2: { min: 1, max: 2, enabled: true },
    stake_3: { min: 1, max: 2, enabled: false },
    stake_4: { min: 1, max: 2, enabled: false },
  });

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

  const fetchHdaseRoom = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch(`${API_URL}/admin/hdase-room`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        const r = data.room;
        setRoom(r);
        setBotCount(data.bot_count || 0);
        setLiveGames(data.live_games || []);

        if (Array.isArray(r.stakes) && r.stakes.length === 4) {
          setStakes(r.stakes.map(Number));
        }
        setSystemEnabled(r.system_players_enabled !== undefined ? Boolean(r.system_players_enabled) : true);
        setScheduleStart(r.system_players_schedule_start || '00:00');
        setScheduleEnd(r.system_players_schedule_end || '24:00');
        setRiskPercent(Number(r.system_players_risk_percent ?? 25));

        if (r.system_players_stake_configs) {
          setStakeConfigs(prev => ({ ...prev, ...r.system_players_stake_configs }));
        }

        setWaiterEnabled(r.waiter_players_enabled !== undefined ? Boolean(r.waiter_players_enabled) : true);
        if (r.waiter_players_stake_configs) {
          setWaiterStakeConfigs(prev => ({ ...prev, ...r.waiter_players_stake_configs }));
        }
      } else {
        if (!isSilent) showToast('error', 'Failed to load HDASE BINGO room details');
      }
    } catch {
      if (!isSilent) showToast('error', 'Network error connecting to server');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHdaseRoom();

    // Fast polling for live games monitoring every 3s
    pollIntervalRef.current = setInterval(() => {
      fetchHdaseRoom(true);
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchHdaseRoom]);

  // Handle Save All Settings
  const handleSave = async () => {
    triggerHaptic('medium');
    setSaving(true);
    try {
      const payload = {
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
        showToast('success', 'HDASE BINGO room settings saved successfully!');
        fetchHdaseRoom(true);
      } else {
        const err = await res.json();
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
    triggerHaptic('heavy');
    setReseeding(true);
    try {
      const res = await fetch(`${API_URL}/admin/hdase-room/reseed`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const d = await res.json();
        setBotCount(d.bot_count || 1000);
        showToast('success', d.message || '1,000 bots seeded successfully!');
      } else {
        showToast('error', 'Failed to seed bots');
      }
    } catch {
      showToast('error', 'Network error seeding bots');
    } finally {
      setReseeding(false);
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
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
        <RefreshCw size={36} className="text-amber-500 animate-spin mb-3" />
        <p className="font-black text-slate-700 text-sm tracking-wider uppercase">Loading HDASE BINGO Room...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 pb-28">
      {/* ─── STICKY HEADER ─── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 py-3 shadow-xs flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              triggerHaptic('light');
              navigate('/admin');
            }}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:scale-95 transition-transform"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <Flame size={16} className="text-amber-500 fill-amber-500" />
              <h1 className="font-black text-base text-slate-900 leading-tight">HDASE BINGO</h1>
              <span className="bg-amber-100 text-amber-900 font-black text-[9px] px-1.5 py-0.5 rounded-full border border-amber-300">
                OFFICIAL
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Room ID: {HDASE_ROOM_ID.slice(0, 8)}... • Platform Managed</p>
          </div>
        </div>

        <button
          onClick={() => {
            triggerHaptic('light');
            fetchHdaseRoom();
          }}
          className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 hover:bg-amber-100 active:scale-95 transition-transform"
          title="Refresh Room"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* ─── TOAST MESSAGE ─── */}
      {toastMsg && (
        <div
          className={`fixed top-16 left-4 right-4 z-50 p-3 rounded-2xl shadow-xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMsg.type === 'success'
              ? 'bg-emerald-600 text-white border border-emerald-500'
              : 'bg-rose-600 text-white border border-rose-500'
          }`}
        >
          {toastMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="font-bold text-xs flex-1">{toastMsg.text}</span>
        </div>
      )}

      <div className="p-4 space-y-4 max-w-xl mx-auto w-full">
        {/* ─── PLATFORM STATUS & ZERO-DEDUCTION GUARANTEE BANNER ─── */}
        <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 rounded-3xl p-4 text-white shadow-md relative overflow-hidden border border-emerald-400/40">
          <div className="absolute -right-4 -bottom-4 opacity-15 pointer-events-none">
            <ShieldCheck size={130} />
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping" />
                <span className="font-black text-xs tracking-wider uppercase text-emerald-100">Permanent Official Room</span>
              </div>
              <span className="bg-white/20 backdrop-blur-xs font-black text-[10px] px-2 py-0.5 rounded-full border border-white/30 text-white">
                PRO ACTIVE ✓
              </span>
            </div>

            <h2 className="font-black text-lg text-white mb-1">Zero Admin Balance Required</h2>
            <p className="text-emerald-100 text-[11px] leading-relaxed">
              Unlike third-party agent rooms, <strong>HDASE BINGO</strong> never requires monthly Pro upgrades or deposit stakes. Waiter bots and system players operate 24/7 on platform logic — <strong>wins, losses, and joins never deduct or touch the admin wallet balance.</strong>
            </p>
          </div>
        </div>

        {/* ─── SECTION 1: ROOM STAKES CONFIGURATION ─── */}
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
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              4 STAKES
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-1">
            {stakes.map((stk, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex flex-col items-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  Tier {idx + 1}
                </span>
                <div className="flex items-center gap-0.5 w-full">
                  <input
                    type="number"
                    min={1}
                    value={stk}
                    onChange={(e) => handleStakeChange(idx, e.target.value)}
                    className="w-full text-center font-black text-base text-slate-800 bg-white border border-slate-300 rounded-xl py-1 shadow-2xs focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  />
                </div>
                <span className="text-[8.5px] font-bold text-slate-500 mt-1">ETB</span>
              </div>
            ))}
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-slate-400">Presets:</span>
            {[
              [5, 10, 20, 35],
              [10, 20, 50, 100],
              [2, 5, 10, 25],
            ].map((preset, pIdx) => (
              <button
                key={pIdx}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setStakes(preset);
                }}
                className="text-[10px] font-black px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              >
                {preset.join('/')}
              </button>
            ))}
          </div>
        </div>

        {/* ─── SECTION 2: SYSTEM PLAYERS (AUTO-BUSTLE) ─── */}
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

            {/* Master Toggle */}
            <button
              onClick={() => {
                triggerHaptic('medium');
                setSystemEnabled(prev => !prev);
              }}
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
              {/* Operating Schedule */}
              <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-amber-900 font-black text-xs">
                    <Clock size={13} className="text-amber-600" />
                    <span>Operating Hours (East Africa Time)</span>
                  </div>
                  <button
                    type="button"
                    onClick={set24Hours}
                    className="text-[9px] font-black bg-amber-200/80 hover:bg-amber-300 text-amber-900 px-2 py-0.5 rounded-full transition-colors"
                  >
                    24/7 ALL DAY
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className="w-full bg-white border border-amber-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={scheduleEnd}
                      onChange={(e) => setScheduleEnd(e.target.value)}
                      className="w-full bg-white border border-amber-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Per-Stake Bot Distribution */}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Bot Counts Per Stake ({stakes.map(s => `${s} ETB`).join(', ')})
                </p>

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

            {/* Waiter Toggle */}
            <button
              onClick={() => {
                triggerHaptic('medium');
                setWaiterEnabled(prev => !prev);
              }}
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

        {/* ─── SECTION 4: LIVE MONITOR & 1,000 BOT POOL ─── */}
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

          {/* Bot Pool Counter Pill */}
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
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              ACTIVE
            </span>
          </div>

          {/* Live Matches Across 4 Stakes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Live Tables ({liveGames.length} Active)
              </span>
              <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live 3s Polling
              </span>
            </div>

            {liveGames.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs font-bold text-slate-400">
                No active games currently in progress for HDASE BINGO. Games spin up as players enter.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {liveGames.map((g) => (
                  <div key={g.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-xs text-slate-800">{g.stake} ETB</span>
                        <span className={`text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase ${
                          g.status === 'calling'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {g.status === 'calling' ? `Calling (${g.called_count}/75)` : 'Waiting...'}
                        </span>
                      </div>
                      <span className="font-black text-xs text-amber-700">{g.prize_pool} ETB Pot</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-200/60 text-center">
                      <div className="bg-white rounded-lg p-1 border border-slate-100">
                        <span className="text-[7.5px] font-bold text-slate-400 block uppercase">Real</span>
                        <span className="text-xs font-black text-emerald-600">{g.real_count}</span>
                      </div>
                      <div className="bg-white rounded-lg p-1 border border-slate-100">
                        <span className="text-[7.5px] font-bold text-slate-400 block uppercase">Bots</span>
                        <span className="text-xs font-black text-amber-600">{g.system_count}</span>
                      </div>
                      <div className="bg-white rounded-lg p-1 border border-slate-100">
                        <span className="text-[7.5px] font-bold text-slate-400 block uppercase">Waiters</span>
                        <span className="text-xs font-black text-purple-600">{g.waiter_count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── BOTTOM FLOATING SAVE ACTION BAR ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 pb-safe shadow-lg max-w-xl mx-auto">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <span>Saving HDASE BINGO Settings...</span>
            </>
          ) : (
            <>
              <Save size={18} />
              <span>Save HDASE BINGO Settings</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
