/**
 * AgentAttackBank — Save bank details only
 * No withdrawal, no balance deduction.
 * Steps: bank select → details + PIN → saved
 */
import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  X,
  ChevronRight,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Landmark,
  User,
  Hash,
  Lock,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const API = import.meta.env.VITE_API_URL || '/api';

const ETHIOPIAN_BANKS = [
  { id: 'cbe',        name: 'Commercial Bank of Ethiopia',  emoji: '🏦', color: 'from-yellow-400 to-yellow-600' },
  { id: 'boa',        name: 'Bank of Abyssinia',            emoji: '🏛️', color: 'from-blue-500 to-blue-700'   },
  { id: 'awash',      name: 'Awash Bank',                   emoji: '🏦', color: 'from-slate-500 to-slate-700' },
  { id: 'dashen',     name: 'Dashen Bank',                  emoji: '🏦', color: 'from-blue-600 to-blue-800'   },
  { id: 'amhara',     name: 'Amhara Bank',                  emoji: '🏦', color: 'from-teal-500 to-teal-700'   },
  { id: 'telebirr',   name: 'Telebirr',                     emoji: '📱', color: 'from-purple-500 to-purple-700'},
  { id: 'cbebirr',    name: 'CBE Birr',                     emoji: '📱', color: 'from-yellow-500 to-yellow-700'},
  { id: 'mpesa',      name: 'M-Pesa',                       emoji: '💚', color: 'from-green-500 to-green-700'  },
  { id: 'ebirr',      name: 'E-Birr',                       emoji: '📱', color: 'from-orange-500 to-orange-700'},
  { id: 'coop',       name: 'Cooperative Bank of Oromia',   emoji: '🏦', color: 'from-indigo-500 to-indigo-700'},
  { id: 'amole',      name: 'Amole',                        emoji: '📱', color: 'from-red-500 to-red-700'      },
  { id: 'hello_cash', name: 'HelloCash',                    emoji: '📱', color: 'from-green-400 to-green-600'  },
  { id: 'nib',        name: 'Nib International Bank',       emoji: '🏦', color: 'from-purple-400 to-purple-600'},
  { id: 'wegagen',    name: 'Wegagen Bank',                  emoji: '🏦', color: 'from-slate-600 to-slate-800' },
  { id: 'zemen',      name: 'Zemen Bank',                   emoji: '🏦', color: 'from-orange-400 to-orange-600'},
  { id: 'oromia',     name: 'Oromia Bank',                  emoji: '🏦', color: 'from-teal-400 to-teal-600'   },
  { id: 'hibret',     name: 'Hibret Bank',                  emoji: '🏦', color: 'from-yellow-500 to-yellow-600'},
];

interface SavedAccount {
  id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  updated_at: string;
}

type Step = 'loading' | 'saved_view' | 'bank' | 'details' | 'pin' | 'done';

interface Props { onClose: () => void; }

const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback)
    WebApp.HapticFeedback.impactOccurred(style);
};

