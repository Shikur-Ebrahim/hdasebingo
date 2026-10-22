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
  CreditCard,
  Smartphone,
  X,
  Sparkles,
  ShieldCheck,
  Info,
  Wallet,
  Landmark,
  Check,
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
  if (!settings || !settings.enabled || settings.is_exempt || amount <= 0) {
    return { feePercent: 0, feeAmount: 0, netAmount: amount };
  }
  let pct = settings.tier3_fee;
  if (amount <= settings.tier1_max) {
    pct = settings.tier1_fee;
  } else if (amount <= settings.tier2_max) {
    pct = settings.tier2_fee;
  }
  const feeAmount = Math.round(((amount * pct) / 100) * 100) / 100;
  return {
    feePercent: pct,
    feeAmount,
    netAmount: Math.max(0, Math.round((amount - feeAmount) * 100) / 100),
  };
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
  cbe: 'from-amber-500 to-yellow-600',
  boa: 'from-blue-600 to-indigo-700',
  telebirr: 'from-purple-600 to-pink-600',
  mpesa: 'from-emerald-500 to-green-700',
  cbebirr: 'from-yellow-500 to-amber-700',
  ebirr: 'from-orange-500 to-amber-600',
  awash: 'from-blue-500 to-slate-700',
  dashen: 'from-blue-700 to-sky-900',
  amhara: 'from-teal-600 to-emerald-800',
  coop: 'from-indigo-600 to-blue-800',
  amole: 'from-red-500 to-rose-700',
  hello_cash: 'from-emerald-400 to-teal-600',
  nib: 'from-purple-500 to-indigo-700',
  wegagen: 'from-slate-700 to-gray-900',
  zemen: 'from-orange-500 to-amber-700',
  oromia: 'from-teal-500 to-emerald-700',
  hibret: 'from-yellow-600 to-amber-800',
};

const typeEmoji: Record<string, string> = {
  cbe: '🏦',
  boa: '🏛️',
  telebirr: '📱',
  mpesa: '💚',
  cbebirr: '💳',
  ebirr: '📱',
  awash: '🏦',
  dashen: '🏦',
};

