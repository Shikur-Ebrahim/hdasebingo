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
  Check,
  Edit2,
  Plus,
  UploadCloud,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight
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
  const [pendingRequest, setPendingRequest] = useState<any | null>(null);

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

  // Transfer Proof submission state
  const [selectedAccId, setSelectedAccId] = useState<string>('');
  const [proofAmount, setProofAmount] = useState<string>('1000');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);

  // Pool browsing & editing state
  const [botSearch, setBotSearch] = useState('');
  const [botList, setBotList] = useState<any[]>([]);
  const [botPage, setBotPage] = useState(1);
  const [totalBotPages, setTotalBotPages] = useState(1);
  const [loadingPool, setLoadingPool] = useState(false);
  const [editingBot, setEditingBot] = useState<any | null>(null);
  const [editBotName, setEditBotName] = useState('');
  const [savingBotName, setSavingBotName] = useState(false);
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [addingBot, setAddingBot] = useState(false);

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
      setPendingRequest(data.pending_request || null);

      if (data.manager_accounts && data.manager_accounts.length > 0) {
        setSelectedAccId(data.manager_accounts[0].id);
      }

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
        `${API}/system-players/pool?roomId=${roomId}&page=${page}&limit=25&search=${encodeURIComponent(search)}`,
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
      fetchPool(botPage, botSearch);
    }
  }, [activeTab, botPage]);

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

  const uploadScreenshot = async (file: File): Promise<string> => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    const res = await fetch(`${API}/upload/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });
    if (!res.ok) throw new Error('Could not get upload URL');
    const { uploadUrl, publicUrl } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!uploadRes.ok) throw new Error('Screenshot upload failed. Please try again.');
    return publicUrl;
  };

  const handleSubmitProof = async () => {
    if (!proofFile) {
      setErrorMsg('Please select a payment screenshot');
      return;
    }
    const numAmt = parseFloat(proofAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setErrorMsg('Please enter a valid amount');
      return;
    }

    triggerHaptic('heavy');
    setSubmittingProof(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const selectedAccount = managerAccounts.find((a) => a.id === selectedAccId) || managerAccounts[0];
      const screenshotUrl = await uploadScreenshot(proofFile);
      const initData = WebApp?.initData || '';

      const res = await fetch(`${API}/system-players/submit-proof`, {
        method: 'POST',
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          manager_account_id: selectedAccount?.id,
          bank_type: selectedAccount?.bank_type || 'cbe',
          account_name: selectedAccount?.account_name || '',
          account_number: selectedAccount?.account_number || '',
          amount: numAmt,
          screenshot_url: screenshotUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit proof');
      }

      setPendingRequest(data.request);
      setSuccessMsg('🎉 Upgrade proof submitted! Admin will verify and activate Pro Level 1.');
      setProofFile(null);
      setProofPreview(null);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission failed');
    } finally {
      setSubmittingProof(false);
    }
  };

  const handleSaveBotName = async () => {
    if (!editingBot || !editBotName.trim()) return;
    triggerHaptic('medium');
    setSavingBotName(true);
    try {
      const initData = WebApp?.initData || '';
      const res = await fetch(`${API}/system-players/bot/${editingBot.id}`, {
        method: 'PUT',
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          first_name: editBotName.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBotList((prev) =>
          prev.map((b) => (b.id === editingBot.id ? { ...b, first_name: editBotName.trim() } : b))
        );
        setSuccessMsg(`Name updated to "${editBotName.trim()}"`);
        setEditingBot(null);
        setTimeout(() => setSuccessMsg(null), 2500);
      } else {
        setErrorMsg(data.error || 'Failed to update name');
      }
    } catch {
      setErrorMsg('Error updating bot name');
    } finally {
      setSavingBotName(false);
    }
  };

  const handleAddBot = async () => {
    if (!newBotName.trim()) return;
    triggerHaptic('medium');
    setAddingBot(true);
    try {
      const initData = WebApp?.initData || '';
      const res = await fetch(`${API}/system-players/add-bot`, {
        method: 'POST',
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          first_name: newBotName.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Added bot "${newBotName.trim()}"`);
        setNewBotName('');
        setShowAddBotModal(false);
        fetchPool(1, botSearch);
        setTimeout(() => setSuccessMsg(null), 2500);
      } else {
        setErrorMsg(data.error || 'Failed to add bot');
      }
    } catch {
      setErrorMsg('Error adding bot');
    } finally {
      setAddingBot(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col w-full h-full bg-slate-50 overflow-hidden animate-in fade-in duration-200">
      {/* ── MOBILE-FIRST FULLSCREEN HEADER ── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 pt-4 pb-3 flex items-center justify-between border-b border-white/10 shrink-0 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
            <Bot size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm tracking-wide text-white">System Player (AI Bots)</h3>
              {isProActive ? (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-xs">
                  PRO LEVEL 1
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/30 text-amber-300 border border-amber-400/40">
                  Pro Needed
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-300 font-medium">
              {roomName} • {isProActive ? `Active (${daysRemaining}d remaining)` : '1,000 ETB / month'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white active:scale-90 transition-all"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── TOP TABS ── */}
      <div className="flex items-center border-b border-slate-200 bg-white px-3 py-2 shrink-0 gap-1.5 shadow-2xs">
        <button
          onClick={() => { triggerHaptic('light'); setActiveTab('settings'); }}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'settings'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sliders size={13} />
          <span>Settings</span>
        </button>
        <button
          onClick={() => { triggerHaptic('light'); setActiveTab('upgrade'); }}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'upgrade'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap size={13} className={isProActive ? 'text-emerald-400' : 'text-amber-500'} />
          <span>Pro & Pay</span>
        </button>
        <button
          onClick={() => { triggerHaptic('light'); setActiveTab('pool'); }}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'pool'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users size={13} />
          <span>Pool ({totalBotsInPool})</span>
        </button>
      </div>

      {/* ── TOAST NOTIFICATIONS ── */}
      {errorMsg && (
        <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-rose-700 text-xs font-bold shrink-0 animate-in fade-in">
          <AlertCircle size={16} className="text-rose-500 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-700 text-xs font-bold shrink-0 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          <span className="flex-1">{successMsg}</span>
        </div>
      )}

      {/* ── SCROLLABLE BODY ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ──────────────── TAB 1: SETTINGS ──────────────── */}
        {activeTab === 'settings' && (
          <div className="space-y-4 max-w-md mx-auto">
            {/* Pro Lock Notice if not upgraded */}
            {!isProActive && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Zap size={16} />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-black text-amber-900">Pro Level 1 Upgrade Required</h4>
                  <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                    To activate System Players for this room, upgrade to <b>Pro Level 1</b> (1,000 ETB/month).
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
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 flex items-center justify-between shadow-xs">
              <div>
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Bot size={15} className="text-indigo-600" />
                  <span>System Players Master Switch</span>
                </h4>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                  Default is OFF. Turn ON to activate Ethiopian bots.
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
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-xs">
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
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-xs">
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
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300/60 space-y-2 shadow-xs">
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
          <div className="space-y-4 max-w-md mx-auto">
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

            {/* Pending Request Banner if any */}
            {pendingRequest && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-600 animate-spin" />
                  <h4 className="text-xs font-black">Upgrade Request Pending Review</h4>
                </div>
                <p className="text-[11px] leading-relaxed">
                  You submitted <b>{pendingRequest.amount} ETB</b> via <b>{pendingRequest.bank_type?.toUpperCase()}</b>. Management is verifying your payment screenshot and will activate Pro Level 1 shortly!
                </p>
              </div>
            )}

            {/* Option 1: Pay with Agent Balance */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-xs">
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
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3.5 shadow-xs">
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
                Copy an official account below, transfer <b>{monthlyPrice} ETB</b>, and submit your receipt screenshot:
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
                      onClick={() => setSelectedAccId(acc.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        selectedAccId === acc.id
                          ? 'bg-indigo-50/70 border-indigo-400 shadow-2xs'
                          : 'bg-slate-50 border-slate-200/60 hover:border-slate-300'
                      }`}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(acc.account_number, acc.id);
                        }}
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

              {/* Transfer Proof Submission Form */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <h5 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <UploadCloud size={15} className="text-indigo-600" />
                  <span>Submit Payment Receipt / Screenshot</span>
                </h5>

                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase">Transfer Amount (ETB)</label>
                  <input
                    type="number"
                    value={proofAmount}
                    onChange={(e) => setProofAmount(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase">Payment Screenshot</label>
                  <div className="mt-1">
                    <input
                      type="file"
                      accept="image/*"
                      id="pro-screenshot-upload"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setProofFile(file);
                          setProofPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                    {proofPreview ? (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 p-2 flex items-center justify-between">
                        <img
                          src={proofPreview}
                          alt="Proof preview"
                          className="w-16 h-16 object-cover rounded-xl"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setProofFile(null);
                            setProofPreview(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 font-bold text-xs hover:bg-rose-100"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="pro-screenshot-upload"
                        className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all text-center"
                      >
                        <ImageIcon size={24} className="text-slate-400 mb-1" />
                        <span className="text-xs font-black text-indigo-600">Tap to upload receipt image</span>
                        <span className="text-[10px] text-slate-400 font-medium mt-0.5">PNG, JPG, JPEG</span>
                      </label>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={submittingProof || !proofFile}
                  onClick={handleSubmitProof}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-40"
                >
                  {submittingProof ? 'Uploading Receipt...' : 'Submit Receipt for Admin Review'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ──────────────── TAB 3: BOT POOL ──────────────── */}
        {activeTab === 'pool' && (
          <div className="space-y-3 max-w-md mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-slate-800">1,000 Ethiopian System Players</h4>
                <p className="text-[10px] text-slate-400 font-bold">
                  Saved exclusively for "{roomName}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewBotName('');
                  setShowAddBotModal(true);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black flex items-center gap-1 shadow-xs active:scale-95"
              >
                <Plus size={12} />
                <span>Add Bot</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Ethiopian player name (e.g. Abebe, Almaz)..."
                value={botSearch}
                onChange={(e) => {
                  setBotSearch(e.target.value);
                  fetchPool(1, e.target.value);
                }}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-xs"
              />
            </div>

            {/* Bot List */}
            {loadingPool ? (
              <div className="py-16 text-center text-xs font-bold text-slate-400">Loading Ethiopian bots pool...</div>
            ) : botList.length === 0 ? (
              <div className="py-16 text-center text-xs font-bold text-slate-400 space-y-2 bg-white rounded-2xl p-6 border border-slate-100">
                <Bot size={28} className="mx-auto text-slate-300" />
                <p>No system players found matching "{botSearch}".</p>
                <button
                  type="button"
                  onClick={() => fetchPool(1, '')}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-black shadow-xs"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {botList.map((bot, index) => (
                  <div
                    key={bot.id}
                    className="p-3 rounded-2xl bg-white border border-slate-200/70 hover:border-indigo-300 flex items-center justify-between text-xs shadow-2xs"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-600">
                        {index + 1 + (botPage - 1) * 25}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-black text-slate-900 text-xs">{bot.first_name}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBot(bot);
                              setEditBotName(bot.first_name);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 active:scale-90 transition-all"
                            title="Edit name"
                          >
                            <Edit2 size={11} />
                          </button>
                        </div>
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

            {/* Pagination Controls */}
            {totalBotPages > 1 && (
              <div className="flex items-center justify-between p-2 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
                <button
                  disabled={botPage <= 1}
                  onClick={() => setBotPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black disabled:opacity-40 flex items-center gap-1"
                >
                  <ChevronLeft size={14} />
                  <span>Prev</span>
                </button>
                <span className="text-[11px] font-black text-slate-500">
                  Page {botPage} of {totalBotPages} ({totalBotsInPool} total)
                </span>
                <button
                  disabled={botPage >= totalBotPages}
                  onClick={() => setBotPage((p) => Math.min(totalBotPages, p + 1))}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black disabled:opacity-40 flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── EDIT BOT NAME MODAL ── */}
      {editingBot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">Edit System Player Name</h3>
              <button
                onClick={() => setEditingBot(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Customize the name of this bot for <b>{roomName}</b>:
            </p>
            <input
              type="text"
              value={editBotName}
              onChange={(e) => setEditBotName(e.target.value)}
              placeholder="e.g. Abebe Kebede, Almaz Tadesse..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingBot(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 font-black text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                disabled={savingBotName || !editBotName.trim()}
                onClick={handleSaveBotName}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs shadow-xs"
              >
                {savingBotName ? 'Saving...' : 'Save Name'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD NEW BOT MODAL ── */}
      {showAddBotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">Add New System Player</h3>
              <button
                onClick={() => setShowAddBotModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Enter a name to register a new system player in <b>{roomName}</b>'s pool:
            </p>
            <input
              type="text"
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              placeholder="e.g. Dawit Haile, Tigist Girma..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddBotModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 font-black text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                disabled={addingBot || !newBotName.trim()}
                onClick={handleAddBot}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs shadow-xs"
              >
                {addingBot ? 'Adding...' : 'Add to Pool'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
