import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronRight, CheckCircle2, Clock, AlertCircle, User, Phone, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface WithdrawalMethod {
  id: string;
  type: string;
  logo_url: string;
  min_withdrawal: number;
}

const typeLabels: Record<string, string> = {
    cbe: 'Commercial Bank of Ethiopia',
  boa: 'Bank of Abyssinia',
  telebirr: 'Telebirr',
  mpesa: 'M-Pesa',
  cbebirr: 'CBE Birr',
  ebirr: 'E-Birr',
  awash: 'Awash Bank',
  dashen: 'Dashen Bank',
  amhara: 'Amhara Bank',
  coop: 'Cooperative Bank of Oromia',
  amole: 'Amole Wallet',
  hello_cash: 'HelloCash',
  nib: 'Nib International Bank',
  wegagen: 'Wegagen Bank',
  zemen: 'Zemen Bank',
  oromia: 'Oromia Bank',
  hibret: 'Hibret Bank',
};

const typeColors: Record<string, string> = {
    cbe: 'from-yellow-400 to-yellow-600',
  boa: 'from-blue-500 to-blue-700',
  telebirr: 'from-purple-500 to-purple-700',
  mpesa: 'from-green-500 to-green-700',
  cbebirr: 'from-yellow-500 to-yellow-700',
  ebirr: 'from-orange-500 to-orange-700',
  awash: 'from-slate-500 to-slate-700',
  dashen: 'from-blue-600 to-blue-800',
  amhara: 'from-teal-500 to-teal-700',
  coop: 'from-indigo-500 to-indigo-700',
  amole: 'from-red-500 to-red-700',
  hello_cash: 'from-green-400 to-green-600',
  nib: 'from-purple-400 to-purple-600',
  wegagen: 'from-slate-600 to-slate-800',
  zemen: 'from-orange-400 to-orange-600',
  oromia: 'from-teal-400 to-teal-600',
  hibret: 'from-yellow-500 to-yellow-600',
};

const typeEmoji: Record<string, string> = {
  cbe: '🏦',
  boa: '🏛️',
  telebirr: '📱',
  mpesa: '💚',
};

type Step = 'list' | 'form' | 'success' | 'pending_status';

