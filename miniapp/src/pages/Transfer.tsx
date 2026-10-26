import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, ArrowRightLeft, CheckCircle2, AlertCircle, Send, User, ShieldCheck,
  Play, ChevronLeft, ChevronRight, X, Sparkles, Volume2, VolumeX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface SupportVideo {
  id: string;
  category: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url?: string | null;
}

type Step = 'form' | 'confirm' | 'success' | 'error';

export default function Transfer() {
  const { user, fetchUser, language, setProfileOpen } = useGameStore();
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [recipientName, setRecipientName] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();

  // Transfer guidance video state
  const [transferVideos, setTransferVideos] = useState<SupportVideo[]>([]);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const inlineVideoRef = useRef<HTMLVideoElement>(null);
  const [showTransferPopup, setShowTransferPopup] = useState(false);
  const [isClosingTransferVideo, setIsClosingTransferVideo] = useState(false);
  const [highlightGuideBtn, setHighlightGuideBtn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Fetch transfer videos on mount
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const res = await fetch(`${API_URL}/player/support-videos?category=transfer`, {
          headers: { 'x-telegram-init-data': initData },
        });
        if (res.ok) {
          const vData = await res.json();
          const vids = vData.videos || [];
          setTransferVideos(vids);
          if (vids.length > 0 && vids[0].video_url) {
            const viewedKey = `transfer_video_viewed_${vids[0].id}`;
            const hasViewed = localStorage.getItem(viewedKey) || localStorage.getItem('transfer_guide_viewed_once');
            if (!hasViewed) {
              localStorage.setItem(viewedKey, 'true');
              localStorage.setItem('transfer_guide_viewed_once', 'true');
              setShowTransferPopup(true);
            }
          }
        }
      } catch { /* silent */ }
    };
    fetchVideos();
  }, []);

  // Auto-play with sound prioritized
  useEffect(() => {
    if (showTransferPopup && inlineVideoRef.current) {
      inlineVideoRef.current.muted = false;
      inlineVideoRef.current.volume = 1.0;
      setIsMuted(false);
      const p = inlineVideoRef.current.play();
      if (p !== undefined) {
        p.then(() => setIsMuted(false)).catch(() => {
          if (inlineVideoRef.current) {
            inlineVideoRef.current.muted = true;
            inlineVideoRef.current.play().catch(() => {});
          }
          const enableAudio = () => {
            if (inlineVideoRef.current) {
              inlineVideoRef.current.muted = false;
              inlineVideoRef.current.volume = 1.0;
              setIsMuted(false);
            }
          };
          window.addEventListener('touchstart', enableAudio, { once: true, passive: true });
          window.addEventListener('pointerdown', enableAudio, { once: true, passive: true });
          window.addEventListener('click', enableAudio, { once: true, passive: true });
        });
      }
    }
  }, [showTransferPopup]);

  const handleCloseTransferPopup = (_fromVideoEnd = false) => {
    if (inlineVideoRef.current) { try { inlineVideoRef.current.pause(); } catch (_) {} }
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
    setIsClosingTransferVideo(true);
    setTimeout(() => {
      setShowTransferPopup(false);
      setIsClosingTransferVideo(false);
      setHighlightGuideBtn(true);
      setTimeout(() => setHighlightGuideBtn(false), 5000);
    }, 280);
  };

  const toggleInlineSound = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (inlineVideoRef.current) {
      inlineVideoRef.current.muted = !inlineVideoRef.current.muted;
      setIsMuted(inlineVideoRef.current.muted);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('light');
    }
  };

  const openVideoModal = (index = 0) => {
    setActiveVideoIndex(index);
    setIsVideoModalOpen(true);
  };

  const closeVideoModal = () => {
    if (videoPlayerRef.current) videoPlayerRef.current.pause();
    setIsVideoModalOpen(false);
  };

  const nextVideo = () => {
    if (transferVideos.length <= 1) return;
    setActiveVideoIndex((prev) => (prev + 1) % transferVideos.length);
  };

  const prevVideo = () => {
    if (transferVideos.length <= 1) return;
    setActiveVideoIndex((prev) => (prev - 1 + transferVideos.length) % transferVideos.length);
  };

  const renderVideoModal = () => {
    if (!isVideoModalOpen) return null;
    const currentVid = transferVideos[activeVideoIndex];
    return (
      <div
        className="fixed inset-0 z-50 bg-white flex flex-col justify-between select-none animate-in fade-in duration-200"
        onClick={(e) => { if (e.target === e.currentTarget) closeVideoModal(); }}
      >
        {/* Top Bar - Clean White */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 z-20 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-amber-500 flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/30">
              <Play size={14} className="fill-white ml-0.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 truncate">
                {currentVid?.title || (language === 'am' ? 'እንዴት ማስተላለፍ ይቻላል' : 'How to Transfer')}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold truncate">
                {transferVideos.length > 1
                  ? `${language === 'am' ? 'ቪዲዮ' : 'Video'} ${activeVideoIndex + 1} / ${transferVideos.length}`
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
              {transferVideos.length > 1 && (
                <div className="flex items-center justify-center space-x-3 mt-3 shrink-0">
                  <button type="button" onClick={prevVideo} className="px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold border border-slate-200 transition-all flex items-center space-x-1">
                    <ChevronLeft size={14} /><span>{language === 'am' ? 'ቀዳሚ' : 'Prev'}</span>
                  </button>
                  <span className="text-xs text-slate-500 font-black px-2">{activeVideoIndex + 1} / {transferVideos.length}</span>
                  <button type="button" onClick={nextVideo} className="px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold border border-slate-200 transition-all flex items-center space-x-1">
                    <span>{language === 'am' ? 'ቀጣይ' : 'Next'}</span><ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 text-center max-w-sm mx-auto shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-400">
                <Play size={24} className="fill-indigo-300" />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-1">{language === 'am' ? 'የቪዲዮ መመሪያ በቅርቡ ይጫናል' : 'Video Guide Coming Soon'}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                {language === 'am' ? 'አድሚኑ አዲስ ቪዲዮ እያዘጋጀ ነው።' : 'The transfer video guide is being prepared.'}
              </p>
              <button type="button" onClick={closeVideoModal} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-amber-500 text-white font-black text-xs active:scale-95 transition-all shadow-md">
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
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500 hover:from-indigo-500 hover:to-amber-400 text-white font-black text-sm shadow-xl shadow-indigo-500/30 active:scale-95 transition-all border border-white/20 tracking-wide"
          >
            {language === 'am' ? 'ተረድቻለሁ • ገንዘብ ላስተላልፍ' : "Got it, Let's Transfer!"}
          </button>
        </div>
      </div>
    );
  };

  const handleBack = () => {
    navigate(-1);
    setTimeout(() => setProfileOpen(true), 50);
  };

  // Step 1: Validate input & lookup recipient, then show confirmation screen
  const handleInitiate = async () => {
    const amt = Number(amount);
    if (!recipientId.trim()) {
      setErrorMsg(language === 'am' ? 'እባክዎ የተጠቃሚ መለያ (ID) ያስገቡ።' : 'Please enter a Telegram ID.');
      return;
    }
    if (recipientId.trim() === user?.telegram_id) {
      setErrorMsg(language === 'am' ? 'ለራስዎ ማስተላለፍ አይችሉም።' : 'You cannot transfer to yourself.');
      return;
    }
    if (!amt || amt <= 0) {
      setErrorMsg(language === 'am' ? 'እባክዎ ትክክለኛ መጠን ያስገቡ።' : 'Please enter a valid amount.');
      return;
    }
    if (amt < 10) {
      setErrorMsg(language === 'am' ? 'አነስተኛ ማስተላለፊያ 10 ETB ነው።' : 'Minimum transfer is 10 ETB.');
      return;
    }
    if (amt > (user?.main_balance || 0)) {
      setErrorMsg(language === 'am' ? `በቂ ሂሳብ የለዎትም። ያለዎት ${user?.main_balance || 0} ETB ነው።` : `Insufficient main balance. You have ${user?.main_balance || 0} ETB.`);
      return;
    }

    setErrorMsg('');
    setLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/player/transfer/lookup?recipient_id=${encodeURIComponent(recipientId.trim())}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || (language === 'am' ? 'ተቀባይ አልተገኘም። እባክዎ መለያውን ያረጋግጡ።' : 'Recipient not found. Please check the ID.'));
      } else {
        setRecipientName(data.first_name);
        setRecipientUsername(data.username || '');
        setStep('confirm');
        if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('light');
      }
    } catch (err: any) {
      setErrorMsg(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Actually execute the transfer once user confirms
  const handleConfirm = async () => {
    const amt = Number(amount);
    setConfirming(true);
    setErrorMsg('');
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/player/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({ recipient_telegram_id: recipientId.trim(), amount: amt }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setErrorMsg(`Server error (${res.status}).`);
        setStep('form');
        setConfirming(false);
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Transfer failed.');
        setStep('form');
      } else {
        setRecipientName(data.recipient_name || recipientName);
        await fetchUser(); // refresh balance
        setStep('success');
        if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
      }
    } catch (err: any) {
      setErrorMsg(`Network error: ${err.message}`);
      setStep('form');
    } finally {
      setConfirming(false);
    }
  };

  // ─── CONFIRMATION SCREEN ──────────────────────────────────
  if (step === 'confirm') {
    const amt = Number(amount);
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-4 py-8 pb-24">
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-xl border border-gray-100 dark:border-slate-800 text-center w-full max-w-sm">
          {/* Top Badge */}
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-emerald-900/50">
            <ShieldCheck size={32} className="text-emerald-500" />
          </div>

          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-1">
            {t[language].transfer.confirmTitle || 'Confirm Transfer'}
          </h2>
          <p className="text-xs text-slate-400 font-medium mb-5 px-2">
            {t[language].transfer.confirmSubtitle || 'Please review transfer details before proceeding'}
          </p>

          {/* Amount Box */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 mb-4 shadow-sm border border-slate-700/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              {t[language].transfer.amountLabel}
            </p>
            <p className="text-3xl font-black text-emerald-400 tracking-tight">
              {amt.toLocaleString('en-US')} <span className="text-sm font-bold text-white">ETB</span>
            </p>
          </div>

          {/* Sender & Recipient Card */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 mb-5 border border-slate-100 dark:border-slate-800 text-left space-y-3">
            {/* Sender */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                {t[language].transfer.transferFrom || 'From'}:
              </span>
              <div className="text-right">
                <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                  {user?.first_name || 'You'}
                </p>
                {user?.username && (
                  <p className="text-[10px] text-slate-400 font-medium">@{user.username}</p>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-200/70 dark:bg-slate-700/70" />

            {/* Recipient */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                {t[language].transfer.transferTo || 'To'}:
              </span>
              <div className="text-right">
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {recipientName}
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {recipientUsername ? `@${recipientUsername}` : `ID: ${recipientId}`}
                </p>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mb-5 px-1 leading-relaxed">
            ⚠️ {t[language].transfer.cannotTransferSelf}
          </p>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white py-3.5 rounded-2xl font-black text-sm shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center space-x-2 disabled:bg-slate-200"
            >
              {confirming ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={16} />
                  <span>{t[language].transfer.confirmBtn || 'Confirm & Send'}</span>
                </>
              )}
            </button>
            <button
              onClick={() => { setStep('form'); setErrorMsg(''); }}
              disabled={confirming}
              className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-2xl font-bold text-xs transition-colors"
            >
              {t[language].transfer.cancelBtn || 'Cancel / Edit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── SUCCESS SCREEN ───────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-6 pb-24">
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-gray-100 dark:border-slate-800 text-center w-full max-w-sm">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">
            {t[language].transfer.successTitle}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            <span className="font-bold text-slate-700 dark:text-slate-200">{Number(amount).toLocaleString('en-US')} ETB</span> {language === 'am' ? 'በተሳካ ሁኔታ ለ' : 'transferred to'} <span className="font-bold text-slate-700 dark:text-slate-200">{recipientName}</span> {language === 'am' ? 'ተላልፏል' : ''}.
          </p>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4 mb-6 text-left border border-emerald-100 dark:border-emerald-900/40">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">{language === 'am' ? 'አዲስ ሂሳብ' : 'New Balance'}</p>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{(user?.main_balance || 0).toLocaleString('en-US')} <span className="text-xs">ETB</span></p>
          </div>
          <button
            onClick={() => { setStep('form'); setRecipientId(''); setAmount(''); }}
            className="w-full bg-slate-800 dark:bg-slate-700 text-white py-3.5 rounded-2xl font-black text-sm mb-3"
          >
            {language === 'am' ? 'ሌላ ያስተላልፉ' : 'Send Another Transfer'}
          </button>
          <button onClick={handleBack} className="w-full text-slate-400 text-sm font-semibold py-2">
            {language === 'am' ? 'ወደ ፕሮፋይል ተመለስ' : 'Back to Profile'}
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN FORM ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pb-24 relative">
      {renderVideoModal()}

      {/* HEADER */}
      <div className="bg-white dark:bg-slate-900 px-4 py-3 shadow-sm border-b border-gray-100 dark:border-slate-800 flex items-center justify-between sticky top-0 z-30 h-[60px]">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 active:scale-95 transition-all shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight truncate">{t[language].transfer.transferTitle}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{t[language].transfer.transferSubtitle}</p>
          </div>
        </div>

        {/* Video Guide Button */}
        <div className="relative shrink-0 ml-2">
          {highlightGuideBtn && (
            <div className="absolute -bottom-8 right-0 z-40 whitespace-nowrap bg-gradient-to-r from-indigo-600 via-purple-500 to-amber-500 text-white text-[9.5px] font-black px-2.5 py-0.5 rounded-full shadow-lg shadow-indigo-500/50 flex items-center space-x-1 animate-bounce">
              <Sparkles size={10} className="text-amber-300" />
              <span>Rewatch guide here!</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => openVideoModal(0)}
            className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 via-purple-500 to-amber-500 hover:from-indigo-500 hover:to-amber-400 text-white shadow-md shadow-indigo-500/25 active:scale-95 transition-all text-xs font-black border border-white/20 ${
              highlightGuideBtn ? 'ring-4 ring-indigo-500 ring-offset-2 scale-105 shadow-xl shadow-indigo-500/40 animate-pulse' : ''
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

      {/* ONE-TIME FULLSCREEN VIDEO POPUP */}
      {showTransferPopup && transferVideos.length > 0 && (
        <div
          style={{
            top: '60px',
            bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
          }}
          className={`fixed inset-x-0 z-30 bg-white flex flex-col justify-between overflow-hidden shadow-xl transition-all duration-300 ${
            isClosingTransferVideo ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
          }`}
          onClick={() => handleCloseTransferPopup(false)}
        >
          {/* Sound Toggle & Close */}
          <div className="p-3 pb-1.5 flex items-center justify-between shrink-0 bg-white border-b border-slate-100/80 z-20">
            <button
              type="button"
              onClick={toggleInlineSound}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shadow-md border transition-all active:scale-95 ${
                isMuted
                  ? 'bg-rose-500 text-white border-rose-400'
                  : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
              }`}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{isMuted ? (language === 'am' ? 'ድምጽ አጥፋ' : 'Sound OFF') : (language === 'am' ? 'ድምጽ በርቷል 🔊' : 'Sound ON 🔊')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCloseTransferPopup(false)}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center shadow-sm border border-slate-200 transition-all"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Video */}
          <div
            className="flex-1 min-h-0 relative w-full flex items-center justify-center bg-white overflow-hidden p-2"
            onClick={(e) => {
              e.stopPropagation();
              if (inlineVideoRef.current && inlineVideoRef.current.muted) {
                inlineVideoRef.current.muted = false;
                inlineVideoRef.current.volume = 1.0;
                setIsMuted(false);
              }
            }}
          >
            <video
              ref={inlineVideoRef}
              src={transferVideos[0].video_url}
              poster={transferVideos[0].thumbnail_url || undefined}
              controls playsInline autoPlay
              onEnded={() => handleCloseTransferPopup(true)}
              className="w-full h-full max-h-full object-contain bg-white rounded-xl"
            >
              Your browser does not support video playback.
            </video>
          </div>

          {/* Action Button */}
          <div
            className="p-3.5 bg-white/95 backdrop-blur-md border-t border-slate-100 flex flex-col items-center justify-center shrink-0 z-20 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleCloseTransferPopup(false)}
              className="w-full max-w-sm py-3.5 px-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500 hover:from-indigo-500 hover:to-amber-400 active:scale-95 text-white font-black text-sm sm:text-base rounded-2xl shadow-xl shadow-indigo-500/35 transition-all flex items-center justify-center border border-white/25 tracking-wide ring-2 ring-indigo-500/20"
            >
              <span>{language === 'am' ? 'ተረድቻለሁ • ገንዘብ ላስተላልፍ' : "Got it, Let's Transfer!"}</span>
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-5 flex flex-col space-y-4">

        {/* BALANCE CARD */}
        <div className="bg-slate-900 rounded-[1.5rem] p-5 flex justify-between items-center shadow-sm">
          <div>
            <p className="text-white/50 text-xs font-semibold mb-1">{t[language].transfer.yourMainBalance}</p>
            <p className="text-3xl font-black text-white">{(user?.main_balance || 0).toLocaleString('en-US')} <span className="text-sm">ETB</span></p>
          </div>
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
            <User size={24} className="text-white/70" />
          </div>
        </div>

        {/* RECIPIENT INPUT */}
        <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-5 shadow-sm border border-gray-100 dark:border-slate-800 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t[language].transfer.userIdLabel}</label>
            <input
              type="number"
              inputMode="numeric"
              placeholder={t[language].transfer.userIdPlaceholder}
              value={recipientId}
              onChange={e => { setRecipientId(e.target.value); setErrorMsg(''); setStep('form'); }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 font-bold text-base focus:outline-none focus:border-emerald-400 transition-colors"
            />
            <p className="text-[10px] text-slate-400 font-medium mt-2 ml-1">
              📌 Ask the recipient to copy their ID from their Profile sidebar
            </p>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t[language].transfer.amountLabel}</label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                placeholder="Enter amount (Min 10)"
                value={amount}
                onChange={e => { setAmount(e.target.value); setErrorMsg(''); setStep('form'); }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-16 text-slate-800 dark:text-slate-100 font-bold text-base focus:outline-none focus:border-emerald-400 transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">ETB</span>
            </div>
          </div>
        </div>

        {/* ERROR */}
        {errorMsg && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-4 flex items-start space-x-3">
            <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{errorMsg}</p>
          </div>
        )}

        {/* SUBMIT BUTTON */}
        <button
          onClick={handleInitiate}
          disabled={loading || !recipientId || !amount}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white py-4 rounded-2xl font-black text-base shadow-sm transition-colors flex items-center justify-center space-x-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Send size={18} />
              <span>{t[language].transfer.transferBtn}</span>
            </>
          )}
        </button>

        <p className="text-center text-[10px] text-slate-400 font-semibold">
          ⚠️ {t[language].transfer.cannotTransferSelf}
        </p>
      </div>
    </div>
  );
}
