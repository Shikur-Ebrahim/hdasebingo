import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  X,
  Bot,
  Zap,
  Clock,
  ShieldAlert,
  Users,
  CheckCircle2,
  AlertCircle,
  Copy,
  Search,
  Sparkles,
  Sliders,
  DollarSign,
  Building2,
  Calendar,
  Check
} from 'lucide-react';

interface ManagerAccount {
  id: string;
  bank_type: string;
  account_name: string;
  account_number: string;
}

interface StakeTierConfig {
  min: number;
  max: number;
}

interface StakeConfigs {
  stake_1: StakeTierConfig;
  stake_2: StakeTierConfig;
  stake_3: StakeTierConfig;
  stake_4: StakeTierConfig;
}

interface Props {
  roomId: string;
  roomName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const API = import.meta.env.VITE_API_URL || '/api';

export default function AgentSystemPlayerModal({
  roomId,
  roomName,
  onClose,
  onSuccess,
}: Props) {
  const [activeTab, setActiveTab] = useState<'settings' | 'upgrade' | 'pool'>('settings');

  // Status state
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [isProActive, setIsProActive] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [proExpiresAt, setProExpiresAt] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState('00:00');
  const [scheduleEnd, setScheduleEnd] = useState('24:00');
  const [riskPercent, setRiskPercent] = useState(25);
  const [monthlyPrice, setMonthlyPrice] = useState(1000);
  const [agentBalance, setAgentBalance] = useState(0);
  const [totalBotsInPool, setTotalBotsInPool] = useState(0);
  const [managerAccounts, setManagerAccounts] = useState<ManagerAccount[]>([]);

  // Stake configs
  const [stakeConfigs, setStakeConfigs] = useState<StakeConfigs>({
    stake_1: { min: 4, max: 15 },
    stake_2: { min: 3, max: 9 },
    stake_3: { min: 2, max: 5 },
    stake_4: { min: 2, max: 4 },
  });

  // Action states
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);

