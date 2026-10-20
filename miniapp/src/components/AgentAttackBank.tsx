import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  X,
  Landmark,
  User,
  Hash,
  Lock,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowLeft,
  History,
  Wallet,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  BadgeDollarSign,
  RefreshCw,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const API = import.meta.env.VITE_API_URL || '/api';

const ETHIOPIAN_BANKS = [
  { id: 'cbe',        name: 'Commercial Bank of Ethiopia',    emoji: '🏦', color: 'from-yellow-400 to-yellow-600' },
  { id: 'boa',        name: 'Bank of Abyssinia',              emoji: '🏛️', color: 'from-blue-500 to-blue-700' },
  { id: 'awash',      name: 'Awash Bank',                    emoji: '🏦', color: 'from-slate-500 to-slate-700' },
  { id: 'dashen',     name: 'Dashen Bank',                   emoji: '🏦', color: 'from-blue-600 to-blue-800' },
  { id: 'amhara',     name: 'Amhara Bank',                   emoji: '🏦', color: 'from-teal-500 to-teal-700' },
  { id: 'telebirr',   name: 'Telebirr',                      emoji: '📱', color: 'from-purple-500 to-purple-700' },
  { id: 'cbebirr',    name: 'CBE Birr',                      emoji: '📱', color: 'from-yellow-500 to-yellow-700' },
  { id: 'mpesa',      name: 'M-Pesa',                        emoji: '💚', color: 'from-green-500 to-green-700' },
  { id: 'ebirr',      name: 'E-Birr',                        emoji: '📱', color: 'from-orange-500 to-orange-700' },
  { id: 'coop',       name: 'Cooperative Bank of Oromia',    emoji: '🏦', color: 'from-indigo-500 to-indigo-700' },
  { id: 'amole',      name: 'Amole',                         emoji: '📱', color: 'from-red-500 to-red-700' },
  { id: 'hello_cash', name: 'HelloCash',                     emoji: '📱', color: 'from-green-400 to-green-600' },
  { id: 'nib',        name: 'Nib International Bank',        emoji: '🏦', color: 'from-purple-400 to-purple-600' },
  { id: 'wegagen',    name: 'Wegagen Bank',                  emoji: '🏦', color: 'from-slate-600 to-slate-800' },
  { id: 'zemen',      name: 'Zemen Bank',                    emoji: '🏦', color: 'from-orange-400 to-orange-600' },
  { id: 'oromia',     name: 'Oromia Bank',                   emoji: '🏦', color: 'from-teal-400 to-teal-600' },
  { id: 'hibret',     name: 'Hibret Bank',                   emoji: '🏦', color: 'from-yellow-500 to-yellow-600' },
];

interface WithdrawalRecord {
  id: string;
  bank_name: string;
  full_name: string;
  account_number: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  created_at: string;
  processed_at?: string;
}

type Step = 'bank' | 'details' | 'pin' | 'success' | 'history';

interface Props {
  onClose: () => void;
  agentBalance: number;
}

const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback)
    WebApp.HapticFeedback.impactOccurred(style);
};

const formatAmt = (v: number) => v.toLocaleString('en-US');

