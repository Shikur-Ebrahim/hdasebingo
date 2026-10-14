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

  const fetchVideos = async (category: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/player/support-videos?category=${category}`, {
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
    setPlayingVideo(null);
    if (videoRef.current) videoRef.current.pause();
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
        <div className="flex-1">
          <h1 className="font-black text-slate-800 text-base">Help & Tutorials</h1>
          {selectedCategory && activeCat && (
            <p className="text-xs text-slate-500 font-medium">{activeCat.emoji} {activeCat.label}</p>
          )}
        </div>
      </div>

      {!selectedCategory ? (
        /* Category Selection */
        <div className="px-4 pt-6">
          <div className="text-center mb-7">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-violet-200">
              <span className="text-3xl">🎬</span>
            </div>
            <h2 className="font-black text-slate-800 text-xl">Video Tutorials</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Select a topic to watch helpful videos</p>
          </div>

          {/* 2-column grid for all 6 categories */}
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
              <p className="text-indigo-600 text-xs mt-0.5 font-medium">Contact support through the app if you still have questions after watching.</p>
            </div>
          </div>
        </div>
      ) : (
        /* Video List */
        <div className="px-4 pt-4">
          {activeCat && (
            <div className={`flex items-center space-x-3 p-4 rounded-2xl border mb-4 ${activeCat.bg}`}>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activeCat.gradient} flex items-center justify-center shadow-md`}>
                <span className="text-2xl">{activeCat.emoji}</span>
              </div>
              <div>
                <p className={`font-black text-base ${activeCat.text}`}>{activeCat.label}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {loading ? 'Loading…' : `${videos.length} video${videos.length !== 1 ? 's' : ''} available`}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-violet-500" />
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16">
              <VideoIcon size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-semibold text-sm">No videos yet</p>
              <p className="text-slate-400 text-xs mt-1">Check back soon for tutorials</p>
            </div>
          ) : (
            <div className="space-y-3">
              {videos.map((v, idx) => (
                <button
                  key={v.id}
                  onClick={() => setPlayingVideo(v)}
                  className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left"
                >
                  {/* Thumbnail row */}
                  <div className="flex items-center space-x-3 p-3">
                    <div className="w-24 h-16 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shrink-0 relative overflow-hidden">
                      {v.thumbnail_url ? (
                        <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${activeCat?.gradient} flex items-center justify-center`}>
                          <span className="text-2xl">{activeCat?.emoji}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-md">
                          <Play size={14} className="text-slate-800 ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                      <div className="absolute top-1 left-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                        <span className="text-[9px] text-white font-black">{idx + 1}</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{v.title}</p>
                      {v.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 font-medium">{v.description}</p>
                      )}
                      <div className="flex items-center space-x-1 mt-1.5">
                        <Play size={10} className="text-violet-500" />
                        <span className="text-[10px] font-bold text-violet-600">Watch video</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full-Screen Video Player */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center space-x-3 px-4 py-3 bg-black/80">
            <button onClick={closeVideo} className="text-white p-1.5 rounded-xl hover:bg-white/10 active:scale-90 transition-all">
              <X size={22} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-sm truncate">{playingVideo.title}</p>
              {playingVideo.description && (
                <p className="text-[11px] text-white/60 font-medium truncate">{playingVideo.description}</p>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center bg-black">
            <video
              ref={videoRef}
              src={playingVideo.video_url}
              controls
              autoPlay
              playsInline
              className="w-full max-h-full"
              style={{ maxHeight: 'calc(100vh - 80px)' }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      )}
    </div>
  );
}