  // Pool browsing state
  const [botSearch, setBotSearch] = useState('');
  const [botList, setBotList] = useState<any[]>([]);
  const [botPage, setBotPage] = useState(1);
  const [totalBotPages, setTotalBotPages] = useState(1);
  const [loadingPool, setLoadingPool] = useState(false);

  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    try {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred(type);
      }
    } catch {}
  };

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const initData = WebApp?.initData || '';
      const res = await fetch(`${API}/system-players/status?roomId=${roomId}`, {
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load system player status');
      }

      const data = await res.json();
      setEnabled(Boolean(data.enabled));
      setIsProActive(Boolean(data.is_pro_active));
      setDaysRemaining(Number(data.days_remaining || 0));
      setProExpiresAt(data.pro_expires_at);
      setScheduleStart(data.schedule_start || '00:00');
      setScheduleEnd(data.schedule_end || '24:00');
      setRiskPercent(Number(data.risk_percent ?? 25));
      setMonthlyPrice(Number(data.monthly_price ?? 1000));
      setAgentBalance(Number(data.agent_balance || 0));
      setTotalBotsInPool(Number(data.total_bots_in_pool || 0));
      setManagerAccounts(data.manager_accounts || []);

      if (data.stake_configs) {
        setStakeConfigs(data.stake_configs);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading status');
    } finally {
      setLoading(false);
    }
  };

  const fetchPool = async (page = 1, search = '') => {
    try {
      setLoadingPool(true);
      const initData = WebApp?.initData || '';
      const res = await fetch(
        `${API}/system-players/pool?roomId=${roomId}&page=${page}&limit=30&search=${encodeURIComponent(search)}`,
        {
          headers: {
            'x-telegram-init-data': initData,
            'Content-Type': 'application/json',
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setBotList(data.players || []);
        setBotPage(data.page || 1);
        setTotalBotPages(data.total_pages || 1);
        if (data.total !== undefined) {
          setTotalBotsInPool(data.total);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingPool(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [roomId]);

  useEffect(() => {
    if (activeTab === 'pool') {
      fetchPool(1, botSearch);
    }
  }, [activeTab]);

  const handleCopy = (text: string, id: string) => {
    triggerHaptic('light');
    navigator.clipboard.writeText(text);
    setCopiedAccount(id);
    setTimeout(() => setCopiedAccount(null), 2500);
  };

  const handleSaveSettings = async () => {
    triggerHaptic('medium');
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const initData = WebApp?.initData || '';
      const res = await fetch(`${API}/system-players/settings`, {
        method: 'POST',
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          enabled,
          schedule_start: scheduleStart,
          schedule_end: scheduleEnd,
          stake_configs: stakeConfigs,
          risk_percent: riskPercent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccessMsg('Settings saved successfully!');
      setTimeout(() => setSuccessMsg(null), 3500);
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleUpgradeBalance = async () => {
    triggerHaptic('heavy');
    setUpgrading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const initData = WebApp?.initData || '';
      const res = await fetch(`${API}/system-players/upgrade`, {
        method: 'POST',
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          method: 'balance',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upgrade failed');
      }

      setIsProActive(true);
      setDaysRemaining(30);
      setProExpiresAt(data.pro_expires_at);
      if (data.new_balance !== undefined) {
        setAgentBalance(data.new_balance);
      }
      setSuccessMsg('🎉 Successfully upgraded to Pro Level 1 (30 days active)!');
      setTimeout(() => setSuccessMsg(null), 4000);
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Upgrade failed');
    } finally {
      setUpgrading(false);
    }
  };

  const handleInitPool = async () => {
    triggerHaptic('medium');
    setSeeding(true);
    try {
      const initData = WebApp?.initData || '';
      const res = await fetch(`${API}/system-players/init-pool`, {
        method: 'POST',
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      if (res.ok) {
        setTotalBotsInPool(data.total_bots || 1000);
        setSuccessMsg(`Pool initialized with ${data.total_bots || 1000} bots!`);
        setTimeout(() => setSuccessMsg(null), 3000);
        if (activeTab === 'pool') fetchPool(1, botSearch);
      }
    } catch {
      /* ignore */
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="relative p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
              <Bot size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm tracking-wide text-white">System Player (AI Bots)</h3>
                {isProActive ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-xs">
                    PRO Level 1
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/30 text-amber-300 border border-amber-400/40">
                    Pro Needed
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-300 font-medium">
                {roomName} • {isProActive ? `Active (${daysRemaining}d left)` : 'Upgrade for 1,000 ETB/mo'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 active:scale-90 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center border-b border-slate-100 bg-slate-50/70 p-1.5 shrink-0 gap-1">
          <button
            onClick={() => { triggerHaptic('light'); setActiveTab('settings'); }}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders size={13} />
            <span>Settings</span>
          </button>
          <button
            onClick={() => { triggerHaptic('light'); setActiveTab('upgrade'); }}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'upgrade'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap size={13} className={isProActive ? 'text-emerald-500' : 'text-amber-500'} />
            <span>Pro & Payment</span>
          </button>
          <button
            onClick={() => { triggerHaptic('light'); setActiveTab('pool'); }}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'pool'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users size={13} />
            <span>Pool ({totalBotsInPool})</span>
          </button>
        </div>

        {/* Toast notifications */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-rose-700 text-xs font-bold shrink-0 animate-in fade-in">
            <AlertCircle size={16} className="text-rose-500 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-700 text-xs font-bold shrink-0 animate-in fade-in">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <span className="flex-1">{successMsg}</span>
          </div>
        )}

        {/* Tab contents */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ──────────────── TAB 1: SETTINGS ──────────────── */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Pro Lock Notice if not upgraded */}
              {!isProActive && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Zap size={16} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-black text-amber-900">Pro Level 1 Upgrade Required</h4>
                    <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                      To activate System Players for this room, upgrade to <b>Pro Level 1</b> (1,000 ETB/mo).
                    </p>
                    <button
                      onClick={() => setActiveTab('upgrade')}
                      className="mt-2 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-[11px] font-black shadow-xs hover:bg-amber-600 active:scale-95 transition-all"
                    >
                      Upgrade Now (1,000 ETB) →
                    </button>
                  </div>
                </div>
              )}

              {/* Master ON/OFF Switch */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Bot size={15} className="text-indigo-600" />
                    <span>System Players Status</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    Default is OFF. Turn ON to allow bots to join games.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isProActive}
                  onClick={() => {
                    triggerHaptic('medium');
                    setEnabled(!enabled);
                  }}
                  className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    !isProActive ? 'opacity-40 cursor-not-allowed bg-slate-300' : enabled ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 24h Schedule */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock size={15} className="text-indigo-600" />
                    <h4 className="text-xs font-black text-slate-800">Operating Schedule (24-Hour)</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">Ethiopia Time (UTC+3)</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  System players only join waiting games during this interval. Default: <b>00:00 to 24:00 (24h)</b>.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-600 uppercase">Start Time</label>
                    <input
                      type="time"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-600 uppercase">End Time</label>
                    <input
                      type="time"
                      value={scheduleEnd}
                      onChange={(e) => setScheduleEnd(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Schedule Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => { triggerHaptic('light'); setScheduleStart('00:00'); setScheduleEnd('24:00'); }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-black text-slate-700 active:scale-95 transition-all"
                  >
                    ⚡ 24h All Day (00:00 - 24:00)
                  </button>
                  <button
                    type="button"
                    onClick={() => { triggerHaptic('light'); setScheduleStart('08:00'); setScheduleEnd('23:00'); }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-black text-slate-700 active:scale-95 transition-all"
                  >
                    ☀️ Daytime (08:00 - 23:00)
                  </button>
                  <button
                    type="button"
                    onClick={() => { triggerHaptic('light'); setScheduleStart('18:00'); setScheduleEnd('04:00'); }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-black text-slate-700 active:scale-95 transition-all"
                  >
                    🌙 Night Peak (18:00 - 04:00)
                  </button>
                </div>
              </div>

              {/* Bot Targets by Stake */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users size={15} className="text-indigo-600" />
                    <h4 className="text-xs font-black text-slate-800">Target System Players by Stake</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">Min - Max Bots</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  Configures how many bots randomly join waiting tables for each stake tier:
                </p>

                <div className="space-y-2.5">
                  {/* Stake 1 */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-800">1st Stake (Lowest)</p>
                      <p className="text-[9px] text-slate-400 font-bold">Default: 4 - 15 bots</p>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={stakeConfigs.stake_1.min}
                        onChange={(e) => setStakeConfigs(prev => ({
                          ...prev,
                          stake_1: { ...prev.stake_1, min: Number(e.target.value) }
                        }))}
                        className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800"
                      />
                      <span className="text-xs text-slate-400">-</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={stakeConfigs.stake_1.max}
                        onChange={(e) => setStakeConfigs(prev => ({
                          ...prev,
                          stake_1: { ...prev.stake_1, max: Number(e.target.value) }
                        }))}
                        className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Stake 2 */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-800">2nd Stake (Medium)</p>
                      <p className="text-[9px] text-slate-400 font-bold">Default: 3 - 9 bots</p>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={stakeConfigs.stake_2.min}
                        onChange={(e) => setStakeConfigs(prev => ({
                          ...prev,
                          stake_2: { ...prev.stake_2, min: Number(e.target.value) }
                        }))}
                        className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800"
                      />
                      <span className="text-xs text-slate-400">-</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={stakeConfigs.stake_2.max}
                        onChange={(e) => setStakeConfigs(prev => ({
                          ...prev,
                          stake_2: { ...prev.stake_2, max: Number(e.target.value) }
                        }))}
                        className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Stake 3 */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-800">3rd Stake (High)</p>
                      <p className="text-[9px] text-slate-400 font-bold">Default: 2 - 5 bots</p>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={stakeConfigs.stake_3.min}
                        onChange={(e) => setStakeConfigs(prev => ({
                          ...prev,
                          stake_3: { ...prev.stake_3, min: Number(e.target.value) }
                        }))}
                        className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800"
                      />
                      <span className="text-xs text-slate-400">-</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={stakeConfigs.stake_3.max}
                        onChange={(e) => setStakeConfigs(prev => ({
                          ...prev,
                          stake_3: { ...prev.stake_3, max: Number(e.target.value) }
                        }))}
                        className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Stake 4 */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-800">4th Stake (VIP)</p>
                      <p className="text-[9px] text-slate-400 font-bold">Default: 2 - 4 bots</p>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={stakeConfigs.stake_4.min}
                        onChange={(e) => setStakeConfigs(prev => ({
                          ...prev,
                          stake_4: { ...prev.stake_4, min: Number(e.target.value) }
                        }))}
                        className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800"
                      />
                      <span className="text-xs text-slate-400">-</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={stakeConfigs.stake_4.max}
                        onChange={(e) => setStakeConfigs(prev => ({
                          ...prev,
                          stake_4: { ...prev.stake_4, max: Number(e.target.value) }
                        }))}
                        className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 25% Risk Policy & Commission Rules Explanation */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300/60 space-y-2">
                <div className="flex items-center gap-1.5 text-amber-800">
                  <ShieldAlert size={16} />
                  <h4 className="text-xs font-black uppercase tracking-wide">Financial Rules & Risk Policy</h4>
                </div>
                <ul className="text-[11px] text-slate-700 space-y-1.5 font-medium leading-relaxed">
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-600 font-bold shrink-0">•</span>
                    <span>
                      <b>25% Room Owner Risk</b>: When a real user wins against system players, <b>25% of the total Derash</b> is deducted from the room owner's balance.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-emerald-600 font-bold shrink-0">✓</span>
                    <span className="text-emerald-800">
                      <b>Zero Risk when Real Only</b>: If a game has <b>0 system players</b> (all real users), your risk is <b>0 ETB (no deduction)</b>!
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-indigo-600 font-bold shrink-0">•</span>
                    <span>
                      <b>Real User Commission Only</b>: Room & agent commission is calculated strictly on real players' stakes (when &ge; 3 real users). System player stakes are 0% commission.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-purple-600 font-bold shrink-0">•</span>
                    <span>
                      <b>System Bot Wins</b>: Displays authentic Ethiopian name in celebration; their winnings increment in the pool profile; 0 ETB is deducted from your balance.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Save button */}
              <button
                type="button"
                disabled={saving || (!isProActive && enabled)}
                onClick={handleSaveSettings}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-black text-xs tracking-wider uppercase shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {saving ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </div>
          )}

          {/* ──────────────── TAB 2: PRO UPGRADE & PAYMENT ──────────────── */}
          {activeTab === 'upgrade' && (
            <div className="space-y-4">
              {/* Pro Status Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-wider text-amber-400">
                      Monthly Room Subscription
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5">PRO Level 1</h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Enables 24/7 AI System Players & automated table bustling.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-amber-400">{monthlyPrice}</p>
                    <p className="text-[10px] text-slate-300 font-bold">ETB / Month</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold">
                  <span>Current Status:</span>
                  {isProActive ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-black">
                      <CheckCircle2 size={14} /> ACTIVE ({daysRemaining} days remaining)
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1 font-black">
                      <AlertCircle size={14} /> EXPIRED / NOT UPGRADED
                    </span>
                  )}
                </div>
              </div>

              {/* Option 1: Pay with Agent Balance */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                      <DollarSign size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800">1-Click Instant Upgrade</h4>
                      <p className="text-[10px] text-slate-400 font-bold">Pay directly using your Agent Balance</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-800">{agentBalance} ETB</p>
                    <p className="text-[9px] text-slate-400 font-bold">Your Balance</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={upgrading || agentBalance < monthlyPrice}
                  onClick={handleUpgradeBalance}
                  className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                    agentBalance >= monthlyPrice
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Zap size={14} />
                  <span>
                    {upgrading
                      ? 'Activating Pro...'
                      : agentBalance >= monthlyPrice
                      ? `Upgrade with Balance (-${monthlyPrice} ETB)`
                      : `Insufficient Balance (Need ${monthlyPrice} ETB)`}
                  </span>
                </button>
              </div>

              {/* Option 2: Pay via Official Manager Accounts (Financial Audit) */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800">Official Manager Receiving Accounts</h4>
                    <p className="text-[10px] text-slate-400 font-bold">From platform Financial Audit section</p>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Transfer <b>{monthlyPrice} ETB</b> to any official manager account below with remark <b>"{roomName}"</b>:
                </p>

                {managerAccounts.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 text-center text-xs text-slate-400 font-bold">
                    No manager accounts configured yet. Contact platform administrator.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {managerAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-black bg-indigo-100 text-indigo-700">
                              {acc.bank_type}
                            </span>
                            <span className="text-xs font-black text-slate-800">{acc.account_name}</span>
                          </div>
                          <p className="text-xs font-mono font-black text-slate-700 mt-1 tracking-wider">
                            {acc.account_number}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(acc.account_number, acc.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[10px] font-black text-slate-700 flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
                        >
                          {copiedAccount === acc.id ? (
                            <>
                              <Check size={12} className="text-emerald-500" />
                              <span className="text-emerald-600">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ──────────────── TAB 3: BOT POOL ──────────────── */}
          {activeTab === 'pool' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-800">1,000 Registered System Players</h4>
                  <p className="text-[10px] text-slate-400 font-bold">
                    Authentic Ethiopian profiles registered for {roomName}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={seeding}
                  onClick={handleInitPool}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black hover:bg-indigo-100 active:scale-95 transition-all"
                >
                  {seeding ? 'Seeding...' : '⚡ Re-verify Pool'}
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Ethiopian player name (e.g. Abebe, Almaz)..."
                  value={botSearch}
                  onChange={(e) => {
                    setBotSearch(e.target.value);
                    fetchPool(1, e.target.value);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Bot List */}
              {loadingPool ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400">Loading bot pool...</div>
              ) : botList.length === 0 ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400 space-y-2">
                  <p>No system players found matching "{botSearch}".</p>
                  <button
                    type="button"
                    onClick={handleInitPool}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-black shadow-xs"
                  >
                    Seed 1,000 Bots Now
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
                  {botList.map((bot, index) => (
                    <div
                      key={bot.id}
                      className="p-2.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-600">
                          {index + 1 + (botPage - 1) * 30}
                        </div>
                        <div>
                          <p className="font-black text-slate-800">{bot.first_name}</p>
                          <p className="text-[9px] text-slate-400 font-bold">Simulated Ethiopian Player</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-emerald-600">{bot.total_won || 0} ETB</span>
                        <p className="text-[8px] text-slate-400 uppercase font-bold">Won</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalBotPages > 1 && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs font-bold text-slate-600">
                  <button
                    disabled={botPage <= 1}
                    onClick={() => fetchPool(botPage - 1, botSearch)}
                    className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-[10px]">Page {botPage} of {totalBotPages}</span>
                  <button
                    disabled={botPage >= totalBotPages}
                    onClick={() => fetchPool(botPage + 1, botSearch)}
                    className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
