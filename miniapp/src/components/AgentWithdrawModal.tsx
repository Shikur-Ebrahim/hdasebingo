/**
 * AgentWithdrawModal — Dedicated Withdrawal Flow for Official Agents
 * 1. Checks if bank is saved in Attack Bank
 * 2. Asks ONLY for Amount -> 6-Digit PIN
 * 3. Dedicated agent_withdrawals table + Telegram alert ONLY to Admins
 * 4. Includes history tab and live balance
 */
import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  X,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Lock,
  ShieldCheck,
  CheckCircle2,
  History,
  Wallet,
  Clock,
  XCircle,
  Building2,
  RefreshCw,
  Landmark,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { VERIFIED_BANKS, getBankDetails, BankItem } from './AgentAttackBank';

const API = import.meta.env.VITE_API_URL || '/api';

interface SavedBank {
  id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
}

interface AgentWithdrawalRecord {
  id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  created_at: string;
  processed_at?: string;
}

type Step = 'loading' | 'no_bank' | 'amount' | 'pin' | 'done' | 'history';

interface Props {
  onClose: () => void;
  onOpenAttackBank: () => void;
}

const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
    WebApp.HapticFeedback.impactOccurred(style);
  }
};

const formatAmt = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null || isNaN(Number(num))) return '0';
  const val = Number(num);
  return val.toLocaleString('en-US');
};