export default function AgentAttackBank({ onClose }: Props) {
  const { user } = useGameStore();

  const [step, setStep]                     = useState<Step>('loading');
  const [savedAccount, setSavedAccount]     = useState<SavedAccount | null>(null);
  const [selectedBank, setSelectedBank]     = useState<typeof ETHIOPIAN_BANKS[0] | null>(null);
  const [holderName, setHolderName]         = useState('');
  const [accountNumber, setAccountNumber]   = useState('');
  const [pin, setPin]                       = useState('');
  const [showPin, setShowPin]               = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');

  // Load saved account on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/agent-bank/saved`, {
          headers: { 'x-telegram-init-data': WebApp.initData },
        });
        const data = await res.json();
        if (data && data.id) {
          setSavedAccount(data);
          setStep('saved_view');
        } else {
          // Pre-fill name from user profile
          if (user?.first_name) setHolderName(user.first_name);
          setStep('bank');
        }
      } catch {
        if (user?.first_name) setHolderName(user.first_name);
        setStep('bank');
      }
    })();
  }, []);

  const startEdit = () => {
    haptic('medium');
    // Pre-fill from saved
    if (savedAccount) {
      const bank = ETHIOPIAN_BANKS.find(b => b.name === savedAccount.bank_name) || null;
      setSelectedBank(bank);
      setHolderName(savedAccount.account_holder_name);
      setAccountNumber(savedAccount.account_number);
    }
    setPin('');
    setError('');
    setStep('bank');
  };

  const handleSelectBank = (bank: typeof ETHIOPIAN_BANKS[0]) => {
    haptic('medium');
    setSelectedBank(bank);
    setError('');
    setStep('details');
  };

  const handleDetailsNext = () => {
    setError('');
    if (!holderName.trim())     { setError('Please enter account holder name.'); return; }
    if (!accountNumber.trim())  { setError('Please enter account number.'); return; }
    haptic('medium');
    setStep('pin');
  };

  const handleSave = async () => {
    setError('');
    if (!/^\d{6}$/.test(pin)) { setError('PIN must be exactly 6 digits.'); return; }
    setLoading(true);
    haptic('heavy');
    try {
      const res = await fetch(`${API}/agent-bank/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({
          bank_name: selectedBank!.name,
          account_holder_name: holderName.trim(),
          account_number: accountNumber.trim(),
          pin,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save. Try again.'); return; }
      if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback)
        WebApp.HapticFeedback.notificationOccurred('success');
      setStep('done');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePinKey = (key: string) => {
    haptic('light');
    if (key === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length < 6) setPin(p => p + key);
  };

  const goBack = () => {
    setError('');
    if (step === 'details') setStep('bank');
    else if (step === 'pin') setStep('details');
    else if (step === 'bank' && savedAccount) setStep('saved_view');
    else onClose();
  };

  const bankColor = selectedBank?.color ?? 'from-amber-400 to-orange-400';
  const bankEmoji = selectedBank?.emoji ?? '🏦';

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md bg-white rounded-t-[28px] overflow-hidden shadow-2xl"
        style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Drag handle ── */}
        <div className="flex justify-center pt-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* ── Header ── */}
        <div className="px-5 pt-3 pb-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {(step === 'details' || step === 'pin' || (step === 'bank' && savedAccount)) && (
              <button
                onClick={goBack}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:bg-slate-200"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                {step === 'loading'     && '🏦 Bank Account'}
                {step === 'saved_view' && '🏦 Saved Bank Account'}
                {step === 'bank'        && '🏦 Select Bank'}
                {step === 'details'     && `${bankEmoji} Account Details`}
                {step === 'pin'         && '🔐 Set PIN'}
                {step === 'done'        && '✅ Saved!'}
              </h2>
              <p className="text-[10px] text-slate-400 font-semibold">
                {step === 'pin' ? 'Set a 6-digit PIN to secure your bank info' : 'Agent bank account info'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={14} />
          </button>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mx-5 mb-2 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 shrink-0">
            <AlertCircle size={13} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 font-bold">{error}</p>
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ══ LOADING ══ */}
          {step === 'loading' && (
            <div className="flex justify-center items-center py-20">
              <Loader2 size={28} className="animate-spin text-amber-400" />
            </div>
          )}

          {/* ══ SAVED VIEW ══ */}
          {step === 'saved_view' && savedAccount && (
            <div className="px-5 pb-8 space-y-4">
              {/* Saved card */}
              <div className="relative rounded-3xl overflow-hidden">
                {/* Card background */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.15)_0%,transparent_60%)]" />
                {/* Decorative circles */}
                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border border-white/5" />
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full border border-white/5" />

                <div className="relative px-6 py-6 space-y-5">
                  {/* Bank name */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${ETHIOPIAN_BANKS.find(b=>b.name===savedAccount.bank_name)?.color ?? 'from-amber-400 to-orange-500'} flex items-center justify-center text-base shadow`}>
                        {ETHIOPIAN_BANKS.find(b=>b.name===savedAccount.bank_name)?.emoji ?? '🏦'}
                      </div>
                      <span className="text-white font-black text-sm">{savedAccount.bank_name}</span>
                    </div>
                    <span className="text-[9px] font-black text-amber-400 bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Saved
                    </span>
                  </div>

                  {/* Account number */}
                  <div>
                    <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mb-1">Account Number</p>
                    <p className="text-white font-black text-xl tracking-widest">
                      {'•••• ' + (savedAccount.account_number.slice(-6) || '••••••')}
                    </p>
                  </div>

                  {/* Holder + PIN secured */}
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mb-1">Account Holder</p>
                      <p className="text-white font-black text-sm">{savedAccount.account_holder_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <ShieldCheck size={14} />
                      <span className="text-[10px] font-black">PIN Secured</span>
                    </div>
                  </div>

                  {/* Last updated */}
                  <p className="text-white/25 text-[9px] font-semibold">
                    Last updated: {new Date(savedAccount.updated_at).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' })}
                  </p>
                </div>
              </div>

              {/* Edit button */}
              <button
                onClick={startEdit}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_20px_rgba(249,115,22,0.35)] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Pencil size={16} />
                Update Bank Details
              </button>

              <button onClick={onClose} className="w-full py-3 rounded-2xl text-slate-400 font-bold text-sm">
                Close
              </button>
            </div>
          )}

          {/* ══ BANK SELECT ══ */}
          {step === 'bank' && (
            <div className="px-5 pb-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                Choose Your Bank / Wallet
              </p>
              <div className="space-y-2">
                {ETHIOPIAN_BANKS.map(bank => (
                  <button
                    key={bank.id}
                    onClick={() => handleSelectBank(bank)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border active:scale-[0.98] transition-all group ${
                      selectedBank?.id === bank.id
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-slate-50 border-slate-100 active:bg-slate-100'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${bank.color} flex items-center justify-center shrink-0 shadow-sm text-lg`}>
                      {bank.emoji}
                    </div>
                    <span className="flex-1 text-left text-sm font-bold text-slate-800">{bank.name}</span>
                    <ChevronRight size={15} className="text-slate-300" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ══ DETAILS ══ */}
          {step === 'details' && selectedBank && (
            <div className="px-5 pb-8 space-y-4">
              {/* Selected bank pill */}
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${selectedBank.color} shadow-sm`}>
                <span className="text-base">{selectedBank.emoji}</span>
                <span className="text-white font-black text-xs">{selectedBank.name}</span>
              </div>

              {/* Account Holder Name */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <User size={11} /> Account Holder Name
                </label>
                <input
                  type="text"
                  value={holderName}
                  onChange={e => setHolderName(e.target.value)}
                  placeholder="Full name on account"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                />
              </div>

              {/* Account Number */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <Hash size={11} /> Account Number
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  placeholder="Enter account / phone number"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                />
              </div>

              <button
                onClick={handleDetailsNext}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_20px_rgba(249,115,22,0.35)] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                Continue <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ══ PIN ══ */}
          {step === 'pin' && (
            <div className="px-5 pb-8 space-y-5">
              {/* Summary */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saving to</p>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${selectedBank?.color} flex items-center justify-center text-base shadow-sm`}>
                    {selectedBank?.emoji}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{selectedBank?.name}</p>
                    <p className="text-[10px] text-slate-500 font-semibold">{holderName} · {accountNumber}</p>
                  </div>
                </div>
              </div>

              {/* PIN label */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <Lock size={11} /> Set Your 6-Digit PIN
                </label>
                {/* Display input */}
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    readOnly
                    placeholder="••••••"
                    className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-2xl font-black text-slate-900 tracking-[0.5em] text-center placeholder:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all pr-12"
                  />
                  <button
                    onClick={() => setShowPin(p => !p)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Dots */}
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
                  This PIN secures your saved bank info
                </p>
              </div>

              {/* Custom numpad */}
              <div className="grid grid-cols-3 gap-3">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
                  <button
                    key={i}
                    onClick={() => key !== '' && handlePinKey(key)}
                    disabled={key === ''}
                    className={`h-14 rounded-2xl text-lg font-black transition-all active:scale-90 ${
                      key === '⌫' ? 'bg-rose-50 border border-rose-100 text-rose-500'
                      : key === ''  ? 'invisible'
                      : 'bg-slate-50 border border-slate-100 text-slate-900 active:bg-amber-50 active:border-amber-200'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>

              <button
                onClick={handleSave}
                disabled={loading || pin.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  pin.length === 6
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.4)]'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {loading
                  ? <><Loader2 size={17} className="animate-spin" /> Saving...</>
                  : <><ShieldCheck size={17} /> Save Bank Account</>
                }
              </button>
            </div>
          )}

          {/* ══ DONE ══ */}
          {step === 'done' && (
            <div className="px-5 pb-10 flex flex-col items-center text-center space-y-5">
              {/* Success animation */}
              <div className="relative w-24 h-24 mt-4">
                <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-40" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-[0_8px_32px_rgba(16,185,129,0.35)]">
                  <CheckCircle2 size={44} className="text-white" />
                </div>
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-900">Bank Saved! 🎉</h3>
                <p className="text-slate-400 text-sm mt-1">Your bank details are secured with PIN</p>
              </div>

              {/* Saved card summary */}
              <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${selectedBank?.color} flex items-center justify-center text-base shadow-sm`}>
                    {selectedBank?.emoji}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{selectedBank?.name}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">{holderName}</p>
                  </div>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Account</span>
                  <span className="text-slate-900 font-black">{accountNumber}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">PIN</span>
                  <span className="flex items-center gap-1 text-emerald-600 font-black">
                    <ShieldCheck size={12} /> Secured
                  </span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all"
              >
                Done ✓
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
