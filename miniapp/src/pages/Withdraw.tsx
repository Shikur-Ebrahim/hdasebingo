import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  User,
  Phone,
  MessageCircle,
  Percent,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import VideoGuideButton from '../components/VideoGuideButton';

interface FeeSettings {
  enabled: boolean;
  tier1_max: number;   // e.g. 2000
  tier1_fee: number;   // e.g. 3  (percent)
  tier2_max: number;   // e.g. 10000
  tier2_fee: number;   // e.g. 2
  tier3_fee: number;   // e.g. 1
  user_role?: string;
  is_exempt?: boolean;
}

function calcFee(amount: number, settings: FeeSettings | null): { feePercent: number; feeAmount: number; netAmount: number } {
  if (!settings || !settings.enabled || settings.is_exempt) {
    return { feePercent: 0, feeAmount: 0, netAmount: amount };
  }
  let pct = settings.tier3_fee;
  if (amount <= settings.tier1_max) pct = settings.tier1_fee;
  else if (amount <= settings.tier2_max) pct = settings.tier2_fee;
  const feeAmount = Math.round(amount * pct) / 100;
  return { feePercent: pct, feeAmount, netAmount: amount - feeAmount };
}

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
  const navigate = useNavigate();
  const { user, language } = useGameStore();
  const userBalance = Number(user?.main_balance || 0);

  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WithdrawalMethod | null>(null);
  const [step, setStep] = useState<Step>('list');
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [supportContact, setSupportContact] = useState<string>('');

  // Fee settings (fetched once & dynamic from Admin)
  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);
  const [showFeeModal, setShowFeeModal] = useState(false);

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

  // Live fee calculation based on current amount input
  const amtNum = parseFloat(amount) || 0;
  const feeCalc = useMemo(() => calcFee(amtNum, feeSettings), [amtNum, feeSettings]);

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-dismiss success notification after 1 second
  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => {
        navigate('/');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [step, navigate]);

  const fetchData = async () => {
    try {
      const headers = getHeaders();
      const [methodsRes, historyRes, contactRes, feeRes] = await Promise.all([
        fetch(`${API_URL}/withdraw/methods`, { headers }),
        fetch(`${API_URL}/withdraw/history`, { headers }),
        fetch(`${API_URL}/player/support-contact`, { headers }),
        fetch(`${API_URL}/withdraw/fee-settings`, { headers }),
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

      if (feeRes.ok) {
        const raw = await feeRes.json();
        const s = raw.settings || raw;
        setFeeSettings({
          enabled: (s.is_enabled !== undefined ? s.is_enabled : s.enabled) ?? true,
          tier1_max: Number(s.tier1_max_amount ?? s.tier1_max ?? 2000),
          tier1_fee: Number(s.tier1_fee_percent ?? s.tier1_fee ?? 3),
          tier2_max: Number(s.tier2_max_amount ?? s.tier2_max ?? 10000),
          tier2_fee: Number(s.tier2_fee_percent ?? s.tier2_fee ?? 2),
          tier3_fee: Number(s.tier3_fee_percent ?? s.tier3_fee ?? 1),
          user_role: raw.user_role || s.user_role,
          is_exempt: Boolean(raw.is_exempt ?? s.is_exempt ?? false),
        });
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

    const amt = parseFloat(amount);
    // Check for empty / invalid number first
    if (!amount || amount.trim() === '' || isNaN(amt) || amt <= 0) {
      setError('Please enter a valid withdrawal amount.');
      return;
    }
    if (amt < selected.min_withdrawal) {
      setError(`Minimum withdrawal for this method is ${selected.min_withdrawal.toLocaleString('en-US')} ETB`);
      return;
    }
    if (amt > userBalance) {
      setError(`Insufficient balance. Your balance is ${userBalance.toLocaleString('en-US')} ETB`);
      return;
    }
    if (!accountName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    const cleanAccNum = accountNumber.trim().replace(/\D/g, '');
    if (!cleanAccNum) {
      setError('Please enter your account/phone number (numbers only).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/withdraw/request`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          method_id: selected.id,
          amount: amt,
          account_name: accountName.trim(),
          account_number: cleanAccNum,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit.');
        return;
      }

      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Fee Details Modal
  const renderFeeModal = () => {
    if (!showFeeModal) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl max-w-sm w-full p-5 text-slate-800 dark:text-slate-100 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold">
                <Percent size={16} />
              </div>
              <div>
                <h3 className="text-sm font-black">
                  {language === 'am' ? 'የአገልግሎት ክፍያ ተመን' : 'Withdrawal Fee Rates'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {language === 'am' ? 'የክፍያ መመሪያ' : 'Service fee schedule'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFeeModal(false)}
              className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-3.5 space-y-2">
            {feeSettings?.is_exempt ? (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-3 text-xs text-emerald-700 dark:text-emerald-300 font-bold">
                ⭐ {language === 'am' ? 'ከክፍያ ነፃ አካውንት (0% Fee)' : '0% Fee Exemption (Agent / Promoter)'}
              </div>
            ) : !feeSettings?.enabled ? (
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 font-bold">
                ℹ️ {language === 'am' ? 'በአሁኑ ወቅት የአገልግሎት ክፍያ 0% ነው' : 'Withdrawal fee is currently 0% (Disabled)'}
              </div>
            ) : (
              <>
                {/* Tier 1 */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {language === 'am' ? 'እስከ' : 'Up to'} {feeSettings.tier1_max.toLocaleString('en-US')} ETB
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {language === 'am' ? 'ደረጃ 1' : 'Tier 1'}
                    </p>
                  </div>
                  <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                    {feeSettings.tier1_fee}%
                  </span>
                </div>

                {/* Tier 2 */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {(feeSettings.tier1_max + 1).toLocaleString('en-US')} – {feeSettings.tier2_max.toLocaleString('en-US')} ETB
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {language === 'am' ? 'ደረጃ 2' : 'Tier 2'}
                    </p>
                  </div>
                  <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                    {feeSettings.tier2_fee}%
                  </span>
                </div>

                {/* Tier 3 */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {language === 'am' ? 'ከ' : 'Above'} {feeSettings.tier2_max.toLocaleString('en-US')} ETB {language === 'am' ? 'በላይ' : ''}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {language === 'am' ? 'ደረጃ 3' : 'Tier 3 (Lowest)'}
                    </p>
                  </div>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                    {feeSettings.tier3_fee}%
                  </span>
                </div>
              </>
            )}

            <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1 leading-relaxed">
              {language === 'am'
                ? 'የአገልግሎት ክፍያው በቀጥታ ከጠየቁት ገንዘብ ላይ ተቀናሽ ይደረጋል።'
                : 'The fee is automatically deducted from your withdrawal amount upon request.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowFeeModal(false)}
            className="mt-4 w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black text-xs rounded-xl active:scale-95 transition-all"
          >
            {language === 'am' ? 'ተረድቻለሁ' : 'Got it'}
          </button>
        </div>
      </div>
    );
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
        {renderFeeModal()}
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
          <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-yellow-100">
            <Clock size={40} className="text-yellow-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">
            {t[language].withdraw.alreadyPendingTitle}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 leading-relaxed">
            {t[language].withdraw.alreadyPendingDesc.split('{amount}')[0]}
            <span className="font-black text-slate-700 dark:text-slate-200">
              {pendingAmount?.toLocaleString('en-US')} ETB
            </span>
            {t[language].withdraw.alreadyPendingDesc.split('{amount}')[1]}
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

          <Link
            to="/"
            className="mt-3 block w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-black py-4 rounded-xl text-center transition-all active:scale-95"
          >
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
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="w-20 h-20 bg-green-50 dark:bg-green-950/40 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-green-100 dark:border-green-900/50">
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">{t[language].withdraw.submitted}</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 leading-relaxed">
            {t[language].withdraw.pendingReview.split('{amount}')[0]}
            <span className="font-black text-slate-700 dark:text-slate-200">
              {parseFloat(amount).toLocaleString('en-US')} ETB
            </span>
            {t[language].withdraw.pendingReview.split('{amount}')[1]}
          </p>
          <div className="mt-5 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/40 rounded-xl p-4">
            <p className="text-xs text-green-700 dark:text-green-400 font-semibold text-center">{t[language].withdraw.willBeProcessed}</p>
          </div>

          <div className="mt-5 flex items-center justify-center space-x-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
            <span>Redirecting...</span>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP: FORM ────────────────────────────────────────────────────────────
  if (step === 'form' && selected) {
    const gradient = typeColors[selected.type] || 'from-slate-500 to-slate-700';
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {renderFeeModal()}

        {/* Header */}
        <div className={`bg-gradient-to-r ${gradient} px-4 pt-6 pb-8`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <button onClick={() => setStep('list')} className="text-white/80 hover:text-white p-1">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-lg font-black text-white">
                {typeEmoji[selected.type]} {typeLabels[selected.type] || selected.type.toUpperCase()}
              </h1>
            </div>

            {/* Top Right: Video Guide & smaller horizontal fee button just below it */}
            <div className="flex flex-col items-end gap-1.5">
              <VideoGuideButton category="withdraw" compact />
              <button
                type="button"
                onClick={() => setShowFeeModal(true)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold backdrop-blur-sm transition-all active:scale-95 border border-white/20"
              >
                <Percent size={11} />
                <span>{language === 'am' ? 'የክፍያ ተመን' : 'Fee Info'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-md border border-white/10">
            <p className="text-slate-500 text-sm font-medium">{t[language].withdraw.balance}</p>
            <p className="text-3xl font-black text-slate-800">
              {userBalance.toLocaleString('en-US')} <span className="text-xl text-slate-600">ETB</span>
            </p>
            <p className="text-slate-400 text-xs mt-1">
              {t[language].withdraw.minWithdrawal} {selected.min_withdrawal.toLocaleString('en-US')} ETB
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-4 -mt-4 pb-8">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-5 space-y-4">
            {error && (
              <div className="flex items-start space-x-2 bg-red-50 border border-red-100 rounded-xl p-3">
                <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                {t[language].withdraw.amountLabel}
              </label>
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

              {/* Fee Preview */}
              {feeSettings && feeSettings.enabled && !feeSettings.is_exempt && amtNum > 0 && (
                <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-amber-700 font-bold">
                      <Percent size={12} />
                      Service Fee ({feeCalc.feePercent}%)
                    </span>
                    <span className="text-xs font-black text-amber-700">
                      -{feeCalc.feeAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-amber-100 pt-1 mt-0.5">
                    <span className="text-xs text-emerald-700 font-bold">✅ You'll receive</span>
                    <span className="text-sm font-black text-emerald-700">
                      {feeCalc.netAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                    </span>
                  </div>
                </div>
              )}
              {feeSettings && feeSettings.is_exempt && (
                <p className="text-xs text-emerald-600 font-bold mt-1.5">✅ No service fee (exempt account)</p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                {t[language].withdraw.fullNameLabel}
              </label>
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

            {/* Account / Phone Number (Strictly Numbers Only) */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                {selected.type === 'telebirr' || selected.type === 'mpesa' ? t[language].withdraw.phoneLabel : t[language].withdraw.accNumberLabel}
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={accountNumber}
                  onChange={e => {
                    // Strictly numbers only
                    setAccountNumber(e.target.value.replace(/\D/g, ''));
                  }}
                  placeholder={selected.type === 'telebirr' || selected.type === 'mpesa' ? '09XXXXXXXX' : 'Account number'}
                  className="w-full pl-10 pr-4 py-3.5 border-2 border-gray-100 dark:border-slate-800 rounded-xl focus:border-blue-400 focus:outline-none text-slate-800 dark:text-slate-100 font-medium bg-slate-50 dark:bg-slate-900"
                  required
                />
              </div>
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
              {submitting
                ? t[language].withdraw.submitting
                : feeSettings && feeSettings.enabled && !feeSettings.is_exempt && amtNum > 0
                  ? `Withdraw ${amtNum.toLocaleString('en-US')} ETB → Get ${feeCalc.netAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB`
                  : `${t[language].withdraw.title} ${(amount && !isNaN(parseFloat(amount))) ? parseFloat(amount).toLocaleString('en-US') : '0'} ETB`}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── STEP: LIST ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {renderFeeModal()}

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Link to="/" className="text-white/80 hover:text-white p-1">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-black text-white">{t[language].withdraw.title}</h1>
          </div>

          {/* Top Right: Video Guide & smaller horizontal fee button just below it */}
          <div className="flex flex-col items-end gap-1.5">
            <VideoGuideButton category="withdraw" />
            <button
              type="button"
              onClick={() => setShowFeeModal(true)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold backdrop-blur-sm transition-all active:scale-95 border border-white/20"
            >
              <Percent size={12} />
              <span>{language === 'am' ? 'የአገልግሎት ክፍያ' : 'Fee Rates'}</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-md border border-white/10">
          <p className="text-slate-500 text-sm font-medium">{t[language].withdraw.balance}</p>
          <p className="text-3xl font-black text-slate-800">
            {userBalance.toLocaleString('en-US')} <span className="text-xl text-slate-600">ETB</span>
          </p>
          <p className="text-slate-400 text-xs mt-1">
            {language === 'am' ? 'ዋናው ሂሳብ ብቻ ሊወጣ ይችላል' : 'Only main balance can be withdrawn'}
          </p>
        </div>
      </div>

      {/* Methods */}
      <div className="px-4 -mt-4 pb-8">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-black text-slate-700 dark:text-slate-200 text-sm uppercase tracking-wider">
              {t[language].withdraw.methodTitle}
            </h2>
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
                    onClick={() => {
                      setSelected(method);
                      setError('');
                      setStep('form');
                    }}
                    className="w-full flex items-center px-5 py-4 space-x-4 hover:bg-slate-50 dark:bg-slate-900 active:bg-slate-100 dark:bg-slate-800 transition-colors"
                  >
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shadow-sm`}
                    >
                      {method.logo_url ? (
                        <img src={method.logo_url} alt={label} className="w-8 h-8 object-contain rounded-xl" />
                      ) : (
                        <span>{emoji}</span>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-black text-slate-800 dark:text-slate-100">{label}</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        Min: {method.min_withdrawal.toLocaleString('en-US')} ETB
                      </p>
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
