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
  const fetchPoolsRef = useRef<() => void>(() => {});
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
    await Promise.allSettled([fetchRooms(), fetchPoolsRef.current()]);
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
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const fetchPools = async () => {
      if (document.visibilityState === 'hidden') return;
      let loadedPools: any[] | null = null;
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const token = typeof window !== 'undefined' ? localStorage.getItem('hdase_pwa_token') : null;
        const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
        if (initData) hdrs['x-telegram-init-data'] = initData;
        if (token) hdrs['Authorization'] = `Bearer ${token}`;

        const url = `${API_URL}/bingo/pools?room=${activeRoomId}&_t=${Date.now()}`;
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
          .eq('room_id', activeRoomId)
          .order('created_at', { ascending: false });

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

      if (isMounted && loadedPools) {
        const p: Record<number, any> = {};
        loadedPools.forEach((g: any) => {
          const s = Number(g.stake);
          p[s] = {
            pool: Number(g.prize_pool || 0),
            start_at: g.start_at,
            status: g.status,
            players: Number(g.unique_players || 0),
          };
        });
        setHomeGames(p);
      }
    };

    fetchPoolsRef.current = fetchPools;
    fetchPools();

    // Fast polling fallback: every 1.2s to guarantee instant sync of derash, players, and countdown
    pollTimer = setInterval(fetchPools, 1200);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPools();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

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
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(ch);
    };
  }, [activeRoomId]);

  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'hidden') return;
      let shouldRefresh = false;
      setHomeTimeLeft(prev => {
        const next: Record<number, number> = {};
        for (const [stake, g] of Object.entries(homeGames)) {
          const pCount = Number(g.players || 0);
          if (g.status === 'waiting' && g.start_at && pCount >= 2) {
            const diff = Math.ceil((new Date(g.start_at).getTime() - Date.now()) / 1000);
            if (diff > 0 && diff <= 120) {
              next[Number(stake)] = diff;
            } else {
              next[Number(stake)] = 0;
              // Transition from counting down to 0: immediately refresh to flip to calling!
              if (prev[Number(stake)] && prev[Number(stake)] > 0) {
                shouldRefresh = true;
              }
            }
          } else {
            next[Number(stake)] = 0;
          }
        }
        return next;
      });
      if (shouldRefresh) {
        fetchPoolsRef.current();
      }
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
    <div className="flex flex-col min-h-screen pb-4 space-y-3">

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
      <div className="bg-white dark:bg-slate-900 px-3.5 py-1.5 shadow-2xs border-b border-gray-100 dark:border-slate-800 flex items-center justify-between shrink-0 transition-colors">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-sm shadow-xs">
            {initial}
          </div>
          <div>
            <p className="font-black text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200 leading-tight">
              {user?.first_name || 'USER'}
            </p>
            {user?.role !== 'user' && (
              <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.2 rounded-full font-bold">
                {user?.role}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3 text-right">
          <div className="flex flex-col items-center">
            <div className="flex items-center space-x-0.5 text-purple-500 mb-0.2">
              <Gift size={12} />
            </div>
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{formatMoney(user?.bonus_balance)} ETB</p>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{t[language].home.wallet}</p>
            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{formatMoney(user?.main_balance)} ETB</p>
          </div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="px-3 grid grid-cols-4 gap-2 shrink-0">
        <Link
          to="/deposit"
          onClick={(e) => {
            if (!user && !WebApp?.initData) {
              e.preventDefault();
              setAuthModalOpen(true);
            }
          }}
          className="flex flex-col items-center justify-center space-y-0.5 bg-yellow-400 hover:bg-yellow-500 active:scale-95 text-yellow-950 py-1.5 rounded-xl font-black text-[10.5px] shadow-2xs transition-transform"
        >
          <PlusCircle size={16} />
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
          className="flex flex-col items-center justify-center space-y-0.5 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 text-slate-700 py-1.5 rounded-xl font-black text-[10.5px] shadow-2xs transition-transform"
        >
          <ArrowDownToLine size={16} />
          <span>{t[language].home.withdraw}</span>
        </Link>
        <button
          onClick={handleInvite}
          className="flex flex-col items-center justify-center space-y-0.5 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 text-slate-700 py-1.5 rounded-xl font-black text-[10.5px] shadow-2xs transition-transform"
        >
          <Share2 size={16} />
          <span>{t[language].home.invite}</span>
        </button>
        <div className="relative">
          <Link
            to="/help-videos"
            className="relative flex flex-col items-center justify-center space-y-0.5 bg-black hover:bg-slate-900 active:scale-95 text-white py-1.5 rounded-xl font-black text-[10.5px] shadow-2xs transition-transform border border-slate-800"
          >
            <span className="absolute -top-1 -right-1 bg-gradient-to-r from-amber-400 to-rose-500 text-white text-[7px] font-black px-1 rounded-full shadow-2xs tracking-wider uppercase">
              Guide
            </span>
            <Clapperboard size={16} className="text-white" />
            <span>Videos</span>
          </Link>
        </div>
      </div>

      {/* HERO LIVE BINGO BANNER (Spacious Image 2 design) */}
      <div className="px-4 shrink-0">
        <Link
          to={`/bingo/live?room=${activeRoomId}`}
          onClick={() => {
            if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
          }}
          className="block relative rounded-2xl overflow-hidden shadow-md h-48 sm:h-52 flex flex-col items-center justify-center border border-amber-100 cursor-pointer active:scale-[0.99] transition-transform"
        >
          {/* Light gradient background — matches loading screen */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'linear-gradient(135deg, #fffbf0 0%, #fef3c7 40%, #fff8e8 70%, #fffbf0 100%)',
          }} />
          {/* Subtle radial glow in center */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 50% 60%, rgba(251,191,36,0.18) 0%, transparent 70%)',
          }} />
          {/* Top border accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 pointer-events-none" />

          {/* Scrolling marquee strip — live room names */}
          <div className="absolute top-1 left-0 right-0 overflow-hidden py-1.5 bg-amber-50/80 border-b border-amber-200/60 pointer-events-none" style={{ top: '4px' }}>
            {(() => {
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
                      🚪 {activeRoom?.room_name || 'HDASE BINGO'} &nbsp;·&nbsp; 🏆 Live Rooms &nbsp;·&nbsp; 🔥 Play Now &nbsp;·&nbsp;
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Main content: LIVE BINGO, HDASE BINGO, PLAY NOW button */}
          <div className="relative z-10 flex flex-col items-center text-center px-4 pt-6 pb-4">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              LIVE BINGO
            </span>
            {/* Split color title: HDASE dark, BINGO orange */}
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-slate-900 font-black text-4xl tracking-wide leading-none drop-shadow-xs">HDASE</span>
              <span className="text-orange-500 font-black text-4xl tracking-wide leading-none drop-shadow-xs">BINGO</span>
            </div>
            <div className="bg-orange-500 hover:bg-orange-600 text-white px-9 py-2.5 rounded-full font-black text-sm shadow-[0_4px_16px_rgba(249,115,22,0.35)] active:scale-95 transition-all">
              PLAY NOW →
            </div>
          </div>

          {/* ── Phone numbers & Support indicator — bottom corners ── */}
          <div className="absolute bottom-1.5 left-2 right-2 flex justify-between items-center pointer-events-none z-20">
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
              <span className="text-[14px] leading-none" role="img" aria-label="USA">🇺🇸</span>
              <span className="text-[10.5px] font-black leading-none tracking-tight">{supportPhoneUsa}</span>
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
              className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-400 via-cyan-400 to-teal-400 text-slate-900 border border-cyan-200/90 shadow-2xs active:scale-95 transition-all select-none"
            >
              <span className="text-xs font-black text-slate-900 leading-none">←</span>
              <span className="text-[9px] font-black tracking-widest uppercase leading-none">
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
              <span className="text-[14px] leading-none" role="img" aria-label="Ethiopia">🇪🇹</span>
              <span className="text-[10.5px] font-black leading-none tracking-tight">{formatEthPhone(supportPhoneEth)}</span>
            </button>
          </div>
        </Link>
      </div>

      {/* ══════════ LIVE STAKE TABLES SECTION (SELECT MEDEB) ══════════ */}
      <div className="px-3 pb-2">
        {/* Section title: SELECT MEDEB */}
        <div className="flex items-center justify-between mb-2 px-0.5">
          <h2 className="text-xs font-black text-slate-800 tracking-wider uppercase">
            SELECT MEDEB
          </h2>
          <button
            onClick={() => handleManualRefresh()}
            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200/60 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
            title="Refresh"
          >
            <RefreshCw size={11} className={manualRefreshing ? 'animate-spin text-amber-500' : ''} />
          </button>
        </div>

        {/* 4 Live Stake Tables Grid - Snug, compact, exactly matches reference screenshot */}
        <div className="grid grid-cols-2 gap-2.5">
          {activeStakes.map((stake, idx) => {
            const hg = homeGames[stake];
            const pool = hg?.pool || 0;
            const players = hg?.players || 0;
            const isCalling = hg?.status === 'calling';
            const timeLeft = homeTimeLeft[stake] || 0;
            const isCountingDown = hg?.status === 'waiting' && players >= 2 && timeLeft > 0 && timeLeft <= 120;
            const isStarting = hg?.status === 'waiting' && players >= 2 && timeLeft === 0 && hg?.start_at && (new Date(hg.start_at).getTime() <= Date.now() + 4000);
            const isLiveCalling = isCalling || isStarting;
            const displayPool = pool > 0 ? pool : (players >= 2 ? Math.floor(players * stake * (players >= 3 ? 0.8 : 1)) : 0);

            const THEMES = [
              { gradient: 'from-[#2979ff] to-[#1565c0]' }, // Blue
              { gradient: 'from-[#00c853] to-[#009624]' }, // Green
              { gradient: 'from-[#ab47bc] to-[#7b1fa2]' }, // Purple
              { gradient: 'from-[#ff2a55] to-[#d50000]' }, // Red
            ];

            const theme = THEMES[idx % THEMES.length];

            const handleJoin = () => {
              if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
              navigate(`/bingo/live?stake=${stake}&room=${activeRoomId}`);
            };

            return (
              <div
                key={stake}
                onClick={handleJoin}
                className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-slate-100/90 overflow-hidden flex flex-col cursor-pointer active:scale-[0.98] transition-all"
              >
                {/* Header with vibrant gradient (exact height ~64px, snug & centered) - Displays DERASH */}
                <div
                  className={`h-16 bg-gradient-to-r ${theme.gradient} flex items-center justify-center relative rounded-t-2xl`}
                >
                  <span className="text-white font-black text-3xl tracking-tight drop-shadow-xs select-none">
                    {displayPool || 0}
                  </span>
                  <div className="absolute top-2 right-2 bg-white/25 backdrop-blur-xs text-white text-[8.5px] font-black px-1.5 py-0.5 rounded tracking-wider select-none">
                    ETB
                  </div>
                </div>

                {/* 2-Column Stats Row: PLAYERS and STATUS (Clickable as part of the card) */}
                <div className="px-3 py-2 flex items-center justify-around text-center border-b border-slate-50 bg-white select-none">
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">PLAYERS</span>
                    <span className="text-[11px] font-black text-emerald-500 mt-0.5">{players}</span>
                  </div>
                  <div className="w-px h-6 bg-slate-100" />
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">STATUS</span>
                    <span className={`text-[11px] font-black mt-0.5 ${
                      isLiveCalling
                        ? 'text-emerald-500 animate-pulse'
                        : isCountingDown
                        ? 'text-amber-500'
                        : 'text-orange-400'
                    }`}>
                      {isLiveCalling ? 'Calling...' : isCountingDown ? `${timeLeft}s...` : 'Waiting...'}
                    </span>
                  </div>
                </div>

                {/* Bottom Action Button: Displays STAKE amount */}
                <div className="p-2 pt-1.5 bg-white">
                  <button
                    type="button"
                    className="w-full bg-[#eef3f9] hover:bg-[#e2eaf5] text-slate-800 font-black py-2 rounded-xl text-xs transition-all shadow-2xs border border-slate-200/60 flex items-center justify-center pointer-events-none"
                  >
                    {stake} ETB
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