const isMobileWallet = (type: string) => {
  const t = (type || '').toLowerCase();
  return (
    t === 'telebirr' ||
    t === 'mpesa' ||
    t === 'cbebirr' ||
    t === 'ebirr' ||
    t === 'amole' ||
    t === 'hello_cash'
  );
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

  // Fee settings & Fee modal state
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

  // Auto-dismiss success notification after 1.5 seconds
  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => {
        navigate('/');
      }, 1500);
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
          user_role: raw.user_role || s.user_role || 'user',
          is_exempt: Boolean(raw.is_exempt ?? s.is_exempt ?? false),
        });
      }
    } catch (err) {
      console.error('Error fetching withdrawal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAmount = (add: number) => {
    const current = parseFloat(amount) || 0;
    const next = Math.min(userBalance, current + add);
    setAmount(String(next));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError('');

    const amt = parseFloat(amount);
    if (!amount || amount.trim() === '' || isNaN(amt) || amt <= 0) {
      setError(language === 'am' ? 'እባክዎ ትክክለኛ የማውጫ መጠን ያስገቡ።' : 'Please enter a valid withdrawal amount.');
      return;
    }
    if (amt < selected.min_withdrawal) {
      setError(
        language === 'am'
          ? `ለዚህ መንገድ አነስተኛው ማውጫ ${selected.min_withdrawal.toLocaleString('en-US')} ETB ነው`
          : `Minimum withdrawal for this method is ${selected.min_withdrawal.toLocaleString('en-US')} ETB`
      );
      return;
    }
    if (amt > userBalance) {
      setError(
        language === 'am'
          ? `በቂ ሂሳብ የለዎትም። ያለዎት ሂሳብ ${userBalance.toLocaleString('en-US')} ETB ነው`
          : `Insufficient balance. Your balance is ${userBalance.toLocaleString('en-US')} ETB`
      );
      return;
    }
    if (!accountName.trim()) {
      setError(language === 'am' ? 'እባክዎ ሙሉ ስምዎን ያስገቡ።' : 'Please enter your full name.');
      return;
    }

    const cleanAccNum = accountNumber.trim().replace(/\D/g, '');
    if (!cleanAccNum) {
      setError(
        language === 'am'
          ? 'እባክዎ የአካውንት ወይም ስልክ ቁጥር ያስገቡ (ቁጥሮች ብቻ)።'
          : 'Please enter your account or phone number (numbers only).'
      );
      return;
    }
    if (cleanAccNum.length < 4) {
      setError(
        language === 'am'
          ? 'እባክዎ ትክክለኛ ቁጥር ያስገቡ።'
          : 'Please enter a valid account number.'
      );
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

  // ── RENDER FEE MODAL ──────────────────────────────────────────────────────
  const renderFeeModal = () => {
    if (!showFeeModal) return null;
    const isExempt = feeSettings?.is_exempt;
    const isEnabled = feeSettings?.enabled ?? true;

    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 text-white shadow-2xl relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-blue-500/15 rounded-full blur-2xl pointer-events-none" />

          {/* Modal Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                <Percent size={18} className="text-slate-950 font-black" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  {language === 'am' ? 'የአገልግሎት ክፍያ ተመን' : 'Withdrawal Fee Rates'}
                </h3>
                <p className="text-[11px] text-slate-400 font-medium">
                  {language === 'am' ? 'ኦፊሴላዊ የተመን መመሪያ' : 'Official fee tier schedule'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowFeeModal(false)}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Status Badge */}
          <div className="mt-4">
            {isExempt ? (
              <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-3.5 flex items-start space-x-2.5">
                <Sparkles size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-emerald-300">
                    {language === 'am' ? '⭐ ከክፍያ ነፃ (0% Fee Exemption)' : '⭐ 0% Fee Exemption Active!'}
                  </p>
                  <p className="text-[11px] text-emerald-400/90 font-medium mt-0.5 leading-relaxed">
                    {language === 'am'
                      ? 'የኤጀንት ወይም የፕሮሞተር አካውንት ስላለዎት ምንም አይነት የአገልግሎት ክፍያ አይቆረጥብዎትም።'
                      : 'Agents and Promoters enjoy 0% withdrawal fees on all cashout requests.'}
                  </p>
                </div>
              </div>
            ) : !isEnabled ? (
              <div className="bg-blue-950/60 border border-blue-500/40 rounded-2xl p-3.5 flex items-start space-x-2.5">
                <CheckCircle2 size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-blue-300">
                    {language === 'am' ? 'የአገልግሎት ክፍያ በጊዜያዊነት 0% ነው' : '0% Fee (Currently Free)'}
                  </p>
                  <p className="text-[11px] text-blue-400/90 font-medium mt-0.5">
                    {language === 'am'
                      ? 'በአሁኑ ሰዓት ማውጫ ላይ ምንም አይነት ክፍያ አይቆረጥም።'
                      : 'Withdrawals are currently free for all players.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck size={16} className="text-amber-400" />
                  <span className="text-xs font-bold text-slate-300">
                    {language === 'am' ? 'መደበኛ ተመን (ደረጃ በደረጃ)' : 'Standard Dynamic Tier System'}
                  </span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md">
                  Active
                </span>
              </div>
            )}
          </div>

          {/* Tier Cards */}
          <div className="mt-3.5 space-y-2.5">
            {/* Tier 1 */}
            <div className="bg-slate-800/60 border border-slate-750 hover:border-slate-700 rounded-2xl p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <p className="text-xs font-bold text-white">
                    {language === 'am' ? 'ደረጃ 1: እስከ' : 'Tier 1: Up to'} {feeSettings?.tier1_max?.toLocaleString() || '2,000'} ETB
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 pl-3.5">
                  {language === 'am'
                    ? `ለምሳሌ 1,000 ETB ላይ ${((1000 * (feeSettings?.tier1_fee || 3)) / 100).toFixed(0)} ETB ይቆረጣል`
                    : `e.g. 1,000 ETB fee = ${((1000 * (feeSettings?.tier1_fee || 3)) / 100).toFixed(0)} ETB`}
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-amber-400">
                  {feeSettings?.tier1_fee ?? 3}%
                </span>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Fee</p>
              </div>
            </div>

            {/* Tier 2 */}
            <div className="bg-slate-800/60 border border-slate-750 hover:border-slate-700 rounded-2xl p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <p className="text-xs font-bold text-white">
                    {((feeSettings?.tier1_max || 2000) + 1).toLocaleString()} – {feeSettings?.tier2_max?.toLocaleString() || '10,000'} ETB
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 pl-3.5">
                  {language === 'am'
                    ? `ለምሳሌ 5,000 ETB ላይ ${((5000 * (feeSettings?.tier2_fee || 2)) / 100).toFixed(0)} ETB ይቆረጣል`
                    : `e.g. 5,000 ETB fee = ${((5000 * (feeSettings?.tier2_fee || 2)) / 100).toFixed(0)} ETB`}
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-blue-400">
                  {feeSettings?.tier2_fee ?? 2}%
                </span>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Fee</p>
              </div>
            </div>

            {/* Tier 3 */}
            <div className="bg-slate-800/60 border border-slate-750 hover:border-slate-700 rounded-2xl p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <p className="text-xs font-bold text-white">
                    {language === 'am' ? 'ከ' : 'Above'} {feeSettings?.tier2_max?.toLocaleString() || '10,000'} ETB {language === 'am' ? 'በላይ' : ''}
                  </p>
                </div>
                <p className="text-[11px] text-emerald-400/90 font-medium mt-0.5 pl-3.5">
                  {language === 'am' ? '⚡ አነስተኛው የአገልግሎት ክፍያ!' : '⚡ Lowest service fee rate!'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-emerald-400">
                  {feeSettings?.tier3_fee ?? 1}%
                </span>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Fee</p>
              </div>
            </div>
          </div>

          {/* Explanation Footer */}
          <div className="mt-4 p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            <div className="flex items-center space-x-1.5 text-slate-300 font-bold mb-1">
              <Info size={13} className="text-amber-400" />
              <span>{language === 'am' ? 'ግልጽ አሰራር' : 'Transparent Payouts'}</span>
            </div>
            {language === 'am'
              ? 'የአገልግሎት ክፍያው በቀጥታ ከጠየቁት ገንዘብ ላይ ይቀነሳል። የሚደርስዎ ትክክለኛ ሂሳብ ቅጹ ላይ በቀጥታ ይታያል።'
              : 'The fee is automatically deducted from your cashout amount. The exact net payout is displayed live before you submit.'}
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={() => setShowFeeModal(false)}
            className="mt-4 w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm active:scale-95 transition-all shadow-lg shadow-amber-500/20"
          >
            {language === 'am' ? 'ተረድቻለሁ' : 'Got It'}
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium text-sm">
            {language === 'am' ? 'እባክዎ ይጠብቁ...' : 'Loading withdrawal...'}
          </p>
        </div>
      </div>
    );
  }

  // ── STEP: PENDING STATUS ──────────────────────────────────────────────────
  if (step === 'pending_status') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        {renderFeeModal()}
        <div className="bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-800 p-7 text-center relative overflow-hidden">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-amber-500/20">
            <Clock size={38} className="text-amber-400" />
          </div>
          <h2 className="text-2xl font-black text-white">
            {t[language].withdraw.alreadyPendingTitle}
          </h2>
          <p className="text-slate-400 font-medium mt-2 leading-relaxed text-sm">
            {t[language].withdraw.alreadyPendingDesc.split('{amount}')[0]}
            <span className="font-black text-amber-400 text-base">
              {pendingAmount?.toLocaleString('en-US')} ETB
            </span>
            {t[language].withdraw.alreadyPendingDesc.split('{amount}')[1]}
          </p>

          <div className="mt-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
            <p className="text-xs text-amber-300 font-semibold text-center leading-relaxed">
              {t[language].withdraw.waitAdmin}
            </p>
          </div>

          {supportContact && (
            <a
              href={`https://t.me/${supportContact.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center space-x-2 text-white font-black text-sm bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all py-3.5 rounded-2xl w-full shadow-lg shadow-blue-600/30"
            >
              <MessageCircle size={18} />
              <span>{t[language].withdraw.contactSupport}</span>
            </a>
          )}

          <Link
            to="/"
            className="mt-3 block w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-black py-3.5 rounded-2xl text-center transition-all active:scale-95 border border-slate-700"
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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-800 p-8 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-emerald-500/20">
            <CheckCircle2 size={42} className="text-emerald-400" />
          </div>
          <h2 className="text-2xl font-black text-white">
            {t[language].withdraw.submitted}
          </h2>
          <p className="text-slate-400 font-medium mt-2 leading-relaxed text-sm">
            {t[language].withdraw.pendingReview.split('{amount}')[0]}
            <span className="font-black text-emerald-400 text-base">
              {parseFloat(amount || '0').toLocaleString('en-US')} ETB
            </span>
            {t[language].withdraw.pendingReview.split('{amount}')[1]}
          </p>

          <div className="mt-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
            <p className="text-xs text-emerald-300 font-semibold text-center leading-relaxed">
              {t[language].withdraw.willBeProcessed}
            </p>
          </div>

          <div className="mt-5 flex items-center justify-center space-x-2 text-xs font-semibold text-slate-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Redirecting...</span>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP: FORM ────────────────────────────────────────────────────────────
  if (step === 'form' && selected) {
    const gradient = typeColors[selected.type] || 'from-slate-700 to-slate-900';
    const isWallet = isMobileWallet(selected.type);
    const methodLabel = typeLabels[selected.type] || selected.type.toUpperCase();

    return (
      <div className="min-h-screen bg-slate-950 text-white pb-10">
        {renderFeeModal()}

        {/* Top Header */}
        <div className="relative overflow-hidden bg-slate-900 border-b border-slate-800/80 px-4 pt-5 pb-6">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Nav Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => setStep('list')}
                className="w-9 h-9 rounded-full bg-slate-800/90 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex items-center space-x-2">
                <span className="text-xl">{typeEmoji[selected.type] || (isWallet ? '📱' : '🏦')}</span>
                <span className="text-base font-black text-white truncate max-w-[140px]">
                  {methodLabel}
                </span>
              </div>
            </div>

            {/* Top Action Pills: Fee Info & Video Guide */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowFeeModal(true)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 active:scale-95 transition-all text-xs font-black shadow-sm"
              >
                <Percent size={12} className="text-amber-400" />
                <span>{language === 'am' ? 'የክፍያ ተመን' : 'Fee Info'}</span>
              </button>
              <VideoGuideButton category="withdraw" compact />
            </div>
          </div>

          {/* Balance Hero Card */}
          <div className="bg-gradient-to-br from-slate-800/90 via-slate-850 to-slate-900 rounded-3xl p-4 border border-slate-750 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5">
                  <Wallet size={13} className="text-amber-400" />
                  <span>{t[language].withdraw.balance}</span>
                </p>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-3xl font-black text-amber-400 tracking-tight">
                    {userBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm font-extrabold text-amber-300/80">ETB</span>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-[11px] font-black text-slate-300">
                  Min: {selected.min_withdrawal.toLocaleString('en-US')} ETB
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Withdrawal Form Card */}
        <form onSubmit={handleSubmit} className="px-4 mt-4 space-y-4 max-w-lg mx-auto">
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
            {error && (
              <div className="flex items-start space-x-2 bg-red-950/60 border border-red-500/40 rounded-2xl p-3.5 animate-in fade-in duration-150">
                <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-300 text-xs font-bold leading-relaxed">{error}</p>
              </div>
            )}

            {/* 1. Amount Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <span>{t[language].withdraw.amountLabel}</span>
                </label>
                {amount && (
                  <button
                    type="button"
                    onClick={() => setAmount('')}
                    className="text-[11px] font-bold text-slate-400 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400 font-black text-base">
                  ETB
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  min={selected.min_withdrawal}
                  max={userBalance}
                  className="w-full pl-16 pr-16 py-3.5 bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl focus:outline-none text-white font-black text-xl placeholder-slate-600 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(userBalance))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 font-black text-xs active:scale-95 transition-all"
                >
                  MAX
                </button>
              </div>

              {/* Quick Amount Presets */}
              <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
                {[100, 500, 1000, 5000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleAddAmount(val)}
                    className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-750 active:scale-95 border border-slate-700/80 rounded-xl text-xs font-black text-slate-300 hover:text-white transition-all text-center whitespace-nowrap"
                  >
                    +{val >= 1000 ? `${val / 1000}k` : val}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount(String(userBalance))}
                  className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 border border-amber-500/30 rounded-xl text-xs font-black text-amber-300 transition-all text-center whitespace-nowrap"
                >
                  MAX
                </button>
              </div>

              {/* Live Fee & Net Payout Breakdown */}
              {amtNum > 0 && (
                <div className="mt-3 bg-slate-950/80 border border-slate-850 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">
                      {language === 'am' ? 'የተጠየቀው መጠን' : 'Requested Cashout'}:
                    </span>
                    <span className="text-white font-bold">{amtNum.toLocaleString('en-US')} ETB</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-400/90 font-medium flex items-center space-x-1">
                      <Percent size={11} />
                      <span>
                        {language === 'am' ? 'የአገልግሎት ክፍያ' : 'Service Fee'} ({feeCalc.feePercent}%):
                      </span>
                    </span>
                    <span className="text-amber-400 font-bold">
                      {feeCalc.feeAmount > 0
                        ? `-${feeCalc.feeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`
                        : feeSettings?.is_exempt
                        ? '0 ETB (Exempt ⭐)'
                        : '0 ETB (Free)'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-400 flex items-center space-x-1">
                      <Check size={14} className="text-emerald-400" />
                      <span>{language === 'am' ? 'የሚደርስዎ ሂሳብ' : "You'll Receive"}:</span>
                    </span>
                    <span className="text-base font-black text-emerald-400">
                      {feeCalc.netAmount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      ETB
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Full Name Input */}
            <div>
              <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
                {t[language].withdraw.fullNameLabel}
              </label>
              <div className="relative">
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  placeholder={t[language].withdraw.fullNamePlaceholder}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl focus:outline-none text-white font-bold text-sm placeholder-slate-600 transition-all"
                  required
                />
              </div>
            </div>

            {/* 3. Account Number Input (Strictly Numbers Only) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  {isWallet ? (
                    <>
                      <Smartphone size={13} className="text-amber-400" />
                      <span>{t[language].withdraw.phoneLabel}</span>
                    </>
                  ) : (
                    <>
                      <CreditCard size={13} className="text-amber-400" />
                      <span>{t[language].withdraw.accNumberLabel}</span>
                    </>
                  )}
                </label>

                {accountNumber.length > 0 && (
                  <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                    {accountNumber.length} {language === 'am' ? 'ዲጂቶች' : 'digits'}
                  </span>
                )}
              </div>

              <div className="relative">
                {isWallet ? (
                  <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                ) : (
                  <CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                )}
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={accountNumber}
                  onChange={e => {
                    // Strictly numbers only
                    const numOnly = e.target.value.replace(/\D/g, '');
                    setAccountNumber(numOnly);
                  }}
                  placeholder={
                    isWallet
                      ? '09XXXXXXXX / 07XXXXXXXX'
                      : '1000... (Account Number)'
                  }
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-950 border-2 border-slate-800 focus:border-amber-400 rounded-2xl focus:outline-none text-white font-mono font-bold text-base placeholder-slate-600 transition-all tracking-wider"
                  required
                />
              </div>

              <div className="flex items-center justify-between mt-1 px-1">
                <p className="text-[11px] text-slate-500 font-medium">
                  {language === 'am' ? 'ቁጥሮች ብቻ ይፈቀዳሉ (0-9)' : 'Numbers only (0-9 accepted)'}
                </p>
                {accountNumber && !/^\d+$/.test(accountNumber) && (
                  <span className="text-[11px] font-bold text-red-400">
                    {language === 'am' ? 'ቁጥር ብቻ ያስገቡ' : 'Digits only'}
                  </span>
                )}
              </div>
            </div>

            {/* Info Notice Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-start space-x-2.5">
              <ShieldCheck size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                {t[language].withdraw.infoBox}
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !accountNumber || amtNum <= 0}
              className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 ${
                submitting || !accountNumber || amtNum <= 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                  : `bg-gradient-to-r ${gradient} text-white shadow-amber-500/20`
              }`}
            >
              {submitting ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t[language].withdraw.submitting}</span>
                </div>
              ) : amtNum > 0 ? (
                `${language === 'am' ? 'ገንዘብ አውጣ' : 'Withdraw'} ${amtNum.toLocaleString('en-US')} ETB → ${feeCalc.netAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`
              ) : (
                `${t[language].withdraw.title}`
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── STEP: LIST (SELECT METHOD) ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white pb-12">
      {renderFeeModal()}

      {/* Header */}
      <div className="relative overflow-hidden bg-slate-900 border-b border-slate-800/80 px-4 pt-5 pb-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Link
              to="/"
              className="w-9 h-9 rounded-full bg-slate-800/90 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all"
            >
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-xl font-black text-white tracking-tight">
              {t[language].withdraw.title}
            </h1>
          </div>

          {/* Top Actions: Fee Rates & Video Guide */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowFeeModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 hover:bg-amber-500/25 active:scale-95 transition-all text-xs font-black shadow-sm backdrop-blur-sm"
            >
              <Percent size={13} className="text-amber-400" />
              <span>{language === 'am' ? 'የክፍያ ተመን' : 'Fee Rates'}</span>
            </button>
            <VideoGuideButton category="withdraw" compact />
          </div>
        </div>

        {/* Balance Hero Card */}
        <div className="bg-gradient-to-br from-slate-800/90 via-slate-850 to-slate-900 rounded-3xl p-5 border border-slate-750 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5">
                <Wallet size={14} className="text-amber-400" />
                <span>{t[language].withdraw.balance}</span>
              </p>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-3xl font-black text-amber-400 tracking-tight">
                  {userBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-extrabold text-amber-300/80">ETB</span>
              </div>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-inner">
              <Sparkles size={22} className="text-amber-400" />
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-750/80 flex items-center justify-between text-xs text-slate-400">
            <span>
              {language === 'am' ? 'ዋናው ሂሳብ ብቻ ሊወጣ ይችላል' : 'Only main balance is withdrawable'}
            </span>
            <button
              type="button"
              onClick={() => setShowFeeModal(true)}
              className="text-amber-400 hover:text-amber-300 font-bold flex items-center space-x-1"
            >
              <span>{language === 'am' ? 'ተመን ይመልከቱ' : 'View Fee Tiers'}</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Methods Section */}
      <div className="px-4 mt-5 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider">
            {t[language].withdraw.methodTitle}
          </h2>
          <span className="text-[11px] font-bold text-slate-500">
            {methods.length} {language === 'am' ? 'መንገዶች' : 'methods'}
          </span>
        </div>

        {methods.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 flex flex-col items-center justify-center text-center">
            <AlertCircle size={40} className="text-slate-600 mb-3" />
            <p className="font-bold text-slate-300 text-sm">
              {language === 'am' ? 'የማውጫ መንገዶች አልተገኙም' : 'No withdrawal methods available'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {language === 'am' ? 'እባክዎ ቆየት ብለው ይሞክሩ' : 'Please check back in a few moments'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {methods.map(method => {
              const gradient = typeColors[method.type] || 'from-slate-700 to-slate-900';
              const emoji = typeEmoji[method.type] || (isMobileWallet(method.type) ? '📱' : '💳');
              const label = typeLabels[method.type] || method.type.toUpperCase();

              return (
                <button
                  key={method.id}
                  onClick={() => {
                    setSelected(method);
                    setError('');
                    setStep('form');
                  }}
                  className="w-full bg-slate-900/90 hover:bg-slate-850 active:scale-[0.98] border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 flex items-center space-x-3.5 transition-all shadow-md group"
                >
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shadow-md flex-shrink-0`}
                  >
                    {method.logo_url ? (
                      <img
                        src={method.logo_url}
                        alt={label}
                        className="w-8 h-8 object-contain rounded-xl"
                      />
                    ) : (
                      <span>{emoji}</span>
                    )}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <p className="font-black text-white text-sm group-hover:text-amber-400 transition-colors truncate">
                      {label}
                    </p>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-[11px] text-slate-400 font-medium">
                        Min: {method.min_withdrawal.toLocaleString('en-US')} ETB
                      </span>
                      <span className="w-1 h-1 rounded-full bg-slate-600" />
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                        ⚡ {language === 'am' ? 'ፈጣን' : 'Fast'}
                      </span>
                    </div>
                  </div>

                  <div className="w-8 h-8 rounded-full bg-slate-800 group-hover:bg-slate-750 flex items-center justify-center text-slate-400 group-hover:text-white transition-all">
                    <ChevronRight size={16} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
