import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, X, Loader2, Video as VideoIcon, Headphones, ChevronUp, ChevronDown, MessageCircle } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

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
  { id: 'how_to_play', label: 'How to Play',     emoji: '🎮', gradient: 'from-emerald-500 to-teal-600',   bg: 'bg-emerald-50 border-emerald-200',  text: 'text-emerald-700' },
  { id: 'deposit',     label: 'Deposit',          emoji: '💰', gradient: 'from-yellow-400 to-amber-500',   bg: 'bg-yellow-50 border-yellow-200',    text: 'text-yellow-700' },
  { id: 'withdraw',    label: 'Withdraw',         emoji: '💸', gradient: 'from-rose-500 to-pink-600',      bg: 'bg-rose-50 border-rose-200',         text: 'text-rose-700' },
  { id: 'how_to_use',  label: 'How to Use App',   emoji: '📱', gradient: 'from-blue-500 to-indigo-600',    bg: 'bg-blue-50 border-blue-200',         text: 'text-blue-700' },
  { id: 'invite',      label: 'How to Invite',    emoji: '🤝', gradient: 'from-purple-500 to-violet-600',  bg: 'bg-purple-50 border-purple-200',     text: 'text-purple-700' },
  { id: 'transfer',    label: 'How to Transfer',  emoji: '🔄', gradient: 'from-indigo-500 to-blue-600',    bg: 'bg-indigo-50 border-indigo-200',     text: 'text-indigo-700' },
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

  const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';

  const handleSupport = async () => {
    try {
      const res = await fetch(`${API_URL}/player/support-contact`, {
        headers: { 'x-telegram-init-data': initData },
      });
      const data = await res.json();
      const username = (data.username || 'Mosque_Dona').replace('@', '').trim();
      const url = `https://t.me/${username}`;
      if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
        WebApp.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      const fallbackUrl = 'https://t.me/Mosque_Dona';
      if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
        WebApp.openTelegramLink(fallbackUrl);
      } else {
        window.open(fallbackUrl, '_blank');
      }
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-8">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center space-x-3 shadow-sm">
        <button
          onClick={() => selectedCategory ? setSelectedCategory(null) : navigate(-1)}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 active:scale-90 transition-all"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-slate-800 text-base">Help & Tutorials</h1>
          {selectedCategory ? (
            <p className="text-xs text-slate-500 font-medium truncate">
              {selectedCategory === 'all' ? '🗂 All Tutorials' : `${activeCat?.emoji || ''} ${activeCat?.label || ''}`}
            </p>
          ) : (
            <p className="text-xs text-slate-500 font-medium">Video Guides</p>
          )}
        </div>
        <button
          onClick={handleSupport}
          className="flex items-center space-x-1.5 text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 active:scale-95 px-3 py-1.5 rounded-xl border border-violet-200 transition-all shadow-xs"
        >
          <Headphones size={13} className="text-violet-600" />
          <span>Support</span>
        </button>
      </div>

      {!selectedCategory ? (
        /* Category Selection Grid without the redundant top illustration */
        <div className="px-4 pt-4">
          {/* Quick "Browse All Videos" banner */}
          <button
            onClick={() => selectCategory('all')}
            className="w-full mb-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-3.5 rounded-2xl shadow-md flex items-center justify-between active:scale-[0.98] transition-all"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">
                🗂
              </div>
              <div className="text-left">
                <p className="font-black text-sm">Browse All Videos</p>
                <p className="text-[11px] text-white/80 font-medium">See tutorials from all categories</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black">
              →
            </div>
          </button>

          {/* 6 Category Tiles in 2-column grid */}
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => selectCategory(cat.id)}
                className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center space-y-2.5 shadow-sm hover:shadow-md active:scale-95 transition-all text-center"
              >
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center shadow-md`}>
                  <span className="text-2xl">{cat.emoji}</span>
                </div>
                <span className="font-bold text-slate-700 text-xs leading-tight">{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Direct Support Button Card */}
          <button
            onClick={handleSupport}
            className="w-full mt-6 p-4 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200/80 rounded-2xl flex items-center justify-between text-left active:scale-[0.98] transition-all shadow-sm"
          >
            <div className="flex items-start space-x-3">
              <span className="text-2xl mt-0.5">💡</span>
              <div>
                <p className="font-bold text-violet-900 text-sm">Need more help?</p>
                <p className="text-violet-700/80 text-xs mt-0.5 font-medium">Contact admin support directly on Telegram.</p>
              </div>
            </div>
            <span className="text-violet-600 font-bold text-xs bg-white px-2.5 py-1.5 rounded-xl border border-violet-200 shadow-xs">
              Chat
            </span>
          </button>
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
                  : 'bg-white text-slate-600 border-gray-200'
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
                    : 'bg-white text-slate-600 border-gray-200'
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
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 p-6">
              <VideoIcon size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-bold text-sm">No videos in this category</p>
              <p className="text-slate-400 text-xs mt-1">Check back soon for new guides</p>
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
                    className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left"
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
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 inline-block mb-1">
                            {itemCat.emoji} {itemCat.label}
                          </span>
                        )}
                        <p className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{v.title}</p>
                        {v.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1 font-medium">{v.description}</p>
                        )}
                        <div className="flex items-center space-x-1 mt-1.5 text-violet-600">
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
        </div>
      )}

      {/* FULL-SCREEN REELS/SHORTS-STYLE SWIPEABLE VIDEO PLAYER */}
      {isPlayerOpen && currentVideo && (
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none touch-none"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent z-20">
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center space-x-2 mb-0.5">
                {currentVideoCat && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-md">
                    {currentVideoCat.emoji} {currentVideoCat.label}
                  </span>
                )}
                <span className="text-[10px] font-bold text-white/70 bg-black/40 px-2 py-0.5 rounded-full">
                  {activeVideoIndex + 1} of {playerPlaylist.length}
                </span>
              </div>
              <p className="font-bold text-white text-sm truncate">{currentVideo.title}</p>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSupport}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center active:scale-90 transition-all"
                title="Support"
              >
                <MessageCircle size={16} />
              </button>
              <button 
                onClick={closeVideoPlayer} 
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center active:scale-90 transition-all"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Main Video Viewport */}
          <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
            <video
              key={currentVideo.id} // Reload video smoothly when index changes
              ref={videoRef}
              src={currentVideo.video_url}
              controls
              autoPlay
              playsInline
              className="w-full max-h-full object-contain"
              style={{ maxHeight: 'calc(100vh - 150px)' }}
            >
              Your browser does not support video playback.
            </video>

            {/* Floating Navigation Controls on the Right Edge (TikTok / Shorts style) */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center space-y-3 z-30">
              {/* Prev Video Button (▲) */}
              <button
                onClick={(e) => { e.stopPropagation(); goToPrevVideo(); }}
                className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex flex-col items-center justify-center active:scale-90 transition-transform shadow-lg hover:bg-black/80"
                title="Previous Video (Swipe Down)"
              >
                <ChevronUp size={20} />
              </button>

              {/* Progress counter pill */}
              <div className="px-2 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[10px] font-black text-white/90">
                {activeVideoIndex + 1}/{playerPlaylist.length}
              </div>

              {/* Next Video Button (▼) */}
              <button
                onClick={(e) => { e.stopPropagation(); goToNextVideo(); }}
                className="w-10 h-10 rounded-full bg-violet-600/90 backdrop-blur-md border border-violet-400/40 text-white flex flex-col items-center justify-center active:scale-90 transition-transform shadow-lg hover:bg-violet-700 animate-pulse"
                title="Next Video (Swipe Up)"
              >
                <ChevronDown size={20} />
              </button>
            </div>
          </div>

          {/* Bottom Info & Swipe Hint Overlay */}
          <div className="p-4 bg-gradient-to-t from-black via-black/80 to-transparent z-20 space-y-2">
            {currentVideo.description && (
              <p className="text-xs text-white/80 font-medium line-clamp-2 leading-relaxed">
                {currentVideo.description}
              </p>
            )}

            {/* Swipe instruction helper */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-1.5 text-[10px] font-bold text-white/60">
                <span className="inline-block animate-bounce">↕</span>
                <span>Swipe up or down for next video</span>
              </div>
              <button
                onClick={handleSupport}
                className="text-[10px] font-bold text-violet-300 hover:text-white flex items-center space-x-1 underline"
              >
                <span>Ask Admin Help</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
