import { useState, useEffect, useMemo, useRef } from 'react';
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
  Play,
  ChevronLeft,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';

interface SupportVideo {
  id: string;
  category: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url?: string | null;
}

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

  // How to Withdraw Video state
  const [withdrawVideos, setWithdrawVideos] = useState<SupportVideo[]>([]);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const inlineVideoRef = useRef<HTMLVideoElement>(null);
  const [showWithdrawPopup, setShowWithdrawPopup] = useState(false);
  const [isClosingWithdrawVideo, setIsClosingWithdrawVideo] = useState(false);
  const [highlightGuideBtn, setHighlightGuideBtn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

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

  const openVideoModal = (index = 0) => {
    setActiveVideoIndex(index);
    setIsVideoModalOpen(true);
  };

  const closeVideoModal = () => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.pause();
    }
    setIsVideoModalOpen(false);
  };

  const nextVideo = () => {
    if (withdrawVideos.length <= 1) return;
    setActiveVideoIndex((prev) => (prev + 1) % withdrawVideos.length);
  };

  const prevVideo = () => {
    if (withdrawVideos.length <= 1) return;
    setActiveVideoIndex((prev) => (prev - 1 + withdrawVideos.length) % withdrawVideos.length);
  };

  // Auto-play withdraw popup video on mount with sound prioritized
  useEffect(() => {
    if (showWithdrawPopup && inlineVideoRef.current) {
      inlineVideoRef.current.muted = false;
      const p = inlineVideoRef.current.play();
      if (p !== undefined) {
        p.then(() => {
          setIsMuted(false);
        }).catch(() => {
          if (inlineVideoRef.current) {
            inlineVideoRef.current.muted = true;
            setIsMuted(true);
            inlineVideoRef.current.play().catch(() => {});
          }
        });
      }
    }
  }, [showWithdrawPopup]);

  const handleCloseWithdrawPopup = (_fromVideoEnd = false) => {
    if (inlineVideoRef.current) {
      try { inlineVideoRef.current.pause(); } catch (_) {}
    }
    if (typeof WebApp !== 'undefined') {
      WebApp.HapticFeedback?.notificationOccurred('success');
    }
    setIsClosingWithdrawVideo(true);
    setTimeout(() => {
      setShowWithdrawPopup(false);
      setIsClosingWithdrawVideo(false);
      setHighlightGuideBtn(true);
      setTimeout(() => setHighlightGuideBtn(false), 5000);
    }, 280);
  };

  const toggleInlineSound = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (inlineVideoRef.current) {
      inlineVideoRef.current.muted = !inlineVideoRef.current.muted;
      setIsMuted(inlineVideoRef.current.muted);
      if (typeof WebApp !== 'undefined') {
        WebApp.HapticFeedback?.impactOccurred('light');
      }
    }
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
      const [methodsRes, historyRes, contactRes, feeRes, videosRes] = await Promise.all([
        fetch(`${API_URL}/withdraw/methods`, { headers }),
        fetch(`${API_URL}/withdraw/history`, { headers }),
        fetch(`${API_URL}/player/support-contact`, { headers }),
        fetch(`${API_URL}/withdraw/fee-settings`, { headers }),
        fetch(`${API_URL}/player/support-videos?category=withdraw`, { headers }),
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

      if (videosRes.ok) {
        const vData = await videosRes.json();
        const vids = vData.videos || [];
        setWithdrawVideos(vids);

        // One-time auto popup for withdrawal guidance
        if (vids.length > 0 && vids[0].video_url) {
          const firstVid = vids[0];
          const viewedKey = `withdraw_video_viewed_${firstVid.id}`;
          const hasViewed = localStorage.getItem(viewedKey) || localStorage.getItem('withdraw_guide_viewed_once');
          if (!hasViewed) {
            localStorage.setItem(viewedKey, 'true');
            localStorage.setItem('withdraw_guide_viewed_once', 'true');
            setShowWithdrawPopup(true);
          }
        }
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

  const renderVideoModal = () => {
    if (!isVideoModalOpen) return null;
    const currentVid = withdrawVideos[activeVideoIndex];

    return (
      <div
        className="fixed inset-0 z-50 bg-white flex flex-col justify-between select-none animate-in fade-in duration-200"
        onClick={(e) => { if (e.target === e.currentTarget) closeVideoModal(); }}
      >
        {/* Top Bar - Clean White */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 z-20 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shrink-0 shadow-md shadow-rose-500/30">
              <Play size={14} className="fill-white ml-0.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 truncate">
                {currentVid?.title || (language === 'am' ? 'የገንዘብ ማውጫ ቪዲዮ' : 'How to Withdraw')}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold truncate">
                {withdrawVideos.length > 1
                  ? `${language === 'am' ? 'ቪዲዮ' : 'Video'} ${activeVideoIndex + 1} / ${withdrawVideos.length}`
                  : (language === 'am' ? 'ኦፊሴላዊ የቪዲዮ መመሪያ' : 'Official Step-by-Step Guide')}
              </p>
            </div>
          </div>
          <button type="button" onClick={closeVideoModal} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-90 transition-all shrink-0 border border-slate-200">
            <X size={16} />
          </button>
        </div>

        {/* Video Player */}
        <div className="flex-1 min-h-0 relative flex items-center justify-center bg-white overflow-hidden p-3">
          {currentVid ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <video
                ref={videoPlayerRef}
                key={currentVid.id}
                src={currentVid.video_url}
                poster={currentVid.thumbnail_url || undefined}
                controls autoPlay playsInline
                className="w-full max-h-full rounded-2xl shadow-lg bg-white border border-slate-100 object-contain"
              >
                Your browser does not support video playback.
              </video>
              {withdrawVideos.length > 1 && (
                <div className="flex items-center justify-center space-x-3 mt-3 shrink-0">
                  <button type="button" onClick={prevVideo} className="px-4 py-1.5 rounded-full bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 text-xs font-bold transition-all flex items-center space-x-1">
                    <ChevronLeft size={14} /><span>{language === 'am' ? 'ቀዳሚ' : 'Prev'}</span>
                  </button>
                  <span className="text-xs text-slate-500 font-black px-2">{activeVideoIndex + 1} / {withdrawVideos.length}</span>
                  <button type="button" onClick={nextVideo} className="px-4 py-1.5 rounded-full bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 text-xs font-bold transition-all flex items-center space-x-1">
                    <span>{language === 'am' ? 'ቀጣይ' : 'Next'}</span><ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 text-center max-w-sm mx-auto shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto mb-3 text-rose-400">
                <Play size={24} className="fill-rose-300" />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-1">{language === 'am' ? 'የቪዲዮ መመሪያ በቅርቡ ይጫናል' : 'Video Guide Coming Soon'}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                {language === 'am' ? 'አድሚኑ አዲስ ቪዲዮ እያዘጋጀ ነው።' : 'The withdrawal video tutorial is being updated. Please follow on-screen instructions.'}
              </p>
              <button type="button" onClick={closeVideoModal} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black text-xs active:scale-95 transition-all shadow-md">
                {language === 'am' ? 'እሺ ተረድቻለሁ' : 'Got It'}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Action - Clean White */}
        <div className="p-4 bg-white border-t border-slate-100 z-20 space-y-2 shrink-0">
          {currentVid?.description && (
            <p className="text-xs text-slate-500 font-medium text-center line-clamp-2">{currentVid.description}</p>
          )}
          <button
            type="button"
            onClick={closeVideoModal}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-black text-sm shadow-xl shadow-rose-500/30 active:scale-95 transition-all border border-white/20 tracking-wide"
          >
            {language === 'am' ? 'ተረድቻለሁ • ገንዘብ ላውጣ' : "Got it, Let's Withdraw!"}
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

            {/* Top Right: Video Guide & Fee button */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowFeeModal(true)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-[11px] font-black backdrop-blur-sm transition-all active:scale-95 border border-white/20"
              >
                <Percent size={11} />
                <span>{language === 'am' ? 'ተመን' : 'Fees'}</span>
              </button>

              <button
                type="button"
                onClick={() => openVideoModal(0)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/25 hover:bg-white/35 text-white text-xs font-black backdrop-blur-sm transition-all active:scale-95 border border-white/30 shadow-sm"
              >
                <Play size={10} className="fill-white" />
                <span>{language === 'am' ? 'የቪዲዮ መመሪያ' : 'Video Guide'}</span>
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20 relative">
      {renderFeeModal()}
      {renderVideoModal()}

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30 h-[60px] shadow-md">
        <div className="flex items-center space-x-3 min-w-0">
          <Link to="/" className="text-white/80 hover:text-white p-1 shrink-0">
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-white leading-tight truncate">{t[language].withdraw.title}</h1>
            <p className="text-xs text-white/60 font-semibold truncate">
              {language === 'am' ? 'ዘዴ ይምረጡ' : 'Select a withdrawal method'}
            </p>
          </div>
        </div>

        {/* Video Guide Button */}
        <div className="relative shrink-0 ml-2">
          {highlightGuideBtn && (
            <div className="absolute -bottom-8 right-0 z-40 whitespace-nowrap bg-gradient-to-r from-rose-600 via-pink-500 to-amber-500 text-white text-[9.5px] font-black px-2.5 py-0.5 rounded-full shadow-lg shadow-rose-500/50 flex items-center space-x-1 animate-bounce">
              <Sparkles size={10} className="text-amber-300" />
              <span>Rewatch guide here!</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => openVideoModal(0)}
            className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-rose-600 via-pink-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-md shadow-rose-500/25 active:scale-95 transition-all text-xs font-black border border-white/20 ${
              highlightGuideBtn ? 'ring-4 ring-rose-500 ring-offset-2 scale-105 shadow-xl shadow-rose-500/40 animate-pulse' : ''
            }`}
          >
            <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-white">
              <Play size={9} className="fill-white ml-0.5" />
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-40 duration-1000" />
            </span>
            <span className="text-[11px] font-black tracking-wide whitespace-nowrap">
              {language === 'am' ? 'የቪዲዮ መመሪያ' : 'Video Guide'}
            </span>
          </button>
        </div>
      </div>

      {/* ONE-TIME FULLSCREEN VIDEO POPUP (CLEAN WHITE THEME - NEVER COVERS NAV BAR) */}
      {showWithdrawPopup && withdrawVideos.length > 0 && (
        <div
          style={{
            top: '60px',
            bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
          }}
          className={`fixed inset-x-0 z-30 bg-white flex flex-col justify-between overflow-hidden shadow-xl transition-all duration-300 ${
            isClosingWithdrawVideo ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
          }`}
          onClick={() => handleCloseWithdrawPopup(false)}
        >
          {/* Top Controls: Sound Toggle and Close Button */}
          <div className="p-3 pb-1.5 flex items-center justify-between shrink-0 bg-white border-b border-slate-100/80 z-20">
            <button
              type="button"
              onClick={toggleInlineSound}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shadow-md border transition-all active:scale-95 ${
                isMuted
                  ? 'bg-rose-500 text-white border-rose-400 animate-pulse ring-2 ring-rose-500/30'
                  : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
              }`}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{isMuted ? 'Sound OFF · Tap for Sound' : 'Sound ON'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleCloseWithdrawPopup(false)}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center shadow-sm border border-slate-200 transition-all"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Full Video Container */}
          <div
            className="flex-1 min-h-0 relative w-full flex items-center justify-center bg-white overflow-hidden p-2"
            onClick={(e) => { e.stopPropagation(); if (isMuted) toggleInlineSound(); }}
          >
            {isMuted && (
              <button
                type="button"
                onClick={toggleInlineSound}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-slate-900/90 hover:bg-black text-white px-5 py-3 rounded-2xl border border-white/20 backdrop-blur-md shadow-2xl flex items-center space-x-2 animate-bounce cursor-pointer active:scale-95"
              >
                <VolumeX size={20} className="text-rose-400" />
                <span className="font-black text-sm">Tap to Turn Sound ON 🔊</span>
              </button>
            )}
            <video
              ref={inlineVideoRef}
              src={withdrawVideos[0].video_url}
              poster={withdrawVideos[0].thumbnail_url || undefined}
              controls
              playsInline
              autoPlay
              onEnded={() => handleCloseWithdrawPopup(true)}
              className="w-full h-full max-h-full object-contain bg-white rounded-xl"
            >
              Your browser does not support video playback.
            </video>
          </div>

          {/* Centered Attractive Action Button - Always Visible Above Bottom Nav */}
          <div
            className="p-3.5 pb-3.5 bg-white/95 backdrop-blur-md border-t border-slate-100 flex flex-col items-center justify-center shrink-0 z-20 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleCloseWithdrawPopup(false)}
              className="w-full max-w-sm py-3.5 px-6 bg-gradient-to-r from-rose-600 via-pink-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 active:scale-95 text-white font-black text-sm sm:text-base rounded-2xl shadow-xl shadow-rose-500/35 transition-all flex items-center justify-center border border-white/25 tracking-wide ring-2 ring-rose-500/20"
            >
              <span>{language === 'am' ? 'ተረድቻለሁ • ገንዘብ ላውጣ' : "Got it, Let's Withdraw!"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Balance Card */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-3xl p-4 shadow-xl border border-white/5 flex items-center justify-between">
          <div>
            <p className="text-white/60 text-xs font-semibold">{t[language].withdraw.balance}</p>
            <p className="text-3xl font-black text-white mt-0.5">
              {userBalance.toLocaleString('en-US')} <span className="text-xl text-white/70">ETB</span>
            </p>
            <p className="text-white/40 text-[11px] mt-0.5">
              {language === 'am' ? 'ዋናው ሂሳብ ብቻ ሊወጣ ይችላል' : 'Only main balance can be withdrawn'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFeeModal(true)}
            className="flex flex-col items-center space-y-1 px-3 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold backdrop-blur-sm transition-all active:scale-95 border border-white/15"
          >
            <Percent size={18} className="text-amber-400" />
            <span className="text-[10px] text-white/70">{language === 'am' ? 'ክፍያ' : 'Fee Rates'}</span>
          </button>
        </div>
      </div>

      {/* Methods */}
      <div className="px-4 pt-2 pb-8">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-black text-slate-700 dark:text-slate-200 text-sm uppercase tracking-wider">
              {t[language].withdraw.methodTitle}
            </h2>
            <span className="text-xs text-slate-400 font-semibold">{methods.length} {language === 'am' ? 'ዘዴዎች' : 'methods'}</span>
          </div>

          {methods.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-400">
              <AlertCircle size={40} className="mb-3 opacity-50" />
              <p className="font-semibold">No withdrawal methods available</p>
              <p className="text-xs mt-1">Please check back later</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-slate-800">
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
                    className="w-full flex items-center px-5 py-4 space-x-4 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
                  >
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shadow-sm shrink-0`}
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
                    <ChevronRight size={18} className="text-slate-300 shrink-0" />
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