export default function Withdraw() {
  const { user, language } = useGameStore();
  const userBalance = Number(user?.main_balance || 0);

  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WithdrawalMethod | null>(null);
  const [step, setStep] = useState<Step>('list');
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [supportContact, setSupportContact] = useState<string>('');

  // Form state
  const [amount, setAmount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const getHeaders = () => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    return { 'Content-Type': 'application/json', 'x-telegram-init-data': initData };
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const headers = getHeaders();
      const [methodsRes, historyRes, contactRes] = await Promise.all([
        fetch(`${API_URL}/withdraw/methods`, { headers }),
        fetch(`${API_URL}/withdraw/history`, { headers }),
        fetch(`${API_URL}/player/support-contact`, { headers }),
      ]);

      if (methodsRes.ok) setMethods(await methodsRes.json());

      if (historyRes.ok) {
        const history = await historyRes.json();
        const pending = history.find((w: any) => w.status === 'pending');
        if (pending) {
          setPendingAmount(pending.amount);
          setStep('pending_status');
        }
      }
      
      if (contactRes.ok) {
        const support = await contactRes.json();
        setSupportContact(support.username || 'hdasebingo_admin');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError('');

    const amtNum = parseFloat(amount);
    // Check for empty / invalid number first
    if (!amount || amount.trim() === '' || isNaN(amtNum) || amtNum <= 0) {
      setError('Please enter a valid withdrawal amount.');
      return;
    }
    if (amtNum < selected.min_withdrawal) {
      setError(`Minimum withdrawal for this method is ${selected.min_withdrawal.toLocaleString('en-US')} ETB`);
      return;
    }
    if (amtNum > userBalance) {
      setError(`Insufficient balance. Your balance is ${userBalance.toLocaleString('en-US')} ETB`);
      return;
    }
    if (!accountName.trim()) { setError('Please enter your full name.'); return; }
    if (!accountNumber.trim()) { setError('Please enter your account/phone number.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/withdraw/request`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          method_id: selected.id,
          amount: amtNum,
          account_name: accountName.trim(),
          account_number: accountNumber.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to submit.'); return; }

      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // ── STEP: PENDING STATUS ──────────────────────────────────────────────────
  if (step === 'pending_status') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
          <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-yellow-100">
            <Clock size={40} className="text-yellow-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">{t[language].withdraw.alreadyPendingTitle}</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 leading-relaxed">
            {t[language].withdraw.alreadyPendingDesc.split('{amount}')[0]}<span className="font-black text-slate-700 dark:text-slate-200">{pendingAmount?.toLocaleString('en-US')} ETB</span>{t[language].withdraw.alreadyPendingDesc.split('{amount}')[1]}
          </p>
          <div className="mt-5 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs text-blue-700 font-semibold text-center">{t[language].withdraw.waitAdmin}</p>
          </div>
          {supportContact && (
            <a 
              href={`https://t.me/${supportContact.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center space-x-2 text-blue-600 font-black text-sm bg-blue-50 hover:bg-blue-100 transition-colors py-3.5 rounded-xl w-full border border-blue-100"
            >
              <MessageCircle size={18} />
              <span>Need Help? {t[language].withdraw.contactSupport}</span>
            </a>
          )}

          <Link to="/" className="mt-3 block w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-black py-4 rounded-xl text-center transition-all active:scale-95">
            {t[language].withdraw.backHome}
          </Link>
        </div>
      </div>
    );
  }

  // ── STEP: SUCCESS ────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-green-100">
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">{t[language].withdraw.submitted}</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 leading-relaxed">
            {t[language].withdraw.pendingReview.split('{amount}')[0]}<span className="font-black text-slate-700 dark:text-slate-200">{parseFloat(amount).toLocaleString('en-US')} ETB</span>{t[language].withdraw.pendingReview.split('{amount}')[1]}
          </p>
          <div className="mt-5 bg-green-50 border border-green-100 rounded-xl p-4">
            <p className="text-xs text-green-700 font-semibold text-center">{t[language].withdraw.willBeProcessed}</p>
          </div>
          {supportContact && (
            <a 
              href={`https://t.me/${supportContact.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center space-x-2 text-blue-600 font-black text-sm bg-blue-50 hover:bg-blue-100 transition-colors py-3.5 rounded-xl w-full border border-blue-100"
            >
              <MessageCircle size={18} />
              <span>Need Help? {t[language].withdraw.contactSupport}</span>
            </a>
          )}

          <Link to="/" className="mt-3 block w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-black py-4 rounded-xl text-center transition-all active:scale-95">
            {t[language].withdraw.backHome}
          </Link>
        </div>
      </div>
    );
  }

  // ── STEP: FORM ────────────────────────────────────────────────────────────
  if (step === 'form' && selected) {
    const gradient = typeColors[selected.type] || 'from-slate-500 to-slate-700';
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className={`bg-gradient-to-r ${gradient} px-4 pt-6 pb-8`}>
          <div className="flex items-center space-x-3 mb-4">
            <button onClick={() => setStep('list')} className="text-white/80 hover:text-white p-1">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-lg font-black text-white">
              {typeEmoji[selected.type]} {typeLabels[selected.type] || selected.type.toUpperCase()}
            </h1>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-md border border-white/10">
            <p className="text-slate-500 text-sm font-medium">{t[language].withdraw.balance}</p>
            <p className="text-3xl font-black text-slate-800">{userBalance.toLocaleString('en-US')} <span className="text-xl text-slate-600">ETB</span></p>
            <p className="text-slate-400 text-xs mt-1">{t[language].withdraw.minWithdrawal} {selected.min_withdrawal.toLocaleString('en-US')} ETB</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-4 -mt-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-5 space-y-4">

            {error && (
              <div className="flex items-start space-x-2 bg-red-50 border border-red-100 rounded-xl p-3">
                <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t[language].withdraw.amountLabel}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ETB</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  min={selected.min_withdrawal}
                  max={userBalance}
                  className="w-full pl-14 pr-4 py-3.5 border-2 border-gray-100 dark:border-slate-800 rounded-xl focus:border-blue-400 focus:outline-none text-slate-800 dark:text-slate-100 font-bold text-lg bg-slate-50 dark:bg-slate-900"
                  required
                />
              </div>
              <div className="flex justify-between mt-1">
                <p className={`text-xs font-bold ${amount && parseFloat(amount) > 0 && parseFloat(amount) < selected.min_withdrawal ? 'text-red-500' : 'text-slate-400'}`}>
                  {t[language].withdraw.minWithdrawal} {selected.min_withdrawal.toLocaleString('en-US')} ETB
                  {amount && parseFloat(amount) > 0 && parseFloat(amount) < selected.min_withdrawal && ' ⚠️ Too low'}
                </p>
                <button
                  type="button"
                  onClick={() => setAmount(String(userBalance))}
                  className="text-xs text-blue-500 font-bold"
                >
                  Max
                </button>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{t[language].withdraw.fullNameLabel}</label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  placeholder={t[language].withdraw.fullNamePlaceholder}
                  className="w-full pl-10 pr-4 py-3.5 border-2 border-gray-100 dark:border-slate-800 rounded-xl focus:border-blue-400 focus:outline-none text-slate-800 dark:text-slate-100 font-medium bg-slate-50 dark:bg-slate-900"
                  required
                />
              </div>
            </div>

            {/* Account / Phone Number */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                {selected.type === 'telebirr' || selected.type === 'mpesa' ? t[language].withdraw.phoneLabel : t[language].withdraw.accNumberLabel}
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  placeholder={selected.type === 'telebirr' || selected.type === 'mpesa' ? '09XXXXXXXX' : 'Account number'}
                  className="w-full pl-10 pr-4 py-3.5 border-2 border-gray-100 dark:border-slate-800 rounded-xl focus:border-blue-400 focus:outline-none text-slate-800 dark:text-slate-100 font-medium bg-slate-50 dark:bg-slate-900"
                  required
                />
              </div>
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs text-blue-700 font-medium leading-relaxed">
                ⚠️ {t[language].withdraw.infoBox}
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-4 rounded-xl font-black text-white text-base transition-all active:scale-95 ${
                submitting
                  ? 'bg-slate-300 cursor-not-allowed'
                  : `bg-gradient-to-r ${gradient}`
              }`}
            >
              {submitting ? t[language].withdraw.submitting : `${t[language].withdraw.title} ${(amount && !isNaN(parseFloat(amount))) ? parseFloat(amount).toLocaleString('en-US') : '0'} ETB`}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── STEP: LIST ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 pt-6 pb-8">
        <div className="flex items-center space-x-3 mb-4">
          <Link to="/" className="text-white/80 hover:text-white p-1">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-xl font-black text-white">{t[language].withdraw.title}</h1>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-md border border-white/10">
          <p className="text-slate-500 text-sm font-medium">{t[language].withdraw.balance}</p>
          <p className="text-3xl font-black text-slate-800">{userBalance.toLocaleString('en-US')} <span className="text-xl text-slate-600">ETB</span></p>
          <p className="text-slate-400 text-xs mt-1">{language === 'am' ? 'ዋናው ሂሳብ ብቻ ሊወጣ ይችላል' : 'Only main balance can be withdrawn'}</p>
        </div>
      </div>

      {/* Methods */}
      <div className="px-4 -mt-4 pb-8">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-black text-slate-700 dark:text-slate-200 text-sm uppercase tracking-wider">{t[language].withdraw.methodTitle}</h2>
          </div>

          {methods.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-400">
              <AlertCircle size={40} className="mb-3 opacity-50" />
              <p className="font-semibold">No withdrawal methods available</p>
              <p className="text-xs mt-1">Please check back later</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {methods.map(method => {
                const gradient = typeColors[method.type] || 'from-slate-500 to-slate-700';
                const emoji = typeEmoji[method.type] || '💳';
                const label = typeLabels[method.type] || method.type.toUpperCase();

                return (
                  <button
                    key={method.id}
                    onClick={() => { setSelected(method); setError(''); setStep('form'); }}
                    className="w-full flex items-center px-5 py-4 space-x-4 hover:bg-slate-50 dark:bg-slate-900 active:bg-slate-100 dark:bg-slate-800 transition-colors"
                  >
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shadow-sm`}>
                      {method.logo_url ? (
                        <img src={method.logo_url} alt={label} className="w-8 h-8 object-contain rounded-xl" />
                      ) : (
                        <span>{emoji}</span>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-black text-slate-800 dark:text-slate-100">{label}</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">Min: {method.min_withdrawal.toLocaleString('en-US')} ETB</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