export default function AgentWithdrawModal({ onClose, onOpenAttackBank }: Props) {
  const { user, fetchUser } = useGameStore();
  const isPromoter = (user?.role || '').toLowerCase() === 'promoter';
  const roleTitle = isPromoter ? 'Promoter' : 'Agent';

  const [step, setStep] = useState<Step>('loading');
  const [savedBank, setSavedBank] = useState<SavedBank | null>(null);
  const [banks, setBanks] = useState<BankItem[]>(VERIFIED_BANKS);
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AgentWithdrawalRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [successRecord, setSuccessRecord] = useState<AgentWithdrawalRecord | null>(null);

  const mainBalance = Number(user?.main_balance || 0);

  // Load saved bank account & sync live logos on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const headers = { 'x-telegram-init-data': initData };

        const res = await fetch(`${API}/agent-bank/saved`, { headers });
        const data = await res.json();

        // Also fetch live method logos for perfect logo display
        try {
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

          if (isMounted) {
            setBanks(prev => prev.map(b => ({
              ...b,
              logo_url: logoMap[b.id.toLowerCase()] || b.logo_url,
            })));
          }
        } catch {}

        if (isMounted) {
          if (data && data.id) {
            setSavedBank(data);
            setStep('amount');
          } else {
            setStep('no_bank');
          }
        }
      } catch {
        if (isMounted) {
          setStep('no_bank');
        }
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // Fetch Agent Withdrawal History
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API}/agent-withdraw/history`, {
        headers: { 'x-telegram-init-data': initData },
      });
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Step 1: Validate Amount
  const handleAmountContinue = () => {
    setError('');
    const num = Number(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (num > mainBalance) {
      setError(`Insufficient balance. Available: ${formatAmt(mainBalance)} ETB`);
      return;
    }
    haptic('medium');
    setPin('');
    setStep('pin');
  };

  // Step 2: Submit with 6-Digit PIN
  const handlePinSubmit = async () => {
    setError('');
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }
    setLoading(true);
    haptic('heavy');

    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API}/agent-withdraw/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({
          amount: Number(amount),
          pin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit withdrawal request.');
        return;
      }

      setSuccessRecord(data.withdrawal);
      setStep('done');
      fetchUser(); // Refresh agent balance in store

      if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Keypad click handler
  const handleKeyPad = (val: string) => {
    haptic('light');
    if (val === '⌫') {
      setPin(p => p.slice(0, -1));
    } else if (pin.length < 6) {
      setPin(p => p + val);
    }
  };

  // Navigation back
  const goBack = () => {
    setError('');
    if (step === 'pin') {
      setStep('amount');
    } else if (step === 'history') {
      setStep(savedBank ? 'amount' : 'no_bank');
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-none" />

      {/* Slide-up sheet */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-[32px] overflow-hidden shadow-2xl flex flex-col z-10"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* ── Sheet Header ── */}
        <div className="px-5 pt-3 pb-3 flex items-center justify-between shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            {step !== 'loading' && step !== 'amount' && step !== 'no_bank' && step !== 'done' && (
              <button
                type="button"
                onClick={goBack}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:bg-slate-200 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                {step === 'loading' && 'Withdraw Funds'}
                {step === 'no_bank' && 'Link Bank Account'}
                {step === 'amount'  && `${roleTitle} Withdrawal`}
                {step === 'pin'     && 'Authorize with PIN'}
                {step === 'done'    && 'Request Submitted'}
                {step === 'history' && 'Withdrawal History'}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold">
                {step === 'amount'  && 'Fast commission payout to your saved bank'}
                {step === 'pin'     && 'Enter your 6-digit withdrawal PIN'}
                {step === 'done'    && 'Admin review in progress'}
                {step === 'history' && `Past ${roleTitle.toLowerCase()} withdrawal requests`}
                {step === 'no_bank' && 'Attack Bank required before withdrawal'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === 'amount' && (
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setStep('history');
                  loadHistory();
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2.5 py-1 rounded-xl transition-all active:scale-95"
              >
                <History size={12} />
                <span>History</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="mx-5 mt-3 mb-1 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 shrink-0">
            <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 font-bold">{error}</p>
          </div>
        )}

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ══ LOADING ══ */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 size={32} className="animate-spin text-amber-500" />
              <p className="text-xs font-bold text-slate-400">Loading payout settings...</p>
            </div>
          )}

          {/* ══ NO BANK LINKED ══ */}
          {step === 'no_bank' && (
            <div className="px-5 py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200/90 flex items-center justify-center mx-auto text-amber-600 shadow-sm">
                <Building2 size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900">No Bank Account Linked</h3>
                <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">
                  You haven't linked your withdrawal bank account yet. Please set up your bank details in Attack Bank to withdraw funds.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  haptic('medium');
                  onClose();
                  onOpenAttackBank();
                }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all"
              >
                Open Attack Bank & Link Account
              </button>
            </div>
          )}

          {/* ══ 1. ENTER AMOUNT ══ */}
          {step === 'amount' && savedBank && (
            <div className="px-5 py-5 space-y-4">
              {/* Destination Bank Card (Clean luxury light card) */}
              <div className="bg-gradient-to-br from-amber-50/70 via-white to-orange-50/50 border border-amber-200/90 rounded-2xl p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const bankItem = getBankDetails(savedBank.bank_name, banks);
                      return (
                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center p-1 shrink-0 overflow-hidden relative">
                          {bankItem?.logo_url ? (
                            <img
                              src={bankItem.logo_url}
                              alt={savedBank.bank_name}
                              className="w-full h-full object-contain rounded-xl"
                              onError={(e) => {
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
                            {savedBank.bank_name.slice(0, 4)}
                          </span>
                        </div>
                      );
                    })()}
                    <div>
                      <p className="text-sm font-black text-slate-900 leading-tight">
                        {savedBank.bank_name}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                        {savedBank.account_holder_name}
                      </p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <ShieldCheck size={10} className="text-emerald-600" /> Linked
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-amber-100/80 text-[11px]">
                  <span className="text-slate-400 font-semibold">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-slate-800 tracking-wide">
                      {showAccountNumber
                        ? savedBank.account_number
                        : (savedBank.account_number.length > 4
                            ? `•••• •••• ${savedBank.account_number.slice(-4)}`
                            : savedBank.account_number)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        setShowAccountNumber(!showAccountNumber);
                      }}
                      className="p-1 rounded-lg hover:bg-amber-100/70 text-slate-400 hover:text-slate-700 active:scale-95 transition-all"
                      title={showAccountNumber ? "Hide Account Number" : "Show Account Number"}
                    >
                      {showAccountNumber ? (
                        <EyeOff size={14} className="text-amber-700" />
                      ) : (
                        <Eye size={14} className="text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Balance & Amount Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Wallet size={12} /> Withdrawal Amount
                  </label>
                  <span className="text-[11px] font-bold text-slate-400">
                    Available: <strong className="text-emerald-600 font-black">{formatAmt(mainBalance)} ETB</strong>
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    min={1}
                    max={mainBalance}
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-2xl font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      setAmount(mainBalance.toString());
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1.5 rounded-xl active:scale-95 transition-all"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAmountContinue}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all flex items-center justify-center gap-2 mt-2"
              >
                <span>Withdraw</span>
                <Lock size={15} />
              </button>
            </div>
          )}

          {/* ══ 2. ENTER 6-DIGIT PIN ══ */}
          {step === 'pin' && savedBank && (
            <div className="px-5 py-4 pb-8 space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 mb-1">
                  <Lock size={22} />
                </div>
                <p className="text-sm font-black text-slate-900">Enter Withdrawal PIN</p>
                <p className="text-xs text-slate-500 font-semibold">
                  Confirm payout of <strong className="text-amber-600 font-black">{formatAmt(amount)} ETB</strong>
                </p>
              </div>

              {/* Dots indicator */}
              <div className="flex justify-center gap-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      i < pin.length
                        ? 'bg-amber-500 border-amber-500 scale-110'
                        : 'bg-white border-slate-300'
                    }`}
                  />
                ))}
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto w-full pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (k !== '') handleKeyPad(k);
                    }}
                    disabled={k === ''}
                    className={`h-13 rounded-2xl font-black text-lg transition-all active:scale-90 ${
                      k === '⌫'
                        ? 'bg-rose-50 border border-rose-100 text-rose-500'
                        : k === ''
                        ? 'invisible'
                        : 'bg-slate-50 border border-slate-200/70 text-slate-800 active:bg-amber-50 active:border-amber-300'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handlePinSubmit}
                disabled={loading || pin.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  pin.length === 6
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_4px_16px_rgba(249,115,22,0.35)]'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Submitting Request...</>
                ) : (
                  <>Submit Withdrawal ({formatAmt(amount)} ETB)</>
                )}
              </button>
            </div>
          )}

          {/* ══ 3. DONE SCREEN ══ */}
          {step === 'done' && successRecord && (
            <div className="px-5 py-8 flex flex-col items-center text-center space-y-5">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-40" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-[0_8px_32px_rgba(16,185,129,0.35)]">
                  <CheckCircle2 size={44} className="text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900">Request Submitted! 🚀</h3>
                <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto">
                  Your {roleTitle.toLowerCase()} withdrawal has been sent directly to the Admin for approval.
                </p>
              </div>

              {/* Summary Card */}
              <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">Amount</span>
                  <span className="text-emerald-600 font-black text-lg">
                    {formatAmt(successRecord.amount)} ETB
                  </span>
                </div>
                <div className="h-px bg-slate-200/60" />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">Destination Bank</span>
                  <span className="text-slate-900 font-black">{successRecord.bank_name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">Account Number</span>
                  <span className="font-mono font-black text-slate-800">
                    {successRecord.account_number}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">Status</span>
                  <span className="flex items-center gap-1 text-amber-700 font-black bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-full text-[10px]">
                    <Clock size={11} /> Pending Admin Review
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">Reference</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {successRecord.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="w-full space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('history');
                    loadHistory();
                  }}
                  className="w-full py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <History size={15} />
                  <span>View All Withdrawal History</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ══ 4. HISTORY VIEW ══ */}
          {step === 'history' && (
            <div className="px-5 py-4 pb-8 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  {roleTitle} Payouts ({history.length})
                </p>
                <button
                  type="button"
                  onClick={loadHistory}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <RefreshCw size={13} className={historyLoading ? 'animate-spin text-amber-500' : ''} />
                </button>
              </div>

              {historyLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-amber-500" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Wallet size={36} className="mx-auto text-slate-200" />
                  <p className="text-slate-400 text-sm font-bold">No withdrawal requests yet</p>
                </div>
              ) : (
                history.map((rec) => {
                  const isApproved = rec.status === 'approved';
                  const isRejected = rec.status === 'rejected';
                  return (
                    <div
                      key={rec.id}
                      className={`border rounded-2xl p-4 space-y-2 transition-all ${
                        isApproved
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : isRejected
                          ? 'bg-rose-50/60 border-rose-200'
                          : 'bg-amber-50/60 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-900 leading-snug">
                            {rec.bank_name}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {rec.account_number}
                          </p>
                        </div>
                        <span
                          className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                            isApproved
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isRejected
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {isApproved && <CheckCircle2 size={11} />}
                          {isRejected && <XCircle size={11} />}
                          {!isApproved && !isRejected && <Clock size={11} />}
                          <span className="capitalize">{rec.status}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {new Date(rec.created_at).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span
                          className={`text-base font-black ${
                            isRejected ? 'text-rose-600 line-through' : 'text-slate-900'
                          }`}
                        >
                          {formatAmt(rec.amount)} ETB
                        </span>
                      </div>

                      {rec.admin_note && (
                        <p className="text-[10px] font-semibold text-slate-600 bg-white/80 rounded-xl px-2.5 py-1 border border-slate-200/60">
                          📝 {rec.admin_note}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
