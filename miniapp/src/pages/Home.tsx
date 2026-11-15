import { useState, useEffect, useRef, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import { Gift, ArrowDownToLine, Share2, PlusCircle, Info, DoorOpen, Users, Gamepad2, RefreshCw, ChevronDown, Clapperboard, Play, X, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Room {
  id: string;
  room_name: string;
  agent_id: string;
  agent_name?: string;
  total_players: number;
  total_games: number;
  status: string;
  stakes?: number[];
}

const ROOM_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

export default function Home() {
  const { user, language, rooms, fetchRooms, subscribeToRooms, setAuthModalOpen } = useGameStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [homeGames, setHomeGames] = useState<Record<number, { pool: number; start_at?: string; status: string; players: number }>>({});
  const [homeTimeLeft, setHomeTimeLeft] = useState<Record<number, number>>({});
  const [announcement, setAnnouncement] = useState<{ message: string; maxViews: number } | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const announcementShownRef = useRef(false);

  // Home Video Guide Popup state
  const [homePopupVideo, setHomePopupVideo] = useState<{
    id: string;
    title: string;
    description: string | null;
    video_url: string;
    thumbnail_url: string | null;
    max_views: number;
  } | null>(null);
  const [showVideoPopup, setShowVideoPopup] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingAnnouncementRef = useRef(false);
  const [isClosingVideo, setIsClosingVideo] = useState(false);
  const [highlightGuideBtn, setHighlightGuideBtn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Auto-play popup video on mount with sound ON by default
  useEffect(() => {
    if (showVideoPopup && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = 1.0;
      setIsMuted(false);

      const p = videoRef.current.play();
      if (p !== undefined) {
        p.then(() => {
          setIsMuted(false);
        }).catch(() => {
          // If browser strictly blocks unmuted autoplay without prior interaction,
          // play muted temporarily and instantly unmute on the very first touch/click
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.play().catch(() => {});
          }
          const enableAudio = () => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              videoRef.current.volume = 1.0;
              setIsMuted(false);
            }
          };
          window.addEventListener('touchstart', enableAudio, { once: true, passive: true });
          window.addEventListener('pointerdown', enableAudio, { once: true, passive: true });
          window.addEventListener('click', enableAudio, { once: true, passive: true });
        });
      }
    }
  }, [showVideoPopup]);

  const toggleSound = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      const nextMuted = !videoRef.current.muted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
      if (typeof WebApp !== 'undefined') {
        WebApp.HapticFeedback?.impactOccurred('light');
      }
    }
  };

  // Manual refresh spinner
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [homeRoomSortFilter, setHomeRoomSortFilter] = useState<'all' | 'most_players' | 'most_games' | 'newest'>('all');
  const [showHomeFilterDropdown, setShowHomeFilterDropdown] = useState(false);
  const [homeRoomSearch, setHomeRoomSearch] = useState('');
  const [showHomeSearchBar, setShowHomeSearchBar] = useState(false);
  const [supportPhoneUsa, setSupportPhoneUsa] = useState('+1 (984) 378-9510');
  const [supportPhoneEth, setSupportPhoneEth] = useState('+251996598686');
  const [supportUsername, setSupportUsername] = useState('Mosque_Dona');

  const formatEthPhone = (phone: string) => {
    if (!phone) return '+251996598686';
    const clean = phone.trim();
    if ((clean.startsWith('09') || clean.startsWith('07')) && clean.length === 10) {
      return '+251' + clean.slice(1);
    }
    return clean;
  };

  // Sync rooms silently on mount + realtime subscription (NO loading effect on revisit)
  useEffect(() => {
    fetchRooms();
    const unsub = subscribeToRooms();
    const interval = setInterval(() => fetchRooms(), 30000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const handleManualRefresh = async () => {
    setManualRefreshing(true);
    await fetchRooms();
    setTimeout(() => setManualRefreshing(false), 500);
  };

  // User's assigned/invited room (persisted during registration or friend invite)
  const userInvitedRoomId = (typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null) || (user as any)?.room_id || null;
  const activeRoom = useMemo(() => {
    if (userInvitedRoomId) {
      const found = rooms.find(r => r.id === userInvitedRoomId);
      if (found) return found;
    }
    const official = rooms.find(r => r.room_name === 'HDASE BINGO' || r.id === 'd7c9114a-e112-426f-8f9b-13c00050279c');
    if (official) return official;
    const pinned = rooms.find(r => r.is_pinned);
    if (pinned) return pinned;
    return rooms[0] || null;
  }, [rooms, userInvitedRoomId]);

  const activeRoomId = activeRoom?.id || 'd7c9114a-e112-426f-8f9b-13c00050279c';
  const activeStakes = useMemo(() => {
    if (activeRoom && Array.isArray(activeRoom.stakes) && activeRoom.stakes.length === 4) {
      return activeRoom.stakes.map(Number);
    }
    return [5, 10, 20, 35];
  }, [activeRoom]);


  useEffect(() => {
    let isMounted = true;

    const fetchPools = async () => {
      let loadedPools: any[] | null = null;
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const token = typeof window !== 'undefined' ? localStorage.getItem('hdase_pwa_token') : null;
        const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
        if (initData) hdrs['x-telegram-init-data'] = initData;
        if (token) hdrs['Authorization'] = `Bearer ${token}`;

        const url = `${API_URL}/bingo/pools?room=${activeRoomId}`;
        const r = await fetch(url, { headers: hdrs });
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.pools)) loadedPools = d.pools;
        }
      } catch {}

      if (!loadedPools) {
        let q = supabase
          .from('bingo_games')
          .select('id, stake, prize_pool, total_players, start_at, status, room_id')
          .in('status', ['waiting', 'calling'])
          .eq('room_id', activeRoomId);

        const { data: dbGames } = await q;
        if (dbGames && dbGames.length > 0) {
          loadedPools = dbGames.map(g => ({
            stake: g.stake,
            prize_pool: g.prize_pool,
            start_at: g.start_at,
            status: g.status,
            unique_players: g.total_players || 0,
          }));
        }
      }

      if (isMounted) {
        const p: Record<number, any> = {};
        if (loadedPools) {
          loadedPools.forEach((g: any) => {
            p[Number(g.stake)] = {
              pool: g.prize_pool || 0,
              start_at: g.start_at,
              status: g.status,
              players: g.unique_players || 0,
            };
          });
        }
        setHomeGames(p);
      }
    };

    fetchPools();

    const ch = supabase.channel(`home_pools_${activeRoomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_games' }, () => {
        if (isMounted) fetchPools();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bingo_players' }, () => {
        if (isMounted) fetchPools();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(ch);
    };
  }, [activeRoomId]);

  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'hidden') return;
      setHomeTimeLeft(prev => {
        const next: Record<number, number> = {};
        for (const [stake, g] of Object.entries(homeGames)) {
          if (g.status === 'waiting' && g.start_at) {
            next[Number(stake)] = Math.max(0, Math.ceil((new Date(g.start_at).getTime() - Date.now()) / 1000));
          }
        }
        return next;
      });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [homeGames]);

  const handleInvite = () => navigate('/invite');

  // ---- ANNOUNCEMENT POPUP LOGIC + PHONE NUMBERS ----
  useEffect(() => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    const API_URL_LOCAL = import.meta.env.VITE_API_URL || '/api';
    fetch(`${API_URL_LOCAL}/player/support-contact`, {
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }
    })
      .then(r => r.json())
      .then(data => {
        // Phone numbers from DB
        if (data?.support_phone_usa) setSupportPhoneUsa(data.support_phone_usa);
        if (data?.support_phone_eth) setSupportPhoneEth(data.support_phone_eth);
        if (data?.username) setSupportUsername(data.username);

        // Check for Home Video Guide Popup (only if authed; PWA auth modal handles guests)
        let isVideoShowing = false;
        const isTelegramOrAuthed = Boolean(initData || localStorage.getItem('hdase_pwa_token'));
        if (isTelegramOrAuthed && data?.home_popup_video && data.home_popup_video.video_url) {
          const vid = data.home_popup_video;
          const vidKey = `home_vid_views_${vid.id}`;
          const currentViews = parseInt(localStorage.getItem(vidKey) || '0', 10);
          const maxViews = typeof vid.max_views === 'number' ? vid.max_views : 1;
          if (currentViews < maxViews) {
            localStorage.setItem(vidKey, String(currentViews + 1));
            setHomePopupVideo(vid);
            setShowVideoPopup(true);
            isVideoShowing = true;
          }
        }

        if (announcementShownRef.current) return;
        const msg = data?.announcement_message || '';
        const maxViews = typeof data?.announcement_max_views === 'number' ? data.announcement_max_views : 2;
        if (!msg.trim()) return;
        const storageKey = `ann_views_${msg.slice(0, 20)}`;
        const viewCount = parseInt(localStorage.getItem(storageKey) || '0', 10);
        if (viewCount < maxViews) {
          localStorage.setItem(storageKey, String(viewCount + 1));
          setAnnouncement({ message: msg, maxViews });
          if (isVideoShowing) {
            pendingAnnouncementRef.current = true;
          } else {
            setShowAnnouncement(true);
          }
          announcementShownRef.current = true;
        }
      })
      .catch(() => {});
  }, []);
  // ----------------------------------



  const handleCloseVideoPopup = (_fromVideoEnd = false) => {
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (_) {}
    }
    if (typeof WebApp !== 'undefined') {
      WebApp.HapticFeedback?.impactOccurred('medium');
    }
    setIsClosingVideo(true);
    setTimeout(() => {
      setShowVideoPopup(false);
      setIsClosingVideo(false);
      setHighlightGuideBtn(true);
      setTimeout(() => setHighlightGuideBtn(false), 5000);
    }, 280);
    if (pendingAnnouncementRef.current) {
      setShowAnnouncement(true);
      pendingAnnouncementRef.current = false;
    }
  };

  const initial = user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'U';
  const formatMoney = (amount: number | undefined) => (amount || 0).toLocaleString('en-US');

  return (
    <div className="flex flex-col min-h-screen pb-20 space-y-4">

      {/* HOME VIDEO GUIDE FULLSCREEN POPUP (CLEAN WHITE THEME) */}
      {showVideoPopup && homePopupVideo && (
        <div 
          className={`fixed inset-0 z-50 bg-white flex flex-col justify-between overflow-hidden transition-all duration-300 ${
            isClosingVideo ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100 animate-fadeIn'
          }`}
          onClick={() => handleCloseVideoPopup(false)}
        >
          {/* Top Floating Controls: Sound Toggle & Close Button */}
          <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
            <button
              type="button"
              onClick={toggleSound}
              className={`pointer-events-auto flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shadow-md border transition-all active:scale-95 ${
                isMuted 
                  ? 'bg-rose-500 text-white border-rose-400' 
                  : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
              }`}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{isMuted ? (language === 'am' ? 'ድምጽ አጥፋ' : 'Sound OFF') : (language === 'am' ? 'ድምጽ በርቷል 🔊' : 'Sound ON 🔊')}</span>
            </button>

            <button
              onClick={() => handleCloseVideoPopup(false)}
              className="pointer-events-auto w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center shadow-md border border-slate-200/80 transition-all"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Full Screen Video Container - Clean White Background */}
          <div 
            className="flex-1 min-h-0 relative w-full h-full flex items-center justify-center bg-white overflow-hidden p-1 pt-12 pb-2"
            onClick={(e) => {
              e.stopPropagation();
              if (videoRef.current && videoRef.current.muted) {
                videoRef.current.muted = false;
                videoRef.current.volume = 1.0;
                setIsMuted(false);
              }
            }}
          >
            <video
              ref={videoRef}
              src={homePopupVideo.video_url}
              poster={homePopupVideo.thumbnail_url || undefined}
              controls
              playsInline
              autoPlay
              onEnded={() => handleCloseVideoPopup(true)}
              className="w-full h-full object-contain bg-white rounded-xl"
            >
              Your browser does not support video playback.
            </video>
          </div>

          {/* Middle / Center Attractive Action Button (No Icon) */}
          <div 
            className="p-4 pt-2 pb-6 bg-white flex items-center justify-center shrink-0 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleCloseVideoPopup(false)}
              className="w-full max-w-sm py-4 px-6 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 active:scale-95 text-white font-black text-base rounded-2xl shadow-xl shadow-violet-500/30 transition-all flex items-center justify-center border border-violet-400/30"
            >
              <span>Got it, Let's Play!</span>
            </button>
          </div>
        </div>
      )}

      {/* ANNOUNCEMENT POPUP */}
      {showAnnouncement && announcement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAnnouncement(false)}>
          <div
            className="bg-white dark:bg-[#111729] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-2 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 rounded-t-2xl" />
            <div className="px-5 pt-4 pb-2 flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-md shrink-0">
                <Info size={20} className="text-white" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-fuchsia-600 dark:text-fuchsia-400 uppercase tracking-widest">{t[language].home.announcement}</p>
                <p className="text-sm font-black text-slate-800 dark:text-white">{t[language].home.adwaBingo}</p>
              </div>
              <button onClick={() => setShowAnnouncement(false)} className="ml-auto w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-white/60 active:bg-slate-200">
                <span className="text-sm font-black">x</span>
              </button>
            </div>
            <div className="h-px bg-gray-100 dark:bg-white/5 mx-4" />
            <div className="px-5 py-4">
              <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold leading-relaxed whitespace-pre-wrap">{announcement.message}</p>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => setShowAnnouncement(false)}
                className="w-full py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white font-black text-sm rounded-xl shadow-md active:scale-95 transition-transform"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-white dark:bg-slate-900 px-4 py-4 rounded-b-2xl shadow-sm border-b border-gray-100 dark:border-slate-800 flex items-center justify-between transition-colors">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {initial}
          </div>
          <div>
            <p className="font-bold text-sm uppercase tracking-wider text-slate-700 dark:text-slate-200">{user?.first_name || 'USER'}</p>
            {user?.role !== 'user' && (
              <span className="text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">
                {user?.role}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-4 text-right">
          <div className="flex flex-col items-center">
            <div className="flex items-center space-x-1 text-purple-500 dark:text-purple-400 mb-0.5">
              <Gift size={14} />
            </div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{formatMoney(user?.bonus_balance)} ETB</p>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{t[language].home.wallet}</p>
            <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatMoney(user?.main_balance)} ETB</p>
          </div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="px-4 grid grid-cols-4 gap-2">
        <Link
          to="/deposit"
          onClick={(e) => {
            if (!user && !WebApp?.initData) {
              e.preventDefault();
              setAuthModalOpen(true);
            }
          }}
          className="flex flex-col items-center justify-center space-y-1 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 py-2.5 rounded-xl font-bold text-[11px] shadow-sm transition-colors"
        >
          <PlusCircle size={18} />
          <span>{t[language].home.deposit}</span>
        </Link>
        <Link
          to="/withdraw"
          onClick={(e) => {
            if (!user && !WebApp?.initData) {
              e.preventDefault();
              setAuthModalOpen(true);
            }
          }}
          className="flex flex-col items-center justify-center space-y-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-bold text-[11px] shadow-sm transition-colors"
        >
          <ArrowDownToLine size={18} />
          <span>{t[language].home.withdraw}</span>
        </Link>
        <button
          onClick={handleInvite}
          className="flex flex-col items-center justify-center space-y-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-bold text-[11px] shadow-sm transition-colors"
        >
          <Share2 size={18} />
          <span>{t[language].home.invite}</span>
        </button>
        <div className="relative">
          {highlightGuideBtn && (
            <div className="absolute -top-7 right-0 z-30 whitespace-nowrap bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[9.5px] font-black px-2.5 py-0.5 rounded-full shadow-lg shadow-violet-500/50 flex items-center space-x-1 animate-bounce">
              <Sparkles size={10} className="text-amber-300" />
              <span>Rewatch here!</span>
            </div>
          )}
          <Link
            to="/help-videos"
            className={`relative group flex flex-col items-center justify-center space-y-1 bg-black hover:bg-slate-900 text-white py-2.5 rounded-xl font-bold text-[11px] shadow-sm active:scale-95 transition-all overflow-hidden border border-slate-800 ${
              highlightGuideBtn ? 'ring-4 ring-violet-500 ring-offset-2 scale-105 shadow-xl shadow-violet-500/40 animate-pulse' : ''
            }`}
          >
            {/* Subtle animated shimmer highlight */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform pointer-events-none" />
            
            {/* Attention-seeker badge */}
            <span className="absolute -top-1 -right-1 bg-gradient-to-r from-amber-400 to-rose-500 text-white text-[7.5px] font-black px-1.5 py-0.5 rounded-full shadow-sm animate-pulse tracking-wider uppercase border border-white/40">
              Guide
            </span>

            <Clapperboard size={18} className="text-white drop-shadow-sm" />
            <span className="tracking-wide">Videos</span>
          </Link>
        </div>
      </div>

      {/* LIVE BINGO BANNER */}
      <div className="px-4">
        <Link
          to={`/bingo/live?stake=${activeStakes[0]}&room=${activeRoomId}`}
          onClick={(e) => {
            if (!user && !WebApp?.initData) {
              e.preventDefault();
              setAuthModalOpen(true);
            }
          }}
          className="block relative rounded-2xl overflow-hidden shadow-md h-52 flex flex-col items-center justify-center border border-amber-100"
        >
          {/* Light gradient background — matches loading screen */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(135deg, #fffbf0 0%, #fef3c7 40%, #fff8e8 70%, #fffbf0 100%)',
          }} />
          {/* Subtle radial glow in center */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at 50% 60%, rgba(251,191,36,0.18) 0%, transparent 70%)',
          }} />
          {/* Top border accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

          {/* Scrolling marquee strip — live room names */}
          <div className="absolute top-1 left-0 right-0 overflow-hidden py-1.5 bg-amber-50/80 border-b border-amber-200/60" style={{ top: '4px' }}>
            {(() => {
              const userInvitedRoomId = (typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null) || (user as any)?.room_id || null;
              const publicOrUserRooms = rooms.filter(r => !r.is_private || (userInvitedRoomId && r.id === userInvitedRoomId));
              return publicOrUserRooms.length > 0 ? (
                <div className="flex whitespace-nowrap animate-marquee">
                  {[...publicOrUserRooms, ...publicOrUserRooms].map((room, i) => (
                    <span key={i} className="text-amber-700 font-black text-[10px] uppercase tracking-[0.2em] px-4 shrink-0 flex items-center gap-1">
                      🚪 {room.room_name} &nbsp;·&nbsp;
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex whitespace-nowrap animate-marquee">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span key={i} className="text-amber-700 font-black text-[10px] uppercase tracking-[0.25em] px-5 shrink-0">
                      🚪 HDASE BINGO &nbsp;·&nbsp; 🏆 Live Rooms &nbsp;·&nbsp; 🔥 Play Now &nbsp;·&nbsp;
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Main content */}
          <div className="relative z-10 flex flex-col items-center text-center px-4">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              LIVE BINGO
            </span>
            {/* Split color title: HDASE dark, BINGO orange */}
            <div className="mb-5 flex items-baseline gap-2">
              <span className="text-slate-900 font-black text-4xl tracking-wide leading-none drop-shadow-sm">HDASE</span>
              <span className="text-orange-500 font-black text-4xl tracking-wide leading-none drop-shadow-sm">BINGO</span>
            </div>
            <div className="bg-orange-500 hover:bg-orange-600 text-white px-10 py-2.5 rounded-full font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.4)] active:scale-95 transition-all">
              PLAY NOW →
            </div>
          </div>

          {/* ── Phone numbers & Support indicator — bottom corners ── */}
          <div className="absolute bottom-1 left-1.5 right-1.5 flex justify-between items-center pointer-events-none z-20">
            {/* USA — bottom left */}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
                window.location.href = `tel:${supportPhoneUsa.replace(/[\s()\-]/g, '')}`;
              }}
              className="pointer-events-auto flex items-center gap-1 p-0.5 rounded text-black active:scale-95 active:opacity-75 transition-all shrink-0"
            >
              <span className="text-[15px] leading-none" role="img" aria-label="USA">🇺🇸</span>
              <span className="text-[11px] font-black leading-none tracking-tight">{supportPhoneUsa}</span>
            </button>

            {/* Center "SUPPORT" badge with arrows pointing toward USA & Ethiopia */}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
                const target = (supportUsername || 'Mosque_Dona').replace('@', '').trim();
                const tgUrl = `https://t.me/${target}`;
                if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
                  WebApp.openTelegramLink(tgUrl);
                } else {
                  window.open(tgUrl, '_blank');
                }
              }}
              className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-400 via-cyan-400 to-teal-400 text-slate-900 border border-cyan-200/90 shadow-sm active:scale-95 transition-all select-none"
            >
              <span className="text-xs font-black text-slate-900 leading-none">←</span>
              <span className="text-[9.5px] font-black tracking-widest uppercase leading-none">
                SUPPORT
              </span>
              <span className="text-xs font-black text-slate-900 leading-none">→</span>
            </button>

            {/* Ethiopia — bottom right */}
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
                window.location.href = `tel:${formatEthPhone(supportPhoneEth).replace(/[\s()\-]/g, '')}`;
              }}
              className="pointer-events-auto flex items-center gap-1 p-0.5 rounded text-black active:scale-95 active:opacity-75 transition-all shrink-0"
            >
              <span className="text-[15px] leading-none" role="img" aria-label="Ethiopia">🇪🇹</span>
              <span className="text-[11px] font-black leading-none tracking-tight">{formatEthPhone(supportPhoneEth)}</span>
            </button>
          </div>
        </Link>
      </div>

      {/* ══════════ LIVE STAKE TABLES SECTION (SELECT MEDEB) ══════════ */}
      <div className="px-4 flex-1 pb-6">
        {/* Section title: Exactly SELECT MEDEB matching reference design */}
        <div className="flex items-center justify-between mb-3 px-0.5">
          <h2 className="text-sm font-black text-slate-800 tracking-wider uppercase">
            SELECT MEDEB
          </h2>
          <button
            onClick={() => handleManualRefresh()}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200/60 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
            title="Refresh"
          >
            <RefreshCw size={12} className={manualRefreshing ? 'animate-spin text-amber-500' : ''} />
          </button>
        </div>

        {/* 4 Live Stake Tables Grid - Exact replica of the reference design */}
        <div className="grid grid-cols-2 gap-3.5">
          {activeStakes.map((stake, idx) => {
            const hg = homeGames[stake];
            const pool = hg?.pool || 0;
            const players = hg?.players || 0;
            const isCalling = hg?.status === 'calling';
            const timeLeft = homeTimeLeft[stake] || 0;
            const isCountingDown = hg?.status === 'waiting' && timeLeft > 0;

            // 4 exact gradient themes from reference screenshot: Blue, Green, Purple, Red
            const THEMES = [
              {
                gradient: 'from-[#2979ff] to-[#1565c0]', // Vivid Blue
              },
              {
                gradient: 'from-[#00c853] to-[#009624]', // Vivid Green
              },
              {
                gradient: 'from-[#ab47bc] to-[#7b1fa2]', // Vivid Purple
              },
              {
                gradient: 'from-[#ff2a55] to-[#d50000]', // Vivid Red
              },
            ];

            const theme = THEMES[idx % THEMES.length];

            const handleJoin = () => {
              if (!user && !WebApp?.initData) {
                setAuthModalOpen(true);
                return;
              }
              if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
              navigate(`/bingo/live?stake=${stake}&room=${activeRoomId}`);
            };

            return (
              <div
                key={stake}
                className="bg-white rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] border border-slate-100 overflow-hidden flex flex-col justify-between"
              >
                {/* Header with rounded-t-3xl and bright gradient */}
                <div
                  onClick={handleJoin}
                  className={`h-24 bg-gradient-to-r ${theme.gradient} flex items-center justify-center relative rounded-t-3xl cursor-pointer active:opacity-95 transition-opacity`}
                >
                  {/* Big bold centered number */}
                  <span className="text-white font-black text-4xl tracking-tight drop-shadow-xs select-none">
                    {stake}
                  </span>
                  {/* Top-right translucent "ETB" pill */}
                  <div className="absolute top-2.5 right-2.5 bg-white/25 backdrop-blur-xs text-white text-[9.5px] font-black px-2 py-0.5 rounded-md tracking-wider select-none">
                    ETB
                  </div>
                </div>

                {/* 3-Column Stats Row */}
                <div className="px-2 py-2.5 flex items-center justify-between text-center border-b border-slate-50 bg-white select-none">
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">DERASH</span>
                    <span className="text-[10.5px] font-black text-[#e5a000] mt-0.5">{pool} ETB</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">PLAYERS</span>
                    <span className="text-[10.5px] font-black text-[#00c853] mt-0.5">{players}</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">STATUS</span>
                    <span className={`text-[10.5px] font-black mt-0.5 ${
                      isCalling
                        ? 'text-emerald-500 animate-pulse'
                        : isCountingDown
                        ? 'text-amber-500'
                        : 'text-[#e67e22]'
                    }`}>
                      {isCalling ? 'Calling...' : isCountingDown ? `${timeLeft}s...` : 'Waiting...'}
                    </span>
                  </div>
                </div>

                {/* Bottom Action Button: Join Room */}
                <div className="p-3 pt-1 bg-white">
                  <button
                    onClick={handleJoin}
                    className="w-full bg-[#eef3f9] hover:bg-[#e2eaf5] active:scale-95 text-slate-700 font-black py-2.5 rounded-2xl text-xs transition-all shadow-2xs border border-slate-200/50 flex items-center justify-center cursor-pointer"
                  >
                    Join Room
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* ═══════════════════════════════════════════════ */}

    </div>
  );
}
