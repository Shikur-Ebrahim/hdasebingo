import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Play, X, ChevronLeft, ChevronRight } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export type VideoCategory = 'deposit' | 'withdraw' | 'transfer' | 'invite' | 'how_to_use' | 'how_to_play';

interface SupportVideo {
  id: string;
  category: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url?: string | null;
}

interface VideoGuideButtonProps {
  category: VideoCategory;
  buttonLabel?: string;
  className?: string;
  compact?: boolean;
}

const CATEGORY_META: Record<VideoCategory, {
  enTitle: string;
  amTitle: string;
  enLabel: string;
  amLabel: string;
  gradient: string;
  shadow: string;
  badgeBg: string;
  badgeText: string;
  emoji: string;
}> = {
  deposit: {
    enTitle: 'How to Deposit',
    amTitle: 'እንዴት ማስገባት ይቻላል?',
    enLabel: 'Video Guide',
    amLabel: 'የቪዲዮ መመሪያ',
    gradient: 'from-red-600 via-rose-500 to-amber-500 hover:from-red-500 hover:to-amber-400',
    shadow: 'shadow-red-500/25',
    badgeBg: 'bg-red-500/20 border-red-500/40',
    badgeText: 'text-red-400',
    emoji: '💰',
  },
  withdraw: {
    enTitle: 'How to Withdraw',
    amTitle: 'እንዴት ማውጣት ይቻላል?',
    enLabel: 'Video Guide',
    amLabel: 'የቪዲዮ መመሪያ',
    gradient: 'from-rose-600 via-pink-500 to-amber-500 hover:from-rose-500 hover:to-amber-400',
    shadow: 'shadow-rose-500/25',
    badgeBg: 'bg-rose-500/20 border-rose-500/40',
    badgeText: 'text-rose-400',
    emoji: '💸',
  },
  transfer: {
    enTitle: 'How to Transfer',
    amTitle: 'እንዴት ማስተላለፍ ይቻላል?',
    enLabel: 'Video Guide',
    amLabel: 'የቪዲዮ መመሪያ',
    gradient: 'from-indigo-600 via-purple-500 to-amber-500 hover:from-indigo-500 hover:to-amber-400',
    shadow: 'shadow-indigo-500/25',
    badgeBg: 'bg-indigo-500/20 border-indigo-500/40',
    badgeText: 'text-indigo-400',
    emoji: '🔄',
  },
  invite: {
    enTitle: 'How to Invite Friends',
    amTitle: 'እንዴት መጋበዝ ይቻላል?',
    enLabel: 'Video Guide',
    amLabel: 'የቪዲዮ መመሪያ',
    gradient: 'from-purple-600 via-violet-500 to-amber-500 hover:from-purple-500 hover:to-amber-400',
    shadow: 'shadow-purple-500/25',
    badgeBg: 'bg-purple-500/20 border-purple-500/40',
    badgeText: 'text-purple-400',
    emoji: '🤝',
  },
  how_to_use: {
    enTitle: 'How to Use App',
    amTitle: 'የአጠቃቀም ቪዲዮ መመሪያ',
    enLabel: 'Video Guide',
    amLabel: 'የቪዲዮ መመሪያ',
    gradient: 'from-blue-600 via-indigo-500 to-amber-500 hover:from-blue-500 hover:to-amber-400',
    shadow: 'shadow-blue-500/25',
    badgeBg: 'bg-blue-500/20 border-blue-500/40',
    badgeText: 'text-blue-400',
    emoji: '📱',
  },
  how_to_play: {
    enTitle: 'How to Play Bingo',
    amTitle: 'የአጨዋወት ቪዲዮ መመሪያ',
    enLabel: 'Video Guide',
    amLabel: 'የቪዲዮ መመሪያ',
    gradient: 'from-emerald-600 via-teal-500 to-amber-500 hover:from-emerald-500 hover:to-amber-400',
    shadow: 'shadow-emerald-500/25',
    badgeBg: 'bg-emerald-500/20 border-emerald-500/40',
    badgeText: 'text-emerald-400',
    emoji: '🎮',
  },
};