const statusConfig = {
  pending:  { icon: Clock,        color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200',  label: 'Pending'  },
  approved: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Approved' },
  rejected: { icon: XCircle,      color: 'text-rose-600',   bg: 'bg-rose-50   border-rose-200',   label: 'Rejected' },
};

export default function AgentAttackBank({ onClose, agentBalance }: Props) {
  const { user } = useGameStore();

  const [step, setStep] = useState<Step>('bank');
  const [selectedBank, setSelectedBank] = useState<(typeof ETHIOPIAN_BANKS)[0] | null>(null);
  const [fullName, setFullName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successId, setSuccessId] = useState('');
  const [history, setHistory] = useState<WithdrawalRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Pre-fill name from user
  useEffect(() => {
    if (user?.first_name && !fullName) {
      setFullName(user.first_name);
    }
  }, [user]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/agent-bank/history`, {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const handleSelectBank = (bank: typeof ETHIOPIAN_BANKS[0]) => {
    haptic('medium');
    setSelectedBank(bank);
    setStep('details');
    setError('');
  };

  const handleDetailsNext = () => {
    setError('');
    if (!fullName.trim()) { setError('Please enter your full name.'); return; }
    if (!accountNumber.trim()) { setError('Please enter your account number.'); return; }
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt < 1) { setError('Please enter a valid amount.'); return; }
    if (amt > agentBalance) { setError(`Insufficient balance. Available: ${formatAmt(agentBalance)} ETB`); return; }
    haptic('medium');
    setStep('pin');
  };

  const handleSubmit = async () => {
    setError('');
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }
    setLoading(true);
    haptic('heavy');
    try {
      const res = await fetch(`${API}/agent-bank/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({
          bank_name: selectedBank!.name,
          full_name: fullName.trim(),
          account_number: accountNumber.trim(),
          amount: Number(amount),
          pin,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Request failed. Please try again.'); return; }
      setSuccessId(data.id || '');
      setStep('success');
      if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback)
        WebApp.HapticFeedback.notificationOccurred('success');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── PIN digit input handler ──
  const handlePinInput = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setPin(clean);
  };

  const goBack = () => {
    setError('');
    if (step === 'details') { setStep('bank'); }
    else if (step === 'pin')    { setStep('details'); }
    else if (step === 'history') { setStep('bank'); }
    else { onClose(); }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-[28px] overflow-hidden shadow-2xl"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white z-10">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* ── HEADER ── */}
        <div className="px-5 pb-4 sticky top-4 bg-white z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {step !== 'bank' && step !== 'success' && (
                <button
                  onClick={goBack}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:bg-slate-200 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <div>
                <h2 className="text-base font-black text-slate-900 leading-tight">
                  {step === 'bank'    ? '🏦 Attack Bank'       : ''}
                  {step === 'details' ? `${selectedBank?.emoji} ${selectedBank?.name}` : ''}
                  {step === 'pin'     ? '🔐 Confirm with PIN'  : ''}
                  {step === 'success' ? '✅ Request Submitted' : ''}
                  {step === 'history' ? '📋 Withdrawal History': ''}
                </h2>
                {step === 'bank' && (
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Commission withdrawal • Balance:{' '}
                    <span className="text-emerald-600 font-black">{formatAmt(agentBalance)} ETB</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {step === 'bank' && (
                <button
                  onClick={() => { setStep('history'); loadHistory(); }}
                  className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full"
                >
                  <History size={11} />
                  History
                </button>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 font-bold">{error}</p>
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 1: BANK SELECTION
        ══════════════════════════════════════ */}
        {step === 'bank' && (
          <div className="px-5 pb-8">
            {/* Balance hero card */}
            <div className="relative mb-5 rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-400 to-red-400" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25)_0%,transparent_60%)]" />
              <div className="relative px-5 py-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
                  <BadgeDollarSign size={28} className="text-white" />
                </div>
                <div>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    Available Commission
                  </p>
                  <p className="text-white font-black text-3xl leading-none">
                    {formatAmt(agentBalance)}
                    <span className="text-white/70 text-sm font-bold ml-1">ETB</span>
                  </p>
                  <p className="text-white/60 text-[10px] font-semibold mt-1">
                    Select a bank to withdraw
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">
              Choose Your Bank / Wallet
            </p>

            <div className="space-y-2">
              {ETHIOPIAN_BANKS.map(bank => (
                <button
                  key={bank.id}
                  onClick={() => handleSelectBank(bank)}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl active:bg-slate-100 active:scale-[0.98] transition-all group"
                >
                  {/* Bank color strip */}
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${bank.color} flex items-center justify-center shrink-0 shadow-sm`}>
                    <span className="text-lg">{bank.emoji}</span>
                  </div>
                  <span className="flex-1 text-left text-sm font-bold text-slate-800">
                    {bank.name}
                  </span>
                  <ChevronRight size={16} className="text-slate-300 group-active:text-slate-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 2: ACCOUNT DETAILS
        ══════════════════════════════════════ */}
        {step === 'details' && selectedBank && (
          <div className="px-5 pb-8 space-y-4">
            {/* Selected bank pill */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${selectedBank.color} shadow-sm`}>
              <span className="text-base">{selectedBank.emoji}</span>
              <span className="text-white font-black text-xs">{selectedBank.name}</span>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <User size={12} />
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
              />
            </div>

            {/* Account Number */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <Hash size={12} />
                Account Number
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter account / phone number"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <Wallet size={12} />
                Amount (ETB)
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  min={1}
                  max={agentBalance}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all pr-24"
                />
                <button
                  onClick={() => setAmount(agentBalance.toString())}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full"
                >
                  MAX
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold pl-1">
                Available: <span className="text-emerald-600 font-black">{formatAmt(agentBalance)} ETB</span>
              </p>
            </div>

            {/* Quick amount chips */}
            <div className="flex gap-2 flex-wrap">
              {[100, 500, 1000, 2000].map(v => (
                <button
                  key={v}
                  onClick={() => { haptic('light'); setAmount(Math.min(v, agentBalance).toString()); }}
                  className="px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-black text-slate-700 active:bg-amber-50 active:border-amber-300 active:text-amber-700 transition-all"
                >
                  {v.toLocaleString()}
                </button>
              ))}
            </div>

            <button
              onClick={handleDetailsNext}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_20px_rgba(249,115,22,0.35)] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              Continue to PIN
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 3: PIN
        ══════════════════════════════════════ */}
        {step === 'pin' && (
          <div className="px-5 pb-8 space-y-5">
            {/* Summary card */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Withdrawal Summary
              </p>
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <span className="text-slate-400 font-semibold">Bank</span>
                <span className="text-slate-900 font-black text-right">{selectedBank?.name}</span>
                <span className="text-slate-400 font-semibold">Name</span>
                <span className="text-slate-900 font-black text-right truncate">{fullName}</span>
                <span className="text-slate-400 font-semibold">Account</span>
                <span className="text-slate-900 font-black text-right">{accountNumber}</span>
                <span className="text-slate-400 font-semibold">Amount</span>
                <span className="text-emerald-600 font-black text-right text-base">{formatAmt(Number(amount))} ETB</span>
              </div>
            </div>

            {/* PIN field */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <Lock size={12} />
                6-Digit Withdrawal PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={e => handlePinInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-2xl font-black text-slate-900 tracking-[0.5em] text-center placeholder:text-slate-200 placeholder:tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all pr-12"
                />
                <button
                  onClick={() => setShowPin(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {/* PIN dots indicator */}
              <div className="flex justify-center gap-3 pt-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full border-2 transition-all duration-150 ${
                      i < pin.length
                        ? 'bg-amber-500 border-amber-500 scale-110'
                        : 'bg-white border-slate-300'
                    }`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-center text-slate-400 font-semibold">
                Enter your secret 6-digit PIN to authorize this withdrawal
              </p>
            </div>

            {/* Numeric keyboard */}
            <div className="grid grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    haptic('light');
                    if (key === '⌫') setPin(p => p.slice(0, -1));
                    else if (key !== '') handlePinInput(pin + key);
                  }}
                  disabled={key === ''}
                  className={`h-14 rounded-2xl text-lg font-black transition-all active:scale-90 ${
                    key === '⌫'
                      ? 'bg-rose-50 border border-rose-100 text-rose-500'
                      : key === ''
                        ? 'invisible'
                        : 'bg-slate-50 border border-slate-100 text-slate-900 active:bg-amber-50 active:border-amber-200'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || pin.length !== 6}
              className={`w-full py-4 rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${
                pin.length === 6
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.4)]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Processing...</>
              ) : (
                <>💥 Attack Bank — {formatAmt(Number(amount))} ETB</>
              )}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 4: SUCCESS
        ══════════════════════════════════════ */}
        {step === 'success' && (
          <div className="px-5 pb-10 flex flex-col items-center text-center space-y-5">
            {/* Animated success circle */}
            <div className="relative w-24 h-24 mt-4">
              <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-40" />
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-[0_8px_32px_rgba(16,185,129,0.35)]">
                <CheckCircle2 size={44} className="text-white" />
              </div>
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900">Request Sent! 💥</h3>
              <p className="text-slate-400 text-sm mt-1">
                Your commission withdrawal is being processed
              </p>
            </div>

            {/* Details summary */}
            <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5 text-left">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-semibold">Bank</span>
                <span className="text-slate-900 font-black">{selectedBank?.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-semibold">Account</span>
                <span className="text-slate-900 font-black">{accountNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs font-semibold">Amount</span>
                <span className="text-emerald-600 font-black text-lg">{formatAmt(Number(amount))} ETB</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400 font-semibold">Status</span>
                <span className="text-amber-600 font-black bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  ⏳ Pending Review
                </span>
              </div>
              {successId && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400 font-semibold">Ref ID</span>
                  <span className="text-slate-500 font-mono">{successId.slice(0, 8).toUpperCase()}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 font-semibold max-w-xs">
              The admin will review and approve your request. You'll receive a Telegram notification when it's processed.
            </p>

            <div className="w-full flex gap-3">
              <button
                onClick={() => { setStep('history'); loadHistory(); }}
                className="flex-1 py-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 font-black text-sm active:bg-slate-200 transition-all flex items-center justify-center gap-2"
              >
                <History size={15} />
                History
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all"
              >
                Done ✓
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            HISTORY
        ══════════════════════════════════════ */}
        {step === 'history' && (
          <div className="px-5 pb-8 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                Recent Requests
              </p>
              <button
                onClick={loadHistory}
                className="text-slate-400 active:text-amber-500"
              >
                <RefreshCw size={13} className={historyLoading ? 'animate-spin text-amber-500' : ''} />
              </button>
            </div>

            {historyLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={24} className="animate-spin text-amber-400" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Landmark size={36} className="mx-auto text-slate-200" />
                <p className="text-slate-400 text-sm font-bold">No withdrawal history yet</p>
              </div>
            ) : (
              history.map(rec => {
                const cfg = statusConfig[rec.status] || statusConfig.pending;
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={rec.id}
                    className={`border rounded-2xl px-4 py-3.5 space-y-2 ${cfg.bg}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{rec.bank_name}</p>
                        <p className="text-[10px] text-slate-500 font-semibold">{rec.account_number}</p>
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] font-black ${cfg.color} shrink-0 ml-2`}>
                        <StatusIcon size={12} />
                        {cfg.label}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {new Date(rec.created_at).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' })}
                      </span>
                      <span className={`text-base font-black ${rec.status === 'rejected' ? 'text-rose-600 line-through' : 'text-slate-900'}`}>
                        {formatAmt(rec.amount)} ETB
                      </span>
                    </div>
                    {rec.admin_note && (
                      <p className={`text-[10px] font-semibold ${cfg.color} bg-white/60 rounded-xl px-2 py-1`}>
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
  );
}
