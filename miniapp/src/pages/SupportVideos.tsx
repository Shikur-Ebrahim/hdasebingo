import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, X, Loader2, Video as VideoIcon } from 'lucide-react';
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
  const [playingVideo, setPlayingVideo] = useState<SupportVideo | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';

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

  const closeVideo = () => {
    if (videoRef.current) videoRef.current.pause();
    setPlayingVideo(null);
  };

  const activeCat = CATEGORIES.find(c => c.id === selectedCategory);

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
        {selectedCategory && (
          <button
            onClick={() => setSelectedCategory(null)}
            className="text-xs font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-lg"
          >
            Categories
          </button>
        )}
      </div>

      {!selectedCategory ? (
        /* Category Selection Grid */
        <div className="px-4 pt-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-violet-200">
              <span className="text-3xl">🎬</span>
            </div>
            <h2 className="font-black text-slate-800 text-xl">Video Tutorials</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Select a topic or watch all tutorials</p>
          </div>

          {/* Quick "View All Videos" banner */}
          <button
            onClick={() => selectCategory('all')}
            className="w-full mb-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-3.5 rounded-2xl shadow-md flex items-center justify-between active:scale-[0.98] transition-all"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">
                🗂
              </div>
              <div className="text-left">
                <p className="font-black text-sm">Browse All Videos</p>
                <p className="text-[11px] text-white/80">See tutorials from all categories</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black">
              →
            </div>
          </button>

          {/* 6 Category Tiles */}
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

          <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start space-x-3">
            <span className="text-xl mt-0.5">💡</span>
            <div>
              <p className="font-bold text-indigo-800 text-sm">Need more help?</p>
              <p className="text-indigo-600 text-xs mt-0.5 font-medium">Contact support through the app if you have questions after watching.</p>
            </div>
          </div>
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
            </div>
          ) : (
            <div className="space-y-3">
              {videos.map((v, idx) => {
                const itemCat = CATEGORIES.find(c => c.id === v.category);
                return (
                  <button
                    key={v.id}
                    onClick={() => setPlayingVideo(v)}
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
                          <span className="text-[10px] font-bold">Watch Video</span>
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

      {/* FULL-SCREEN VIDEO PLAYER */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-white/10 z-10">
            <div className="flex-1 min-w-0 pr-3">
              <p className="font-bold text-white text-sm truncate">{playingVideo.title}</p>
              {playingVideo.description && (
                <p className="text-[11px] text-white/60 font-medium truncate">{playingVideo.description}</p>
              )}
            </div>
            <button 
              onClick={closeVideo} 
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 text-white flex items-center justify-center transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center bg-black p-2">
            <video
              ref={videoRef}
              src={playingVideo.video_url}
              controls
              autoPlay
              playsInline
              className="w-full max-h-full rounded-xl"
              style={{ maxHeight: 'calc(100vh - 120px)' }}
            >
              Your browser does not support video playback.
            </video>
          </div>
        </div>
      )}
    </div>
  );
}