export default function VideoGuideButton({
  category,
  buttonLabel,
  className = '',
  compact = false,
}: VideoGuideButtonProps) {
  const { language } = useGameStore();
  const [videos, setVideos] = useState<SupportVideo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const meta = CATEGORY_META[category] || CATEGORY_META.deposit;

  useEffect(() => {
    let isMounted = true;
    const fetchCategoryVideos = async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const res = await fetch(`${API_URL}/player/support-videos?category=${category}`, {
          headers: { 'x-telegram-init-data': initData },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setVideos(data.videos || []);
          }
        }
      } catch (err) {
        console.error(`Failed to load ${category} videos:`, err);
      }
    };

    fetchCategoryVideos();
    return () => {
      isMounted = false;
    };
  }, [category]);

  const openModal = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
      WebApp.HapticFeedback.impactOccurred('light');
    }
    setActiveVideoIndex(0);
    setIsOpen(true);
  };

  const closeModal = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsOpen(false);
  };

  const nextVideo = () => {
    if (videos.length <= 1) return;
    setActiveVideoIndex((prev) => (prev + 1) % videos.length);
  };

  const prevVideo = () => {
    if (videos.length <= 1) return;
    setActiveVideoIndex((prev) => (prev - 1 + videos.length) % videos.length);
  };

  const currentVid = videos[activeVideoIndex];
  const displayLabel = buttonLabel || (language === 'am' ? meta.amLabel : meta.enLabel);
  const displayTitle = currentVid?.title || (language === 'am' ? meta.amTitle : meta.enTitle);

  const modalContent = isOpen ? (
    <div
      className="fixed inset-0 z-[9999] bg-white flex flex-col justify-between select-none animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      {/* Top Bar - Clean White */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 z-20 shrink-0">
        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-md ${meta.badgeBg} ${meta.badgeText}`}>
            <Play size={14} className="fill-current ml-0.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-800 truncate">
              {displayTitle}
            </p>
            <p className="text-[10px] text-slate-400 font-semibold truncate">
              {videos.length > 1
                ? `${language === 'am' ? 'ቪዲዮ' : 'Video'} ${activeVideoIndex + 1} / ${videos.length}`
                : `${meta.emoji} ${language === 'am' ? meta.amTitle : meta.enTitle}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={closeModal}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-90 transition-all shrink-0 border border-slate-200"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Video Viewport / Fallback */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center bg-white overflow-hidden p-3">
        {currentVid ? (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <video
              ref={videoRef}
              key={currentVid.id}
              src={currentVid.video_url}
              poster={currentVid.thumbnail_url || undefined}
              controls
              autoPlay
              playsInline
              className="w-full max-h-full rounded-2xl shadow-lg bg-white border border-slate-100 object-contain"
            >
              Your browser does not support video playback.
            </video>

            {/* Multiple videos prev/next */}
            {videos.length > 1 && (
              <div className="flex items-center justify-center space-x-3 mt-3 shrink-0">
                <button
                  type="button"
                  onClick={prevVideo}
                  className="px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold border border-slate-200 transition-all flex items-center space-x-1"
                >
                  <ChevronLeft size={14} />
                  <span>{language === 'am' ? 'ቀዳሚ' : 'Previous'}</span>
                </button>
                <span className="text-xs text-slate-500 font-black px-2">
                  {activeVideoIndex + 1} / {videos.length}
                </span>
                <button
                  type="button"
                  onClick={nextVideo}
                  className="px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold border border-slate-200 transition-all flex items-center space-x-1"
                >
                  <span>{language === 'am' ? 'ቀጣይ' : 'Next'}</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-100 rounded-3xl p-6 text-center max-w-sm mx-auto shadow-sm">
            <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto mb-3 ${meta.badgeBg} ${meta.badgeText}`}>
              <Play size={24} className="fill-current/30" />
            </div>
            <h3 className="text-base font-black text-slate-800 mb-1">
              {language === 'am' ? 'የቪዲዮ መመሪያ በቅርቡ ይጫናል' : 'Video Guide Coming Soon'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              {language === 'am'
                ? `አድሚኑ አዲስ የ${meta.amTitle} ቪዲዮ እያዘጋጀ ነው። እባክዎ በገጹ ላይ ያሉትን መመሪያዎች ይከተሉ።`
                : `Our team is updating the video guide for ${meta.enTitle.toLowerCase()}. Please follow the on-screen steps or contact support.`}
            </p>
            <button
              type="button"
              onClick={closeModal}
              className={`w-full py-2.5 rounded-xl bg-gradient-to-r ${meta.gradient} text-white font-black text-xs active:scale-95 transition-all shadow-md`}
            >
              {language === 'am' ? 'እሺ ተረድቻለሁ' : 'Got It'}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Description & Close Action */}
      <div className="p-4 bg-white border-t border-slate-100 z-20 space-y-2 shrink-0">
        {currentVid?.description && (
          <p className="text-xs text-slate-500 font-medium text-center line-clamp-2">
            {currentVid.description}
          </p>
        )}
        <button
          type="button"
          onClick={closeModal}
          className={`w-full py-3.5 rounded-2xl bg-gradient-to-r ${meta.gradient} text-white font-black text-sm shadow-xl active:scale-95 transition-all border border-white/20 tracking-wide text-center`}
        >
          {language === 'am' ? 'ተረድቻለሁ' : 'I Understand • Continue'}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`relative flex items-center space-x-1.5 rounded-full bg-gradient-to-r ${meta.gradient} text-white shadow-md ${meta.shadow} active:scale-95 transition-all text-xs font-black border border-white/20 shrink-0 ${
          compact ? 'px-2.5 py-1' : 'px-3 py-1.5'
        } ${className}`}
      >
        <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-white">
          <Play size={9} className="fill-white ml-0.5" />
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-40 duration-1000" />
        </span>
        <span className="text-[11px] font-black tracking-wide whitespace-nowrap">
          {displayLabel}
        </span>
      </button>

      {modalContent && typeof document !== 'undefined' && createPortal(modalContent, document.body)}
    </>
  );
}
