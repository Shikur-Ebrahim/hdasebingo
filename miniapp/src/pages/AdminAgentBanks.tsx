/**
 * AdminAgentBanks — Dedicated Admin Management Page for Agent Attack Banks
 * Route: /admin/agent-banks
 * Allows Admin to:
 * 1. View all agents' saved bank accounts with real authentic bank logos
 * 2. View/reveal account numbers with eye icon toggle
 * 3. View/reveal saved PIN with eye icon toggle
 * 4. Easily reset/update PIN for any agent
 * 5. Edit bank account details or unlink
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  Search,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Edit3,
  Trash2,
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { VERIFIED_BANKS, getBankDetails, BankItem } from '../components/AgentAttackBank';

const API = import.meta.env.VITE_API_URL || '/api';

interface AgentBankAccount {
  id: string;
  telegram_id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  plain_pin?: string;
  pin_hash?: string;
  created_at?: string;
  updated_at?: string;
  users?: {
    first_name: string;
    username?: string;
    main_balance?: number;
  };
}

export default function AdminAgentBanks() {
  const { user } = useGameStore();
  const [accounts, setAccounts] = useState<AgentBankAccount[]>([]);
  const [banks, setBanks] = useState<BankItem[]>(VERIFIED_BANKS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Visibility toggles
  const [revealedAcc, setRevealedAcc] = useState<Record<string, boolean>>({});
  const [revealedPin, setRevealedPin] = useState<Record<string, boolean>>({});

  // Reset PIN Modal
  const [pinModalAccount, setPinModalAccount] = useState<AgentBankAccount | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // Edit Account Modal
  const [editModalAccount, setEditModalAccount] = useState<AgentBankAccount | null>(null);
  const [editBankName, setEditBankName] = useState('');
  const [editHolderName, setEditHolderName] = useState('');
  const [editAccNumber, setEditAccNumber] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete Modal
  const [deleteAccount, setDeleteAccount] = useState<AgentBankAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/admin/agent-bank/list`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch method logos & accounts on mount
  useEffect(() => {
    fetchAccounts();

    // Fetch live method logos
    (async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const headers = { 'x-telegram-init-data': initData };
        const [depRes, withRes] = await Promise.all([
          fetch(`${API}/deposit/methods`, { headers }).then(r => r.ok ? r.json() : []),
          fetch(`${API}/withdraw/methods`, { headers }).then(r => r.ok ? r.json() : []),
        ]);
        const logoMap: Record<string, string> = {};
        if (Array.isArray(depRes)) {
          depRes.forEach((m: any) => { if (m.type && m.logo_url) logoMap[m.type.toLowerCase()] = m.logo_url; });
        }
        if (Array.isArray(withRes)) {
          withRes.forEach((m: any) => { if (m.type && m.logo_url) logoMap[m.type.toLowerCase()] = m.logo_url; });
        }
        setBanks(prev => prev.map(b => ({
          ...b,
          logo_url: logoMap[b.id.toLowerCase()] || b.logo_url,
        })));
      } catch {}
    })();
  }, [fetchAccounts]);

  // Filter accounts by search query
  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(acc =>
      (acc.bank_name || '').toLowerCase().includes(q) ||
      (acc.account_holder_name || '').toLowerCase().includes(q) ||
      (acc.account_number || '').toLowerCase().includes(q) ||
      (acc.telegram_id || '').toLowerCase().includes(q) ||
      (acc.users?.first_name || '').toLowerCase().includes(q) ||
      (acc.users?.username || '').toLowerCase().includes(q)
    );
  }, [accounts, search]);

  // Handle PIN Reset Submission
  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalAccount) return;
    setPinError('');
    setPinSuccess('');

    if (!/^\d{6}$/.test(newPin)) {
      setPinError('PIN must be exactly 6 digits (numbers only).');
      return;
    }

    try {
      setPinSubmitting(true);
      const res = await fetch(`${API}/admin/agent-bank/reset-pin`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          telegram_id: pinModalAccount.telegram_id,
          new_pin: newPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data.error || 'Failed to update PIN');
        return;
      }

      haptic('heavy');
      setPinSuccess('PIN updated successfully!');

      // Update state locally
      setAccounts(prev =>
        prev.map(acc =>
          acc.telegram_id === pinModalAccount.telegram_id
            ? { ...acc, plain_pin: newPin, updated_at: new Date().toISOString() }
            : acc
        )
      );

      setTimeout(() => {
        setPinModalAccount(null);
        setNewPin('');
        setPinSuccess('');
      }, 900);
    } catch {
      setPinError('Network error. Please try again.');
    } finally {
      setPinSubmitting(false);
    }
  };

  // Handle Edit Account Submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalAccount) return;
    setEditError('');

    if (!editBankName.trim() || !editHolderName.trim() || !editAccNumber.trim()) {
      setEditError('All fields are required.');
      return;
    }

    try {
      setEditSubmitting(true);
      const res = await fetch(`${API}/admin/agent-bank/update-details`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          telegram_id: editModalAccount.telegram_id,
          bank_name: editBankName.trim(),
          account_holder_name: editHolderName.trim(),
          account_number: editAccNumber.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Failed to update details');
        return;
      }

      haptic('medium');
      setAccounts(prev =>
        prev.map(acc =>
          acc.telegram_id === editModalAccount.telegram_id
            ? {
                ...acc,
                bank_name: editBankName.trim(),
                account_holder_name: editHolderName.trim(),
                account_number: editAccNumber.trim(),
                updated_at: new Date().toISOString(),
              }
            : acc
        )
      );
      setEditModalAccount(null);
    } catch {
      setEditError('Network error. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Handle Delete Submission
  const handleDeleteSubmit = async () => {
    if (!deleteAccount) return;
    try {
      setDeleting(true);
      const res = await fetch(`${API}/admin/agent-bank/delete/${deleteAccount.telegram_id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) {
        alert('Failed to delete bank account');
        return;
      }
      haptic('heavy');
      setAccounts(prev => prev.filter(acc => acc.telegram_id !== deleteAccount.telegram_id));
      setDeleteAccount(null);
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const generateRandomPin = () => {
    haptic('light');
    const random = Math.floor(100000 + Math.random() * 900000).toString();
    setNewPin(random);
  };

  if (!user || (user.role !== 'admin' && user.role !== 'worker')) {
    return (
      <div className="p-10 text-center font-bold text-slate-600">
        Access Denied. Admin role only.
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 pb-12 select-none">
      {/* ── Top Header Bar ── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-3">
          <Link
            to="/admin"
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 active:scale-95 transition-all"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-black text-slate-900 leading-tight">
              Agent Attack Banks
            </h1>
            <p className="text-[10px] text-slate-400 font-bold">
              {accounts.length} Saved Agent {accounts.length === 1 ? 'Bank' : 'Banks'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            haptic('light');
            fetchAccounts();
          }}
          disabled={loading}
          className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-amber-500' : ''} />
        </button>
      </div>

      <div className="p-4 space-y-4 max-w-xl mx-auto w-full">
        {/* ── Search Bar ── */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by agent name, bank, account number..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all shadow-2xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── List Content ── */}
        {loading && accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RefreshCw size={28} className="animate-spin text-amber-500" />
            <p className="text-xs font-bold text-slate-400">Loading agent banks...</p>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-slate-100 text-center space-y-3 shadow-2xs">
            <Building2 size={36} className="mx-auto text-slate-300" />
            <p className="text-sm font-black text-slate-800">
              {search ? 'No matching agent banks found' : 'No agent bank accounts yet'}
            </p>
            <p className="text-xs text-slate-400">
              {search
                ? 'Try searching with a different agent name or bank details'
                : 'When agents link their bank in Attack Bank, they will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredAccounts.map(acc => {
              const bankItem = getBankDetails(acc.bank_name, banks);
              const isAccRevealed = !!revealedAcc[acc.telegram_id];
              const isPinRevealed = !!revealedPin[acc.telegram_id];

              return (
                <div
                  key={acc.id || acc.telegram_id}
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-2xs space-y-4 transition-all"
                >
                  {/* Top: Agent Profile & Bank Logo */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      {/* Authentic Bank Logo */}
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center p-1.5 shrink-0 overflow-hidden relative">
                        {bankItem?.logo_url ? (
                          <img
                            src={bankItem.logo_url}
                            alt={acc.bank_name}
                            className="w-full h-full object-contain rounded-xl"
                            onError={e => {
                              e.currentTarget.style.display = 'none';
                              const fb = e.currentTarget.parentElement?.querySelector('.logo-fb') as HTMLElement;
                              if (fb) fb.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span
                          className="logo-fb hidden w-full h-full rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white font-black text-[10px] items-center justify-center tracking-wider uppercase text-center"
                          style={{ display: bankItem?.logo_url ? 'none' : 'flex' }}
                        >
                          {acc.bank_name.slice(0, 4)}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center space-x-1.5">
                          <p className="text-sm font-black text-slate-900 leading-tight">
                            {acc.users?.first_name || 'Agent'}
                          </p>
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                            AGENT
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                          {acc.users?.username ? `@${acc.users.username}` : `ID: ${acc.telegram_id}`}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <ShieldCheck size={10} className="text-emerald-600" />
                      Linked
                    </span>
                  </div>

                  {/* Bank Details Card */}
                  <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-100 space-y-2.5 text-xs">
                    {/* Bank Name */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold text-[11px]">Bank:</span>
                      <span className="font-black text-slate-900">{acc.bank_name}</span>
                    </div>

                    {/* Account Holder Name */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold text-[11px]">Account Holder:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-slate-900">{acc.account_holder_name}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(acc.account_holder_name, `${acc.telegram_id}-holder`)}
                          className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 active:scale-95"
                          title="Copy Holder Name"
                        >
                          {copiedField === `${acc.telegram_id}-holder` ? (
                            <Check size={12} className="text-emerald-500" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Account Number with Eye Toggle */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold text-[11px]">Account Number:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-slate-900">
                          {isAccRevealed
                            ? acc.account_number
                            : acc.account_number.length > 4
                            ? `•••• •••• ${acc.account_number.slice(-4)}`
                            : acc.account_number}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            haptic('light');
                            setRevealedAcc(prev => ({
                              ...prev,
                              [acc.telegram_id]: !prev[acc.telegram_id],
                            }));
                          }}
                          className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 active:scale-95"
                          title={isAccRevealed ? 'Hide Account Number' : 'Show Account Number'}
                        >
                          {isAccRevealed ? (
                            <EyeOff size={12} className="text-amber-700" />
                          ) : (
                            <Eye size={12} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(acc.account_number, `${acc.telegram_id}-acc`)}
                          className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 active:scale-95"
                          title="Copy Account Number"
                        >
                          {copiedField === `${acc.telegram_id}-acc` ? (
                            <Check size={12} className="text-emerald-500" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Withdrawal PIN / Password with Eye Toggle */}
                    <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400 font-bold text-[11px] flex items-center gap-1">
                        <KeyRound size={11} className="text-amber-600" />
                        Withdrawal PIN:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {acc.plain_pin ? (
                          <>
                            <span className="font-mono font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 text-xs tracking-wider">
                              {isPinRevealed ? acc.plain_pin : '••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                haptic('light');
                                setRevealedPin(prev => ({
                                  ...prev,
                                  [acc.telegram_id]: !prev[acc.telegram_id],
                                }));
                              }}
                              className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 active:scale-95"
                              title={isPinRevealed ? 'Hide PIN' : 'Reveal PIN'}
                            >
                              {isPinRevealed ? (
                                <EyeOff size={12} className="text-amber-700" />
                              ) : (
                                <Eye size={12} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(acc.plain_pin!, `${acc.telegram_id}-pin`)}
                              className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 active:scale-95"
                              title="Copy PIN"
                            >
                              {copiedField === `${acc.telegram_id}-pin` ? (
                                <Check size={12} className="text-emerald-500" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                            ●●●●●● (Protected)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Reset PIN, Edit, Delete */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {/* Reset PIN Button */}
                    <button
                      type="button"
                      onClick={() => {
                        haptic('medium');
                        setPinModalAccount(acc);
                        setNewPin(acc.plain_pin || '');
                        setPinError('');
                        setPinSuccess('');
                      }}
                      className="col-span-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <KeyRound size={13} />
                      <span>Reset PIN</span>
                    </button>

                    {/* Edit Details Button */}
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        setEditModalAccount(acc);
                        setEditBankName(acc.bank_name);
                        setEditHolderName(acc.account_holder_name);
                        setEditAccNumber(acc.account_number);
                        setEditError('');
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Edit3 size={13} />
                      <span>Edit</span>
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        setDeleteAccount(acc);
                      }}
                      className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-xs border border-rose-200 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── MODAL 1: RESET PIN MODAL ─── */}
      {pinModalAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => !pinSubmitting && setPinModalAccount(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 border border-slate-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Reset Withdrawal PIN</h3>
                  <p className="text-[11px] text-slate-400 font-semibold truncate max-w-[190px]">
                    {pinModalAccount.users?.first_name || 'Agent'} ({pinModalAccount.bank_name})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !pinSubmitting && setPinModalAccount(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleResetPinSubmit} className="space-y-4">
              {pinError && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl p-3">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              {pinSuccess && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl p-3">
                  <CheckCircle2 size={15} className="shrink-0" />
                  <span>{pinSuccess}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>New 6-Digit PIN</span>
                  <button
                    type="button"
                    onClick={generateRandomPin}
                    className="text-amber-600 hover:text-amber-700 flex items-center gap-1 text-[10px] font-black capitalize"
                  >
                    <Sparkles size={11} /> Generate Random
                  </button>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="e.g. 123456"
                  className="w-full text-center text-2xl tracking-widest font-mono font-black py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                />
                <p className="text-[10px] text-slate-400 font-semibold text-center">
                  Must be exactly 6 digits. The agent will use this PIN to withdraw.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPinModalAccount(null)}
                  disabled={pinSubmitting}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pinSubmitting || newPin.length !== 6}
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-xs active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {pinSubmitting ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Save PIN</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: EDIT BANK DETAILS MODAL ─── */}
      {editModalAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => !editSubmitting && setEditModalAccount(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 border border-slate-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Edit Bank Details</h3>
                  <p className="text-[11px] text-slate-400 font-semibold truncate max-w-[190px]">
                    {editModalAccount.users?.first_name || 'Agent'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !editSubmitting && setEditModalAccount(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              {editError && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl p-3">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Bank Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Select Bank
                </label>
                <select
                  value={editBankName}
                  onChange={e => setEditBankName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {banks.map(b => (
                    <option key={b.id} value={b.name}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Account Holder Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  value={editHolderName}
                  onChange={e => setEditHolderName(e.target.value)}
                  placeholder="Full name as on bank card"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Account Number */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Account Number
                </label>
                <input
                  type="text"
                  value={editAccNumber}
                  onChange={e => setEditAccNumber(e.target.value)}
                  placeholder="Bank or phone account number"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalAccount(null)}
                  disabled={editSubmitting}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-xs active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {editSubmitting ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: DELETE CONFIRMATION MODAL ─── */}
      {deleteAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => !deleting && setDeleteAccount(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 border border-slate-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <Trash2 size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">Delete Bank Account?</h3>
              <p className="text-xs text-slate-500 font-semibold">
                Are you sure you want to unlink the bank account for{' '}
                <strong className="text-slate-800 font-black">
                  {deleteAccount.users?.first_name || 'Agent'}
                </strong>
                ? The agent will need to re-link in Attack Bank.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteAccount(null)}
                disabled={deleting}
                className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={deleting}
                className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-xs active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
