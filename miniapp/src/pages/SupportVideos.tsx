import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Play, X, Loader2, Video as VideoIcon, Headphones, 
  ChevronUp, ChevronDown, MessageCircle, Phone, Copy, Check, Send 
} from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface SupportVideo {
  id: string;
  category: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
}

const CATEGORIES = [
  { id: 'how_to_play', label: 'How to Play',     emoji: '🎮', gradient: 'from-emerald-500 to-teal-600',   bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30',  text: 'text-emerald-700 dark:text-emerald-300' },
  { id: 'deposit',     label: 'Deposit',          emoji: '💰', gradient: 'from-yellow-400 to-amber-500',   bg: 'bg-yellow-50 dark:bg-amber-950/40 border-yellow-200 dark:border-amber-500/30',    text: 'text-yellow-700 dark:text-amber-300' },
  { id: 'withdraw',    label: 'Withdraw',         emoji: '💸', gradient: 'from-rose-500 to-pink-600',      bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/30',         text: 'text-rose-700 dark:text-rose-300' },
  { id: 'how_to_use',  label: 'How to Use App',   emoji: '📱', gradient: 'from-blue-500 to-indigo-600',    bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30',         text: 'text-blue-700 dark:text-blue-300' },
  { id: 'invite',      label: 'How to Invite',    emoji: '🤝', gradient: 'from-purple-500 to-violet-600',  bg: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-500/30',     text: 'text-purple-700 dark:text-purple-300' },
  { id: 'transfer',    label: 'How to Transfer',  emoji: '🔄', gradient: 'from-indigo-500 to-blue-600',    bg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-500/30',     text: 'text-indigo-700 dark:text-indigo-300' },
];

export default function SupportVideos() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [videos, setVideos] = useState<SupportVideo[]>([]);
  const [loading, setLoading] = useState(false);

  // Fullscreen Reels/Shorts Player state
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playerPlaylist, setPlayerPlaylist] = useState<SupportVideo[]>([]);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Touch gesture tracking for vertical swipe
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const lastWheelTime = useRef<number>(0);

  const { language } = useGameStore();
  const contactHubRef = useRef<HTMLDivElement>(null);
  const [contact, setContact] = useState<{
    username: string;
    channel: string;
    support_phone_eth: string;
  }>({
    username: 'hdasebingo_admin',
    channel: 'https://t.me/HdasebingoG',
    support_phone_eth: '+251996598686',
  });
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';

  useEffect(() => {
    fetch(`${API_URL}/player/support-contact`, {
      headers: { 'x-telegram-init-data': initData },
    })
      .then(res => res.json())
      .then(data => {
        if (data) {
          setContact({
            username: (data.username || 'hdasebingo_admin').replace(/^@/, '').trim(),
            channel: data.channel || 'https://t.me/HdasebingoG',
            support_phone_eth: data.support_phone_eth || '+251996598686',
          });
        }
      })
      .catch(() => {});
  }, [initData]);

  const formatEthPhone = (phone: string): string => {
    if (!phone) return '+251 99 659 8686';
    const clean = phone.replace(/[^\d+]/g, '');
    if (clean.startsWith('+251') && clean.length === 13) {
      return `${clean.slice(0, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`;
    }
    if (clean.startsWith('09') && clean.length === 10) {
      return `+251 ${clean.slice(1, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
    }
    return phone;
  };

  const handleCall = (phoneNumber: string) => {
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
    const cleanNum = phoneNumber.replace(/[\s()\-]/g, '');
    window.location.href = `tel:${cleanNum}`;
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedType(type);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
      setTimeout(() => setCopiedType(null), 2000);
    });
  };

  const handleOpenTelegram = () => {
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
    const url = `https://t.me/${contact.username}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleOpenChannel = () => {
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
    const url = contact.channel.startsWith('http') ? contact.channel : `https://t.me/${contact.channel.replace(/^@/, '')}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink && url.includes('t.me')) {
      WebApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleSupport = () => {
    if (contactHubRef.current) {
      contactHubRef.current.scrollIntoView({ behavior: 'smooth' });
    } else {
      handleOpenTelegram();
    }
  };

  const fetchVideos = async (category?: string | null) => {
    setLoading(true);
    try {
      const url = category && category !== 'all'
        ? `${API_URL}/player/support-videos?category=${category}`
        : `${API_URL}/player/support-videos`;
      const res = await fetch(url, {
        headers: { 'x-telegram-init-data': initData },
      });
      const data = await res.json();
      setVideos(data.videos || []);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const selectCategory = (catId: string) => {
    setSelectedCategory(catId);
    fetchVideos(catId);
  };

  const openVideoAt = (index: number, list: SupportVideo[]) => {
    setPlayerPlaylist(list);
    setActiveVideoIndex(index);
    setIsPlayerOpen(true);
  };

  const closeVideoPlayer = () => {
    if (videoRef.current) videoRef.current.pause();
    setIsPlayerOpen(false);
  };

  const goToNextVideo = () => {
    if (playerPlaylist.length <= 1) return;
    setActiveVideoIndex(prev => (prev + 1) % playerPlaylist.length);
  };

  const goToPrevVideo = () => {
    if (playerPlaylist.length <= 1) return;
    setActiveVideoIndex(prev => (prev - 1 + playerPlaylist.length) % playerPlaylist.length);
  };

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchEndY.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (touchStartY.current === null || touchEndY.current === null) return;
    const diff = touchStartY.current - touchEndY.current;
    const minSwipeDistance = 45;

    if (diff > minSwipeDistance) {
      // Swiped UP -> Go to Next video
      goToNextVideo();
    } else if (diff < -minSwipeDistance) {
      // Swiped DOWN -> Go to Prev video
      goToPrevVideo();
    }
    touchStartY.current = null;
    touchEndY.current = null;
  };

  // Wheel handling for desktop
  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 450) return; // Debounce wheel
    if (e.deltaY > 30) {
      lastWheelTime.current = now;
      goToNextVideo();
    } else if (e.deltaY < -30) {
      lastWheelTime.current = now;
      goToPrevVideo();
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isPlayerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goToNextVideo();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrevVideo();
      } else if (e.key === 'Escape') {
        closeVideoPlayer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayerOpen, playerPlaylist.length]);

  const currentVideo = playerPlaylist[activeVideoIndex];
  const activeCat = CATEGORIES.find(c => c.id === selectedCategory);
  const currentVideoCat = currentVideo ? CATEGORIES.find(c => c.id === currentVideo.category) : null;

  const renderSupportContactHub = () => (
    <div 
      ref={contactHubRef}
      className="mt-5 mb-4 bg-white dark:bg-[#0c1222] border border-slate-200/90 dark:border-slate-800/80 rounded-3xl p-3.5 shadow-md dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)] space-y-2.5 select-none relative overflow-hidden"
    >
      {/* Subtle light ambient glow */}
      <div className="absolute top-0 right-0 w-44 h-44 bg-violet-100/60 dark:bg-violet-900/20 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-amber-50/80 dark:bg-amber-950/20 rounded-full blur-2xl pointer-events-none" />

      {/* Ethiopia Call Card */}
      <div className="z-10 relative mb-1">
        {/* Ethiopia Support Card */}
        <div className="bg-slate-50/80 dark:bg-[#080d19] hover:bg-slate-50 dark:hover:bg-[#0c1424] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 flex flex-col justify-between transition-colors shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2.5 min-w-0">
              <span className="text-2xl shrink-0" role="img" aria-label="Ethiopia">🇪🇹</span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider truncate">
                  {language === 'am' ? 'የኢትዮጵያ ቀጥታ መስመር' : 'Ethiopia Direct Line'}
                </p>
                <p className="font-mono font-black text-[13px] text-slate-900 dark:text-white tracking-wide truncate">
                  {formatEthPhone(contact.support_phone_eth)}
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            <button
              onClick={() => handleCall(contact.support_phone_eth)}
              className="py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 active:scale-95 text-white text-xs font-black flex items-center justify-center space-x-1.5 shadow-sm shadow-emerald-600/20 transition-transform"
            >
              <Phone size={13} className="fill-current" />
              <span>{language === 'am' ? 'ደውል' : 'Call'}</span>
            </button>
            <button
              onClick={() => handleCopy(contact.support_phone_eth, 'eth')}
              className="py-2 px-3 rounded-xl bg-white dark:bg-[#12192c] hover:bg-slate-100 dark:hover:bg-[#1a243e] active:scale-95 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center space-x-1.5 border border-slate-200/80 dark:border-slate-700 shadow-2xs transition-transform"
            >
              {copiedType === 'eth' ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} className="text-slate-500 dark:text-slate-400" />}
              <span>{copiedType === 'eth' ? (language === 'am' ? 'ተቀድቷል!' : 'Copied!') : (language === 'am' ? 'ቅዳ' : 'Copy')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Telegram Actions (Admin Chat & Official Channel) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 z-10 relative pt-0.5">
        {/* Telegram Direct Chat */}
        <button
          onClick={handleOpenTelegram}
          className="w-full bg-gradient-to-r from-[#2AABEE] to-[#229ED9] hover:opacity-95 active:scale-[0.98] text-white p-3 rounded-2xl flex items-center justify-between shadow-sm shadow-sky-500/20 transition-transform"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Send size={15} className="text-white translate-x-[1px]" />
            </div>
            <div className="text-left min-w-0">
              <p className="font-black text-xs text-white leading-tight truncate">
                {language === 'am' ? 'ቴሌግራም ድጋፍ (ቻት)' : 'Telegram Admin Support'}
              </p>
              <p className="text-[10.5px] text-white/90 font-mono truncate">
                @{contact.username}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-white/20 border border-white/30 text-white shrink-0 ml-2">
            {language === 'am' ? 'አውራ' : 'Chat'} →
          </span>
        </button>

        {/* Telegram Official Group */}
        <button
          onClick={handleOpenChannel}
          className="w-full bg-violet-50/80 dark:bg-violet-950/40 hover:bg-violet-100/70 dark:hover:bg-violet-900/50 active:scale-[0.98] border border-violet-200/70 dark:border-violet-500/30 text-violet-950 dark:text-violet-100 p-3 rounded-2xl flex items-center justify-between transition-transform shadow-2xs"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <MessageCircle size={15} />
            </div>
            <div className="text-left min-w-0">
              <p className="font-black text-xs text-violet-950 dark:text-white leading-tight truncate">
                {language === 'am' ? 'ይፋዊ ቴሌግራም ግሩፕ' : 'Official Telegram Group'}
              </p>
              <p className="text-[10.5px] text-violet-700/80 dark:text-violet-300 font-medium truncate">
                {language === 'am' ? 'ተቀላቅለው ከማህበረሰቡ ጋር ይወያዩ' : 'Join our official community'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-white dark:bg-[#12192c] border border-violet-200 dark:border-violet-500/40 text-violet-700 dark:text-violet-300 shrink-0 ml-2 shadow-2xs">
            {language === 'am' ? 'ተቀላቀል' : 'Join'} →
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#070b14] dark:via-[#090e1c] dark:to-[#070b14] pb-8">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-[#0b1020]/95 backdrop-blur-md border-b border-gray-100 dark:border-slate-800/80 px-4 py-3 flex items-center space-x-3 shadow-sm">
        <button
          onClick={() => selectedCategory ? setSelectedCategory(null) : navigate(-1)}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-90 transition-all"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-slate-800 dark:text-white text-base">Help & Tutorials</h1>
          {selectedCategory ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
              {selectedCategory === 'all' ? '🗂 All Tutorials' : `${activeCat?.emoji || ''} ${activeCat?.label || ''}`}
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Video Guides</p>
          )}
        </div>
        <button
          onClick={handleSupport}
          className="flex items-center space-x-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/40 active:scale-95 px-3 py-1.5 rounded-xl border border-violet-200 dark:border-violet-500/30 transition-all shadow-xs"
        >
          <Headphones size={13} className="text-violet-600 dark:text-violet-400" />
          <span>Support</span>
        </button>
      </div>

      {!selectedCategory ? (
        /* Category Selection Grid without the redundant top illustration */
        <div className="px-4 pt-4">

          {/* 6 Category Tiles in 2-column grid */}
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => selectCategory(cat.id)}
                className="bg-white dark:bg-[#0c1222] border border-gray-200 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col items-center space-y-2.5 shadow-sm dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:shadow-md hover:dark:border-slate-700 active:scale-95 transition-all text-center"
              >
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center shadow-md`}>
                  <span className="text-2xl">{cat.emoji}</span>
                </div>
                <span className="font-bold text-slate-700 dark:text-slate-200 text-xs leading-tight">{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Direct Support & Call Hub Card */}
          {renderSupportContactHub()}
        </div>
      ) : (
        /* Video List with horizontal category switcher */
        <div className="px-4 pt-3">
          {/* Quick Category Switcher Tabs */}
          <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-3">
            <button
              onClick={() => selectCategory('all')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-xs border transition-all ${
                selectedCategory === 'all'
                  ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                  : 'bg-white dark:bg-[#0c1222] text-slate-600 dark:text-slate-300 border-gray-200 dark:border-slate-800'
              }`}
            >
              🗂 All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => selectCategory(cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-xs border transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : 'bg-white dark:bg-[#0c1222] text-slate-600 dark:text-slate-300 border-gray-200 dark:border-slate-800'
                }`}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-violet-500" />
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#0c1222] rounded-2xl border border-gray-100 dark:border-slate-800 p-6 shadow-sm">
              <VideoIcon size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-600 dark:text-slate-200 font-bold text-sm">No videos in this category</p>
              <p className="text-slate-400 dark:text-slate-400 text-xs mt-1">Check back soon for new guides</p>
              <button
                onClick={handleSupport}
                className="mt-4 inline-flex items-center space-x-1.5 bg-violet-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm"
              >
                <Headphones size={13} />
                <span>Contact Support</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {videos.map((v, idx) => {
                const itemCat = CATEGORIES.find(c => c.id === v.category);
                return (
                  <button
                    key={v.id}
                    onClick={() => openVideoAt(idx, videos)}
                    className="w-full bg-white dark:bg-[#0c1222] border border-gray-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:shadow-md hover:dark:border-slate-700 active:scale-[0.98] transition-all text-left"
                  >
                    <div className="flex items-center space-x-3 p-3">
                      {/* Video Thumbnail with Play Badge */}
                      <div className="w-24 h-16 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 relative overflow-hidden">
                        <video
                          src={v.video_url}
                          preload="metadata"
                          playsInline
                          muted
                          className="w-full h-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="w-8 h-8 bg-white/95 rounded-full flex items-center justify-center shadow-md">
                            <Play size={14} className="text-violet-700 ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                        <div className="absolute top-1 left-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                          <span className="text-[9px] text-white font-black">{idx + 1}</span>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        {selectedCategory === 'all' && itemCat && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#12192c] text-slate-600 dark:text-slate-300 inline-block mb-1">
                            {itemCat.emoji} {itemCat.label}
                          </span>
                        )}
                        <p className="font-bold text-slate-800 dark:text-white text-sm leading-tight line-clamp-2">{v.title}</p>
                        {v.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 font-medium">{v.description}</p>
                        )}
                        <div className="flex items-center space-x-1 mt-1.5 text-violet-600 dark:text-violet-400">
                          <Play size={10} fill="currentColor" />
                          <span className="text-[10px] font-bold">Watch Video (Swipeable)</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Direct Support & Call Hub Card */}
          {renderSupportContactHub()}
        </div>
      )}

      {/* FULL-SCREEN REELS/SHORTS-STYLE SWIPEABLE VIDEO PLAYER */}
      {isPlayerOpen && currentVideo && (
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          className="fixed inset-0 z-50 bg-white dark:bg-[#070b14] flex flex-col justify-between select-none touch-none"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-[#0b1020] border-b border-slate-100 dark:border-slate-800 z-20 shrink-0">
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center space-x-2 mb-1">
                {currentVideoCat && (
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${currentVideoCat.bg} ${currentVideoCat.text}`}>
                    {currentVideoCat.emoji} {currentVideoCat.label}
                  </span>
                )}
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#12192c] px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                  {activeVideoIndex + 1} of {playerPlaylist.length}
                </span>
              </div>
              <p className="font-black text-slate-900 dark:text-white text-sm truncate">{currentVideo.title}</p>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSupport}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#12192c] hover:bg-slate-200 dark:hover:bg-[#1a243e] text-slate-600 dark:text-slate-300 flex items-center justify-center active:scale-90 transition-all border border-slate-200 dark:border-slate-700"
                title="Support"
              >
                <MessageCircle size={16} />
              </button>
              <button 
                onClick={closeVideoPlayer} 
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#12192c] hover:bg-slate-200 dark:hover:bg-[#1a243e] text-slate-600 dark:text-slate-300 flex items-center justify-center active:scale-90 transition-all border border-slate-200 dark:border-slate-700"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Main Video Viewport */}
          <div className="flex-1 min-h-0 relative flex items-center justify-center bg-white dark:bg-[#070b14] overflow-hidden p-3">
            <video
              key={currentVideo.id} // Reload video smoothly when index changes
              ref={videoRef}
              src={currentVideo.video_url}
              controls
              autoPlay
              playsInline
              className="w-full max-h-full object-contain bg-black rounded-2xl shadow-lg border border-slate-100 dark:border-slate-800"
              style={{ maxHeight: 'calc(100vh - 160px)' }}
            >
              Your browser does not support video playback.
            </video>

            {/* Floating Navigation Controls on the Right Edge (TikTok / Shorts style) */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center space-y-3 z-30">
              {/* Prev Video Button (▲) */}
              <button
                onClick={(e) => { e.stopPropagation(); goToPrevVideo(); }}
                className="w-10 h-10 rounded-full bg-white/95 dark:bg-[#0c1222]/95 hover:bg-white dark:hover:bg-[#18233d] text-slate-700 dark:text-slate-200 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl flex items-center justify-center active:scale-90 transition-all"
                title="Previous Video (Swipe Down)"
              >
                <ChevronUp size={20} />
              </button>

              {/* Progress counter pill */}
              <div className="px-2.5 py-1 rounded-full bg-white/95 dark:bg-[#0c1222]/95 border border-slate-200 dark:border-slate-700 shadow-md text-[10px] font-black text-slate-800 dark:text-slate-200">
                {activeVideoIndex + 1}/{playerPlaylist.length}
              </div>

              {/* Next Video Button (▼) */}
              <button
                onClick={(e) => { e.stopPropagation(); goToNextVideo(); }}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border border-violet-400/30 shadow-xl shadow-violet-500/25 flex items-center justify-center active:scale-90 transition-all animate-pulse"
                title="Next Video (Swipe Up)"
              >
                <ChevronDown size={20} />
              </button>
            </div>
          </div>

          {/* Bottom Info & Swipe Hint Overlay */}
          <div className="p-4 bg-white dark:bg-[#0b1020] border-t border-slate-100 dark:border-slate-800 z-20 space-y-2 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
            {currentVideo.description && (
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium line-clamp-2 leading-relaxed">
                {currentVideo.description}
              </p>
            )}

            {/* Swipe instruction helper */}
            <div className="flex items-center justify-between pt-0.5">
              <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span className="inline-block animate-bounce text-violet-600 dark:text-violet-400">↕</span>
                <span>{language === 'am' ? 'ቪዲዮ ለመቀየር ወደ ላይ ወይም ወደ ታች ይጎትቱ' : 'Swipe up or down for next video'}</span>
              </div>
              <button
                onClick={handleSupport}
                className="text-[11px] font-black text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/40 px-3 py-1 rounded-full border border-violet-200 dark:border-violet-500/30 transition-colors flex items-center space-x-1 shadow-2xs"
              >
                <Headphones size={12} className="text-violet-600 dark:text-violet-400" />
                <span>{language === 'am' ? 'እርዳታ ጠይቅ' : 'Ask Admin Help'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
