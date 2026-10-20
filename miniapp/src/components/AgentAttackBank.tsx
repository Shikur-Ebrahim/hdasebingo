/**
 * AgentAttackBank — Save bank details only (Attack Bank)
 * Features:
 *  1. Authentic bank logos displayed properly
 *  2. Update bank details requires the previous/current saved PIN
 *  3. Dedicated "Change PIN" button (current PIN -> new PIN -> confirm new PIN)
 *  4. 100% mobile-first, clean UI
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
  User,
  Hash,
  Lock,
  Pencil,
  ShieldCheck,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const API = import.meta.env.VITE_API_URL || '/api';

export interface BankItem {
  id: string;
  name: string;
  code: string;
  logo_url: string;
  color: string;
}

// Initial verified Ethiopian Banks and Wallets with real official R2 logos
const INITIAL_BANKS: BankItem[] = [
  {
    id: 'cbe',
    name: 'Commercial Bank of Ethiopia',
    code: 'CBE',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/d84a084377dd4210.jpg',
    color: 'from-amber-500 to-amber-700',
  },
  {
    id: 'boa',
    name: 'Bank of Abyssinia',
    code: 'BOA',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/53d40ff3082972b2.png',
    color: 'from-yellow-400 to-amber-600',
  },
  {
    id: 'telebirr',
    name: 'Telebirr',
    code: 'TELEBIRR',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/2ae75521b199a445.jpg',
    color: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'cbebirr',
    name: 'CBE Birr',
    code: 'CBE BIRR',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/fae6ba7f0beec0da.jpg',
    color: 'from-amber-600 to-yellow-600',
  },
  {
    id: 'awash',
    name: 'Awash Bank',
    code: 'AWASH',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/14fa19265610bdd9.png',
    color: 'from-blue-600 to-slate-700',
  },
  {
    id: 'dashen',
    name: 'Dashen Bank',
    code: 'DASHEN',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/f5f9f4c95f5678dd.png',
    color: 'from-blue-700 to-indigo-800',
  },
  {
    id: 'mpesa',
    name: 'M-Pesa',
    code: 'M-PESA',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/e6fa6af999c6620c.png',
    color: 'from-emerald-500 to-green-600',
  },
  {
    id: 'ebirr',
    name: 'E-Birr',
    code: 'E-BIRR',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/ce229708eafee664.jpg',
    color: 'from-orange-500 to-amber-600',
  },
  {
    id: 'amhara',
    name: 'Amhara Bank',
    code: 'AMHARA',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/06256b33b9594cb4.png',
    color: 'from-teal-500 to-emerald-700',
  },
  {
    id: 'wegagen',
    name: 'Wegagen Bank',
    code: 'WEGAGEN',
    logo_url: 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev/users/8437261432/57ea63c35b17ccd6.jpg',
    color: 'from-amber-600 to-orange-700',
  },
  {
    id: 'coop',
    name: 'Cooperative Bank of Oromia',
    code: 'COOP',
    logo_url: '',
    color: 'from-indigo-600 to-blue-700',
  },
  {
    id: 'hibret',
    name: 'Hibret Bank',
    code: 'HIBRET',
    logo_url: '',
    color: 'from-yellow-500 to-amber-600',
  },
  {
    id: 'nib',
    name: 'Nib International Bank',
    code: 'NIB',
    logo_url: '',
    color: 'from-purple-600 to-indigo-700',
  },
  {
    id: 'zemen',
    name: 'Zemen Bank',
    code: 'ZEMEN',
    logo_url: '',
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'oromia',
    name: 'Oromia Bank',
    code: 'OROMIA',
    logo_url: '',
    color: 'from-emerald-600 to-teal-700',
  },
  {
    id: 'amole',
    name: 'Amole',
    code: 'AMOLE',
    logo_url: '',
    color: 'from-rose-600 to-red-700',
  },
  {
    id: 'hello_cash',
    name: 'HelloCash',
    code: 'HELLOCASH',
    logo_url: '',
    color: 'from-green-500 to-emerald-600',
  },
];

interface SavedAccount {
  id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  updated_at: string;
}

type Step =
  | 'loading'
  | 'saved_view'
  | 'bank'
  | 'details'
  | 'pin_create'        // First time PIN creation
  | 'pin_verify_update' // Previous PIN verification for updating bank details
  | 'change_pin_current'// Change PIN - step 1: enter current PIN
  | 'change_pin_new'    // Change PIN - step 2: enter new PIN
  | 'change_pin_confirm'// Change PIN - step 3: confirm new PIN
  | 'done';

interface Props {
  onClose: () => void;
}

const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
    WebApp.HapticFeedback.impactOccurred(style);
  }
};

export default function AgentAttackBank({ onClose }: Props) {
  const { user } = useGameStore();

  const [step, setStep] = useState<Step>('loading');
  const [banks, setBanks] = useState<BankItem[]>(INITIAL_BANKS);
  const [savedAccount, setSavedAccount] = useState<SavedAccount | null>(null);
  const [selectedBank, setSelectedBank] = useState<BankItem | null>(null);
  const [holderName, setHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  // PIN states
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [doneTitle, setDoneTitle] = useState('Bank Saved!');
  const [doneDesc, setDoneDesc] = useState('Your bank details are secured with PIN');

  // Load saved account & live bank method logos from server
  useEffect(() => {
    (async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const headers = { 'x-telegram-init-data': initData };

        // 1. Fetch saved agent bank account
        const savedRes = await fetch(`${API}/agent-bank/saved`, { headers });
        const savedData = await savedRes.json();

        // 2. Fetch live deposit & withdraw method logos to merge dynamically
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

          setBanks(prev => prev.map(b => ({
            ...b,
            logo_url: logoMap[b.id.toLowerCase()] || b.logo_url,
          })));
        } catch {}

        if (savedData && savedData.id) {
          setSavedAccount(savedData);
          setStep('saved_view');
        } else {
          if (user?.first_name) setHolderName(user.first_name);
          setStep('bank');
        }
      } catch {
        if (user?.first_name) setHolderName(user.first_name);
        setStep('bank');
      }
    })();
  }, [user]);

  // Helper to find bank info
  const findBank = (bankName: string): BankItem => {
    return (
      banks.find(b => b.name.toLowerCase() === bankName.toLowerCase()) ||
      banks[0]
    );
  };

  // ── Actions ──
  const startEditBank = () => {
    haptic('medium');
    setError('');
    if (savedAccount) {
      setSelectedBank(findBank(savedAccount.bank_name));
      setHolderName(savedAccount.account_holder_name);
      setAccountNumber(savedAccount.account_number);
    }
    setStep('bank');
  };

  const startChangePin = () => {
    haptic('medium');
    setError('');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setStep('change_pin_current');
  };

  const handleSelectBank = (b: BankItem) => {
    haptic('medium');
    setSelectedBank(b);
    setError('');
    setStep('details');
  };

  const handleDetailsNext = () => {
    setError('');
    if (!holderName.trim()) { setError('Please enter account holder name.'); return; }
    if (!accountNumber.trim()) { setError('Please enter account number.'); return; }
    haptic('medium');

    if (savedAccount) {
      // If updating existing bank account, ask for PREVIOUS PIN!
      setCurrentPin('');
      setStep('pin_verify_update');
    } else {
      // First time saving
      setPin('');
      setStep('pin_create');
    }
  };

  // 1. First-time save handler
  const handleSaveFirstTime = async () => {
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
      if (!res.ok) { setError(data.error || 'Failed to save bank details.'); return; }

      setSavedAccount({
        id: 'new',
        bank_name: selectedBank!.name,
        account_holder_name: holderName.trim(),
        account_number: accountNumber.trim(),
        updated_at: new Date().toISOString(),
      });
      setDoneTitle('Bank Saved! 🎉');
      setDoneDesc('Your bank account is now saved and secured with your PIN');
      setStep('done');
      if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Update bank details with previous PIN
  const handleUpdateWithPrevPin = async () => {
    setError('');
    if (!/^\d{6}$/.test(currentPin)) { setError('Please enter your 6-digit previous PIN.'); return; }
    setLoading(true);
    haptic('heavy');
    try {
      const res = await fetch(`${API}/agent-bank/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({
          bank_name: selectedBank!.name,
          account_holder_name: holderName.trim(),
          account_number: accountNumber.trim(),
          current_pin: currentPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Incorrect previous PIN. Please try again.');
        return;
      }

      setSavedAccount({
        id: savedAccount?.id || 'updated',
        bank_name: selectedBank!.name,
        account_holder_name: holderName.trim(),
        account_number: accountNumber.trim(),
        updated_at: new Date().toISOString(),
      });
      setDoneTitle('Bank Details Updated! ✅');
      setDoneDesc('Your account details have been securely updated');
      setStep('done');
      if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Change PIN handlers
  const handleCurrentPinSubmit = () => {
    if (!/^\d{6}$/.test(currentPin)) {
      setError('Please enter your 6-digit current PIN.');
      return;
    }
    setError('');
    haptic('medium');
    setStep('change_pin_new');
  };

  const handleNewPinSubmit = () => {
    if (!/^\d{6}$/.test(newPin)) {
      setError('New PIN must be exactly 6 digits.');
      return;
    }
    if (newPin === currentPin) {
      setError('New PIN must be different from current PIN.');
      return;
    }
    setError('');
    haptic('medium');
    setStep('change_pin_confirm');
  };

  const handleConfirmPinSubmit = async () => {
    if (confirmPin !== newPin) {
      setError('PINs do not match. Please re-enter.');
      return;
    }
    setError('');
    setLoading(true);
    haptic('heavy');
    try {
      const res = await fetch(`${API}/agent-bank/change-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({
          current_pin: currentPin,
          new_pin: newPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to change PIN. Verify your current PIN.');
        return;
      }

      setDoneTitle('PIN Changed Successfully! 🔐');
      setDoneDesc('Your new PIN is now active. Keep it safe.');
      setStep('done');
      if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Custom numpad key handler
  const handleKeyPad = (val: string, currentVal: string, setter: (v: string) => void) => {
    haptic('light');
    if (val === '⌫') {
      setter(currentVal.slice(0, -1));
    } else if (currentVal.length < 6) {
      setter(currentVal + val);
    }
  };

  // Back button logic
  const goBack = () => {
    setError('');
    if (step === 'details') {
      setStep('bank');
    } else if (step === 'pin_create') {
      setStep('details');
    } else if (step === 'pin_verify_update') {
      setStep('details');
    } else if (step === 'bank' && savedAccount) {
      setStep('saved_view');
    } else if (step === 'change_pin_current') {
      setStep('saved_view');
    } else if (step === 'change_pin_new') {
      setStep('change_pin_current');
    } else if (step === 'change_pin_confirm') {
      setStep('change_pin_new');
    } else {
      onClose();
    }
  };

  // Helper component to render authentic Bank Logo
  const renderBankLogo = (bank: BankItem, sizeClass = 'w-12 h-12', roundedClass = 'rounded-2xl') => {
    return (
      <div className={`${sizeClass} ${roundedClass} bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center p-1 shrink-0 overflow-hidden relative`}>
        {bank.logo_url ? (
          <img
            src={bank.logo_url}
            alt={bank.name}
            className="w-full h-full object-contain rounded-xl"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback') as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        <span
          className="logo-fallback hidden w-full h-full rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white font-black text-[11px] items-center justify-center tracking-wider uppercase text-center shadow-inner"
          style={{ display: bank.logo_url ? 'none' : 'flex' }}
        >
          {bank.code.slice(0, 4)}
        </span>
      </div>
    );
  };

  // Reusable 6-digit keypad renderer
  const renderNumpad = (currentVal: string, setter: (v: string) => void) => {
    return (
      <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto w-full pt-1">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => k !== '' && handleKeyPad(k, currentVal, setter)}
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
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose}>
      {/* Dim backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Slide-up sheet */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-[32px] overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* ── Sheet Header ── */}
        <div className="px-5 pt-3 pb-3 flex items-center justify-between shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            {step !== 'loading' && step !== 'saved_view' && step !== 'done' && (
              <button
                onClick={goBack}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:bg-slate-200 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                {step === 'loading'            && '🏦 Bank Account'}
                {step === 'saved_view'         && '🏦 Attack Bank'}
                {step === 'bank'               && '🏦 Select Bank'}
                {step === 'details'            && '📝 Account Details'}
                {step === 'pin_create'         && '🔐 Set 6-Digit PIN'}
                {step === 'pin_verify_update'  && '🔒 Enter Previous PIN'}
                {step === 'change_pin_current' && '🔑 Current PIN'}
                {step === 'change_pin_new'     && '🔐 New 6-Digit PIN'}
                {step === 'change_pin_confirm' && '✨ Confirm New PIN'}
                {step === 'done'               && '🎉 Success'}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold">
                {step === 'saved_view'         && 'Agent payment details • PIN protected'}
                {step === 'bank'               && 'Choose your bank to save or update'}
                {step === 'details'            && 'Enter your official banking details'}
                {step === 'pin_create'         && 'Create a PIN to secure your saved bank'}
                {step === 'pin_verify_update'  && 'Authorization required to change bank info'}
                {step === 'change_pin_current' && 'Step 1 of 3: Verify existing PIN'}
                {step === 'change_pin_new'     && 'Step 2 of 3: Enter your new PIN'}
                {step === 'change_pin_confirm' && 'Step 3 of 3: Re-enter to confirm'}
                {step === 'done'               && 'Changes saved safely in database'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800"
          >
            <X size={15} />
          </button>
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
              <p className="text-xs font-bold text-slate-400">Loading bank details...</p>
            </div>
          )}

          {/* ══ 1. SAVED VIEW (Beautiful Debit Card UI + Update Details + Change PIN) ══ */}
          {step === 'saved_view' && savedAccount && (
            <div className="px-5 py-5 space-y-4">
              {/* ATM / Debit Card Hero */}
              <div className="relative rounded-3xl overflow-hidden shadow-lg">
                {/* Metallic gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-black" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.18)_0%,transparent_65%)]" />

                {/* Decorative chip & curves */}
                <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full border border-white/5 pointer-events-none" />
                <div className="absolute -right-4 -bottom-4 w-28 h-28 rounded-full border border-white/5 pointer-events-none" />

                <div className="relative p-6 space-y-6">
                  {/* Top: Logo + Name + Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {renderBankLogo(findBank(savedAccount.bank_name), 'w-11 h-11', 'rounded-xl')}
                      <div>
                        <p className="text-white font-black text-sm leading-tight">
                          {savedAccount.bank_name}
                        </p>
                        <p className="text-amber-400 text-[10px] font-extrabold uppercase tracking-wider mt-0.5">
                          Official Agent Account
                        </p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      <ShieldCheck size={11} /> Saved
                    </span>
                  </div>

                  {/* Account Number */}
                  <div>
                    <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mb-1">
                      Account Number
                    </p>
                    <p className="text-white font-black text-2xl tracking-[0.2em] font-mono">
                      {savedAccount.account_number.length > 6
                        ? `•••• •••• ${savedAccount.account_number.slice(-4)}`
                        : savedAccount.account_number}
                    </p>
                  </div>

                  {/* Holder Name + PIN Protected */}
                  <div className="flex items-end justify-between pt-1 border-t border-white/10">
                    <div>
                      <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mb-0.5">
                        Account Holder
                      </p>
                      <p className="text-white font-black text-sm uppercase">
                        {savedAccount.account_holder_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-amber-400">
                      <Lock size={12} />
                      <span className="text-[10px] font-black tracking-wide">PIN Secured</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Update Bank Details + Change PIN */}
              <div className="space-y-2.5 pt-1">
                {/* Button 1: Update Bank Details (Requires Previous PIN) */}
                <button
                  onClick={startEditBank}
                  className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                      <Pencil size={15} />
                    </div>
                    <div className="text-left">
                      <p className="leading-tight">Update Bank Details</p>
                      <p className="text-[10px] font-medium text-white/80">Change bank, name or account number</p>
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </button>

                {/* Button 2: Dedicated Change PIN button */}
                <button
                  onClick={startChangePin}
                  className="w-full py-4 px-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-800 font-black text-sm active:scale-95 transition-all flex items-center justify-between shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                      <KeyRound size={15} />
                    </div>
                    <div className="text-left">
                      <p className="leading-tight">Change Withdrawal PIN</p>
                      <p className="text-[10px] font-bold text-slate-400">Update your 6-digit security PIN</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                Close
              </button>
            </div>
          )}

          {/* ══ 2. BANK SELECT (With crisp authentic logos) ══ */}
          {step === 'bank' && (
            <div className="px-5 py-4 pb-8 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Choose Your Bank / Wallet
              </p>
              <div className="space-y-2">
                {banks.map(b => (
                  <button
                    key={b.id}
                    onClick={() => handleSelectBank(b)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] ${
                      selectedBank?.id === b.id
                        ? 'bg-amber-50/70 border-amber-400 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    {renderBankLogo(b, 'w-11 h-11', 'rounded-xl')}
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-black text-slate-900 leading-snug truncate">
                        {b.name}
                      </p>
                      <span className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider">
                        {b.code}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ══ 3. ACCOUNT DETAILS FORM ══ */}
          {step === 'details' && selectedBank && (
            <div className="px-5 py-4 pb-8 space-y-4">
              {/* Selected Bank Banner */}
              <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                {renderBankLogo(selectedBank, 'w-12 h-12', 'rounded-xl')}
                <div>
                  <p className="text-sm font-black text-slate-900 leading-tight">
                    {selectedBank.name}
                  </p>
                  <p className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider mt-0.5">
                    {selectedBank.code}
                  </p>
                </div>
              </div>

              {/* Account Holder Name */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <User size={12} /> Account Holder Full Name
                </label>
                <input
                  type="text"
                  value={holderName}
                  onChange={e => setHolderName(e.target.value)}
                  placeholder="e.g. Abebe Bikila"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
                />
              </div>

              {/* Account Number */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <Hash size={12} /> Account Number / Phone
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 10000488262045"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
                />
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 font-semibold leading-relaxed">
                  {savedAccount
                    ? 'To update your bank details, you will be asked to enter your previous PIN next.'
                    : 'Your bank information will be securely saved and protected with your 6-digit PIN.'}
                </p>
              </div>

              <button
                onClick={handleDetailsNext}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span>Continue</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ══ 4. FIRST-TIME PIN CREATION ══ */}
          {step === 'pin_create' && (
            <div className="px-5 py-4 pb-8 space-y-4">
              <div className="text-center space-y-1">
                <p className="text-xs font-black text-slate-800">Set Your 6-Digit PIN</p>
                <p className="text-[10px] text-slate-400 font-bold">
                  This PIN will be required anytime you update your account
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
              {renderNumpad(pin, setPin)}

              <button
                onClick={handleSaveFirstTime}
                disabled={loading || pin.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  pin.length === 6
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_4px_16px_rgba(249,115,22,0.35)]'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Save Bank Account'}
              </button>
            </div>
          )}

          {/* ══ 5. PREVIOUS PIN VERIFICATION FOR UPDATING BANK DETAILS ══ */}
          {step === 'pin_verify_update' && (
            <div className="px-5 py-4 pb-8 space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 mb-1">
                  <Lock size={22} />
                </div>
                <p className="text-sm font-black text-slate-900">Enter Previous PIN</p>
                <p className="text-[11px] text-slate-500 font-semibold max-w-xs mx-auto">
                  To update your bank details, please enter the previous 6-digit PIN you saved
                </p>
              </div>

              {/* Dots indicator */}
              <div className="flex justify-center gap-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      i < currentPin.length
                        ? 'bg-amber-500 border-amber-500 scale-110'
                        : 'bg-white border-slate-300'
                    }`}
                  />
                ))}
              </div>

              {/* Numpad */}
              {renderNumpad(currentPin, setCurrentPin)}

              <button
                onClick={handleUpdateWithPrevPin}
                disabled={loading || currentPin.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  currentPin.length === 6
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_4px_16px_rgba(249,115,22,0.35)]'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                ) : (
                  'Authorize & Update Details'
                )}
              </button>
            </div>
          )}

          {/* ══ 6. CHANGE PIN - STEP 1: CURRENT PIN ══ */}
          {step === 'change_pin_current' && (
            <div className="px-5 py-4 pb-8 space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-700 mb-1">
                  <KeyRound size={22} />
                </div>
                <p className="text-sm font-black text-slate-900">Enter Current PIN</p>
                <p className="text-[11px] text-slate-400 font-semibold">
                  Step 1 of 3 • Enter your existing 6-digit PIN
                </p>
              </div>

              <div className="flex justify-center gap-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      i < currentPin.length
                        ? 'bg-amber-500 border-amber-500 scale-110'
                        : 'bg-white border-slate-300'
                    }`}
                  />
                ))}
              </div>

              {renderNumpad(currentPin, setCurrentPin)}

              <button
                onClick={handleCurrentPinSubmit}
                disabled={currentPin.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  currentPin.length === 6
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                <span>Next: Enter New PIN</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ══ 7. CHANGE PIN - STEP 2: NEW PIN ══ */}
          {step === 'change_pin_new' && (
            <div className="px-5 py-4 pb-8 space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 mb-1">
                  <Lock size={22} />
                </div>
                <p className="text-sm font-black text-slate-900">Enter New 6-Digit PIN</p>
                <p className="text-[11px] text-slate-400 font-semibold">
                  Step 2 of 3 • Choose your new secret PIN
                </p>
              </div>

              <div className="flex justify-center gap-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      i < newPin.length
                        ? 'bg-amber-500 border-amber-500 scale-110'
                        : 'bg-white border-slate-300'
                    }`}
                  />
                ))}
              </div>

              {renderNumpad(newPin, setNewPin)}

              <button
                onClick={handleNewPinSubmit}
                disabled={newPin.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  newPin.length === 6
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                <span>Next: Confirm New PIN</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ══ 8. CHANGE PIN - STEP 3: CONFIRM NEW PIN ══ */}
          {step === 'change_pin_confirm' && (
            <div className="px-5 py-4 pb-8 space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600 mb-1">
                  <Sparkles size={22} />
                </div>
                <p className="text-sm font-black text-slate-900">Confirm New PIN</p>
                <p className="text-[11px] text-slate-400 font-semibold">
                  Step 3 of 3 • Re-enter your new 6-digit PIN to confirm
                </p>
              </div>

              <div className="flex justify-center gap-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      i < confirmPin.length
                        ? 'bg-emerald-500 border-emerald-500 scale-110'
                        : 'bg-white border-slate-300'
                    }`}
                  />
                ))}
              </div>

              {renderNumpad(confirmPin, setConfirmPin)}

              <button
                onClick={handleConfirmPinSubmit}
                disabled={loading || confirmPin.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  confirmPin.length === 6
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_4px_16px_rgba(16,185,129,0.35)]'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Updating PIN...</>
                ) : (
                  'Confirm & Update PIN'
                )}
              </button>
            </div>
          )}

          {/* ══ 9. DONE SCREEN ══ */}
          {step === 'done' && (
            <div className="px-5 py-8 flex flex-col items-center text-center space-y-5">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-40" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-[0_8px_32px_rgba(16,185,129,0.35)]">
                  <CheckCircle2 size={44} className="text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900">{doneTitle}</h3>
                <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto">
                  {doneDesc}
                </p>
              </div>

              {savedAccount && (
                <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-2.5">
                  <div className="flex items-center gap-3">
                    {renderBankLogo(findBank(savedAccount.bank_name), 'w-10 h-10', 'rounded-xl')}
                    <div>
                      <p className="text-sm font-black text-slate-900 leading-tight">
                        {savedAccount.bank_name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold">
                        {savedAccount.account_holder_name}
                      </p>
                    </div>
                  </div>
                  <div className="h-px bg-slate-200/60" />
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Account Number</span>
                    <span className="text-slate-900 font-mono font-black">
                      {savedAccount.account_number}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Security Status</span>
                    <span className="flex items-center gap-1 text-emerald-600 font-black">
                      <ShieldCheck size={13} /> Active & Secured
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep('saved_view')}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all"
              >
                Back to Bank Account
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
