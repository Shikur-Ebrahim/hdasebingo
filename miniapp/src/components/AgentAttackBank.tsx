/**
 * AgentAttackBank — Save bank details only (Attack Bank)
 * 1. Only active methods (10 verified banks/wallets) with authentic logos
 * 2. Empty default account holder name (no prefill from agent Telegram name)
 * 3. Prevents any accidental backdrop closes / page refreshes
 * 4. Updating bank details strictly verifies previous PIN
 * 5. Change PIN strictly verifies current PIN before accepting new PIN
 */
import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  X,
  ChevronRight,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  Loader2,
  User,
  Hash,
  Lock,
  Pencil,
  ShieldCheck,
  KeyRound,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

export interface BankItem {
  id: string;
  name: string;
  code: string;
  logo_url: string;
  color: string;
}

// Exactly the 10 active, verified Ethiopian banking & mobile money methods
export const VERIFIED_BANKS: BankItem[] = [
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
];

export const getBankDetails = (bankName: string, bankList: BankItem[] = VERIFIED_BANKS): BankItem => {
  if (!bankName) return bankList[0];
  const query = bankName.trim().toLowerCase();
  const found = bankList.find(b => 
    b.name.toLowerCase() === query || 
    b.code.toLowerCase() === query ||
    b.id.toLowerCase() === query ||
    b.name.toLowerCase().includes(query) ||
    query.includes(b.name.toLowerCase())
  );
  return found || {
    id: 'unknown',
    name: bankName,
    code: bankName.slice(0, 4).toUpperCase(),
    logo_url: '',
    color: 'from-amber-500 to-orange-500'
  };
};

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
  | 'pin_create'        // First-time PIN setup
  | 'pin_verify_update' // Previous PIN verification to update details
  | 'change_pin_current'// Change PIN - Step 1: verify current PIN
  | 'change_pin_new'    // Change PIN - Step 2: enter new PIN
  | 'change_pin_confirm'// Change PIN - Step 3: confirm new PIN
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
  const [step, setStep] = useState<Step>('loading');
  const [banks, setBanks] = useState<BankItem[]>(VERIFIED_BANKS);
  const [savedAccount, setSavedAccount] = useState<SavedAccount | null>(null);
  const [selectedBank, setSelectedBank] = useState<BankItem | null>(null);

  // Form inputs — empty by default, NO agent Telegram name prefill!
  const [holderName, setHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  // PIN inputs
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [doneTitle, setDoneTitle] = useState('Bank Saved!');
  const [doneDesc, setDoneDesc] = useState('Your bank details are secured with PIN');

  // Load saved account & live logos from backend on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const headers = { 'x-telegram-init-data': initData };

        // 1. Fetch saved agent bank account
        const savedRes = await fetch(`${API}/agent-bank/saved`, { headers });
        const savedData = await savedRes.json();

        // 2. Fetch live method logos to keep them 100% synchronized
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
          if (savedData && savedData.id) {
            setSavedAccount(savedData);
            setStep('saved_view');
          } else {
            // First time — holderName stays completely empty!
            setStep('bank');
          }
        }
      } catch {
        if (isMounted) {
          setStep('bank');
        }
      }
    })();

    return () => { isMounted = false; };
  }, []);

  // Helper to find bank
  const findBank = (bankName: string): BankItem => {
    return (
      banks.find(b => b.name.toLowerCase() === bankName.toLowerCase()) ||
      banks[0]
    );
  };

  // ── Flows ──

  // 1. Start editing existing bank account
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

  // 2. Start Change PIN flow
  const startChangePin = () => {
    haptic('medium');
    setError('');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setStep('change_pin_current');
  };

  // Select Bank from list
  const handleSelectBank = (b: BankItem) => {
    haptic('medium');
    setSelectedBank(b);
    setError('');
    setStep('details');
  };

  // Account details continue
  const handleDetailsNext = () => {
    setError('');
    if (!holderName.trim()) { setError('Please enter account holder full name.'); return; }
    if (!accountNumber.trim()) { setError('Please enter account number.'); return; }
    haptic('medium');

    if (savedAccount) {
      // Modifying existing bank -> strictly require previous PIN!
      setCurrentPin('');
      setStep('pin_verify_update');
    } else {
      // First time saving -> set 6-digit PIN
      setPin('');
      setStep('pin_create');
    }
  };

  // ── First-Time Save ──
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

      const updated = {
        id: 'saved',
        bank_name: selectedBank!.name,
        account_holder_name: holderName.trim(),
        account_number: accountNumber.trim(),
        updated_at: new Date().toISOString(),
      };
      setSavedAccount(updated);
      setDoneTitle('Bank Saved! 🎉');
      setDoneDesc('Your bank account is now saved and secured with your PIN');
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

  // ── Update Bank Details (With Previous PIN verification) ──
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
        setError(data.error || 'Incorrect previous PIN! You must enter your correct saved PIN.');
        return;
      }

      const updated = {
        id: savedAccount?.id || 'updated',
        bank_name: selectedBank!.name,
        account_holder_name: holderName.trim(),
        account_number: accountNumber.trim(),
        updated_at: new Date().toISOString(),
      };
      setSavedAccount(updated);
      setDoneTitle('Bank Details Updated! ✅');
      setDoneDesc('Your account details have been updated successfully');
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

  // ── Change PIN Step 1: Verify Current PIN against Backend Immediately! ──
  const handleVerifyCurrentPin = async () => {
    setError('');
    if (!/^\d{6}$/.test(currentPin)) {
      setError('Please enter your 6-digit current PIN.');
      return;
    }
    setLoading(true);
    haptic('medium');
    try {
      const res = await fetch(`${API}/agent-bank/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ pin: currentPin }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setError(data.error || 'Incorrect current PIN! Not accepted.');
        return;
      }

      // Valid current PIN confirmed -> proceed to Enter New PIN!
      haptic('heavy');
      setNewPin('');
      setConfirmPin('');
      setStep('change_pin_new');
    } catch {
      setError('Network error. Could not verify PIN.');
    } finally {
      setLoading(false);
    }
  };

  // Change PIN Step 2: Validate New PIN format
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
    setConfirmPin('');
    setStep('change_pin_confirm');
  };

  // Change PIN Step 3: Confirm & Submit
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
      setDoneDesc('Your new PIN is now active and securing your account.');
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

  // Back button navigation
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

  // Render authentic Bank Logo
  const renderBankLogo = (bank: BankItem, sizeClass = 'w-11 h-11') => {
    return (
      <div className={`${sizeClass} rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center p-1 shrink-0 overflow-hidden relative`}>
        {bank.logo_url ? (
          <img
            src={bank.logo_url}
            alt={bank.name}
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (k !== '') handleKeyPad(k, currentVal, setter);
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
    );
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center select-none"
      onClick={(e) => {
        // Only close if clicking directly on the outer backdrop, NEVER on children!
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-none"
      />

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
            {step !== 'loading' && step !== 'saved_view' && step !== 'done' && (
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
                {step === 'loading'            && '🏦 Bank Account'}
                {step === 'saved_view'         && '🏦 Attack Bank'}
                {step === 'bank'               && '🏦 Select Bank'}
                {step === 'details'            && '📝 Account Details'}
                {step === 'pin_create'         && '🔐 Set 6-Digit PIN'}
                {step === 'pin_verify_update'  && '🔒 Enter Previous PIN'}
                {step === 'change_pin_current' && '🔑 Current PIN'}
                {step === 'change_pin_new'     && '🔐 New 6-Digit PIN'}
                {step === 'change_pin_confirm' && '✨ Confirm New PIN'}
                {step === 'done'               && '🎉 Saved'}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold">
                {step === 'saved_view'         && 'Agent payment details • PIN protected'}
                {step === 'bank'               && 'Choose your bank to save or update'}
                {step === 'details'            && 'Enter your full name & account number'}
                {step === 'pin_create'         && 'Create a 6-digit PIN to secure your account'}
                {step === 'pin_verify_update'  && 'Previous PIN required to authorize updates'}
                {step === 'change_pin_current' && 'Step 1 of 3: Enter your current PIN'}
                {step === 'change_pin_new'     && 'Step 2 of 3: Enter your new PIN'}
                {step === 'change_pin_confirm' && 'Step 3 of 3: Re-enter to confirm'}
                {step === 'done'               && 'All information updated safely'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-all"
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

          {/* ══ 1. SAVED VIEW (Luxury Bright / Light Mobile-First Card) ══ */}
          {step === 'saved_view' && savedAccount && (
            <div className="px-5 py-5 space-y-4">
              {/* Luxury Bright / Light Card Hero */}
              <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-amber-50/70 via-white to-orange-50/50 border-2 border-amber-200/90 shadow-[0_8px_25px_rgba(245,158,11,0.12)]">
                {/* Subtle soft warm accents */}
                <div className="absolute -right-8 -bottom-8 w-44 h-44 rounded-full bg-gradient-to-br from-amber-300/10 to-orange-400/10 blur-xl pointer-events-none" />
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-amber-400/5 blur-2xl pointer-events-none" />

                <div className="relative p-6 space-y-5">
                  {/* Bank info */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {renderBankLogo(findBank(savedAccount.bank_name), 'w-12 h-12')}
                      <div>
                        <p className="text-slate-900 font-black text-sm leading-tight">
                          {savedAccount.bank_name}
                        </p>
                        <p className="text-amber-600 text-[10px] font-extrabold uppercase tracking-wider mt-0.5">
                          Official Agent Account
                        </p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/90 px-2.5 py-1 rounded-full uppercase tracking-wider shadow-2xs">
                      <ShieldCheck size={11} className="text-emerald-600" /> Saved
                    </span>
                  </div>

                  {/* Account Number with Eye Button Toggle */}
                  <div className="bg-white/90 rounded-2xl p-3.5 border border-amber-100/90 shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">
                        Account Number
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          haptic('light');
                          setShowAccountNumber((prev) => !prev);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition-all text-[10px] font-black"
                        title={showAccountNumber ? 'Hide account number' : 'Show full account number'}
                      >
                        {showAccountNumber ? (
                          <>
                            <EyeOff size={13} className="text-slate-500" />
                            <span>Hide</span>
                          </>
                        ) : (
                          <>
                            <Eye size={13} className="text-amber-600" />
                            <span className="text-amber-700">Show</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-slate-900 font-black text-2xl tracking-[0.16em] font-mono select-text py-0.5">
                      {showAccountNumber
                        ? savedAccount.account_number
                        : (savedAccount.account_number.length > 4
                            ? `•••• •••• ${savedAccount.account_number.slice(-4)}`
                            : '•••• ••••')}
                    </p>
                  </div>

                  {/* Holder Name + PIN Protected */}
                  <div className="flex items-end justify-between pt-1 border-t border-slate-100">
                    <div>
                      <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-0.5">
                        Account Holder
                      </p>
                      <p className="text-slate-900 font-black text-sm uppercase tracking-wide">
                        {savedAccount.account_holder_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800">
                      <Lock size={12} className="text-amber-600" />
                      <span className="text-[10px] font-black tracking-wide">PIN Secured</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Update Bank Details + Change PIN */}
              <div className="space-y-2.5 pt-1">
                {/* Button 1: Update Bank Details (Requires Previous PIN) */}
                <button
                  type="button"
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
                  type="button"
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
                type="button"
                onClick={onClose}
                className="w-full py-3 text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                Close
              </button>
            </div>
          )}

          {/* ══ 2. BANK SELECT (Only the 10 real verified banks) ══ */}
          {step === 'bank' && (
            <div className="px-5 py-4 pb-8 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Choose Your Bank / Wallet
              </p>
              <div className="space-y-2">
                {banks.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBank(b)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] ${
                      selectedBank?.id === b.id
                        ? 'bg-amber-50/70 border-amber-400 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    {renderBankLogo(b, 'w-11 h-11')}
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
                {renderBankLogo(selectedBank, 'w-12 h-12')}
                <div>
                  <p className="text-sm font-black text-slate-900 leading-tight">
                    {selectedBank.name}
                  </p>
                  <p className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider mt-0.5">
                    {selectedBank.code}
                  </p>
                </div>
              </div>

              {/* Account Holder Name — NO agent default prefill */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <User size={12} /> Account Holder Full Name
                </label>
                <input
                  type="text"
                  value={holderName}
                  onChange={e => setHolderName(e.target.value)}
                  placeholder="Enter account holder full name"
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
                  placeholder="Enter account number or phone"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
                />
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 font-semibold leading-relaxed">
                  {savedAccount
                    ? 'To update your bank details, you must enter your previous PIN next.'
                    : 'Your bank information will be securely saved and protected with your 6-digit PIN.'}
                </p>
              </div>

              <button
                type="button"
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

              {renderNumpad(pin, setPin)}

              <button
                type="button"
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
                  To update your bank details, please enter your previous 6-digit PIN
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

              {renderNumpad(currentPin, setCurrentPin)}

              <button
                type="button"
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

          {/* ══ 6. CHANGE PIN - STEP 1: CURRENT PIN (Verifies with backend immediately!) ══ */}
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
                type="button"
                onClick={handleVerifyCurrentPin}
                disabled={loading || currentPin.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  currentPin.length === 6 && !loading
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Verifying current PIN...</>
                ) : (
                  <><span>Next: Enter New PIN</span><ChevronRight size={16} /></>
                )}
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
                type="button"
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
                type="button"
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
                    {renderBankLogo(findBank(savedAccount.bank_name), 'w-10 h-10')}
                    <div>
                      <p className="text-sm font-black text-slate-900 leading-tight">
                        {savedAccount.bank_name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
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
                type="button"
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
