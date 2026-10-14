import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import { Gift, ArrowDownToLine, Share2, PlusCircle, Info, MessageCircle, DoorOpen, Users, Gamepad2, RefreshCw, ChevronDown, Clapperboard } from 'lucide-react';
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
  const { user, language, rooms, fetchRooms, subscribeToRooms } = useGameStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [homeGames, setHomeGames] = useState<Record<number, { pool: number; start_at?: string; status: string; players: number }>>({});
  const [homeTimeLeft, setHomeTimeLeft] = useState<Record<number, number>>({});
  const [announcement, setAnnouncement] = useState<{ message: string; maxViews: number } | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const announcementShownRef = useRef(false);

  // Manual refresh spinner
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [homeRoomSortFilter, setHomeRoomSortFilter] = useState<'all' | 'most_players' | 'most_games' | 'newest'>('all');
  const [showHomeFilterDropdown, setShowHomeFilterDropdown] = useState(false);
  const [homeRoomSearch, setHomeRoomSearch] = useState('');
  const [showHomeSearchBar, setShowHomeSearchBar] = useState(false);

  // Support banner state
  const [showSupportBanner, setShowSupportBanner] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play popup sound using Web Audio API
  const playPopSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(600, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.3);
    } catch { /* ignore if audio blocked */ }
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

  // Show banner 2s after each visit to home
  useEffect(() => {
    if (location.pathname !== '/') return;
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setShowSupportBanner(false);

    bannerTimerRef.current = setTimeout(() => {
      setShowSupportBanner(true);
      sessionStorage.setItem('support_banner_ts', String(Date.now()));
      playPopSound();
    }, 2000);

    return () => { if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current); };
  }, [location.pathname]);

  useEffect(() => {
    let isMounted = true;

    const fetchPools = async () => {
      const { data } = await supabase.from('bingo_games').select('id, stake, prize_pool, start_at, status').in('status', ['waiting', 'calling']);
      if (data && isMounted) {
        const p: Record<number, any> = {};
        data.forEach(g => { p[g.stake] = { pool: g.prize_pool, start_at: g.start_at, status: g.status, players: 0, _id: g.id }; });

        const ids = data.map(g => g.id);
        if (ids.length > 0) {
          const { data: playerRows } = await supabase
            .from('bingo_players')
            .select('game_id, telegram_id')
            .in('game_id', ids);
          if (playerRows) {
            const uniquePlayersMap: Record<string, Set<string>> = {};
            playerRows.forEach((r: any) => {
              if (!uniquePlayersMap[r.game_id]) uniquePlayersMap[r.game_id] = new Set();
              uniquePlayersMap[r.game_id].add(r.telegram_id);
            });
            data.forEach(g => {
              if (p[g.stake]) p[g.stake].players = uniquePlayersMap[g.id] ? uniquePlayersMap[g.id].size : 0;
            });
          }
        }
        setHomeGames(p);
      }
    };
    fetchPools();

    const ch = supabase.channel('home_pools_root')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_games' }, () => {
        if (isMounted) fetchPools();
      })
      .subscribe();

    return () => { isMounted = false; supabase.removeChannel(ch); };
  }, []);

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

  // ---- ANNOUNCEMENT POPUP LOGIC ----
  useEffect(() => {
    if (announcementShownRef.current) return;
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    const API_URL_LOCAL = import.meta.env.VITE_API_URL || '/api';
    fetch(`${API_URL_LOCAL}/player/support-contact`, {
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }
    })
      .then(r => r.json())
      .then(data => {
        const msg = data.announcement_message || '';
        const maxViews = typeof data.announcement_max_views === 'number' ? data.announcement_max_views : 2;
        if (!msg.trim()) return;
        const storageKey = `ann_views_${msg.slice(0, 20)}`;
        const viewCount = parseInt(localStorage.getItem(storageKey) || '0', 10);
        if (viewCount < maxViews) {
          localStorage.setItem(storageKey, String(viewCount + 1));
          setAnnouncement({ message: msg, maxViews });
          setShowAnnouncement(true);
          announcementShownRef.current = true;
        }
      })
      .catch(() => {});
  }, []);
  // ----------------------------------

  const handleHelp = async () => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    const API_URL_H = import.meta.env.VITE_API_URL || '/api';
    try {
      const res = await fetch(`${API_URL_H}/player/support-contact`, {
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }
      });
      const data = await res.json();
      const username = data.username || 'hdasebingo_admin';
      const url = `https://t.me/${username.replace('@', '')}`;
      if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
        WebApp.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const initial = user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'U';
  const formatMoney = (amount: number | undefined) => (amount || 0).toLocaleString('en-US');

  return (
    <div className="flex flex-col min-h-screen pb-20 space-y-4">

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
        <Link to="/deposit" className="flex flex-col items-center justify-center space-y-1 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 py-2.5 rounded-xl font-bold text-[11px] shadow-sm transition-colors">
          <PlusCircle size={18} />
          <span>{t[language].home.deposit}</span>
        </Link>
        <Link to="/withdraw" className="flex flex-col items-center justify-center space-y-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-bold text-[11px] shadow-sm transition-colors">
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
        <Link to="/help-videos" className="flex flex-col items-center justify-center space-y-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-violet-600 dark:text-violet-400 py-2.5 rounded-xl font-bold text-[11px] shadow-sm transition-colors">
          <Clapperboard size={18} />
          <span>Videos</span>
        </Link>
      </div>

      {/* ACTIVE GAMES / LIVE BINGO BANNER */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-2 gap-1.5 min-h-[26px]">
          <h2 className="font-bold text-slate-500 dark:text-slate-400 tracking-wider text-xs shrink-0">
            {t[language].home.activeGames}
          </h2>

          {/* Support pill in the gap between ACTIVE GAMES and Help */}
          {showSupportBanner && (
            <div className="flex items-center bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700/60 rounded-full py-0.5 px-2 shadow-sm">
              <button
                onClick={() => { setShowSupportBanner(false); navigate('/support'); }}
                className="flex items-center gap-1 active:opacity-75 transition-opacity"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <MessageCircle size={12} className="text-violet-600 dark:text-violet-400 shrink-0" />
                <span className="text-violet-800 dark:text-violet-300 font-bold text-[10.5px] leading-tight truncate">
                  {t[language].home.supportBanner}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSupportBanner(false); }}
                className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold leading-none shrink-0"
              >
                ×
              </button>
            </div>
          )}

          <button onClick={handleHelp} className="text-blue-500 flex items-center space-x-1 text-xs font-semibold shrink-0">
            <Info size={14} />
            <span>{t[language].home.help}</span>
          </button>
        </div>

        <Link to="/bingo/live" className="block relative rounded-2xl overflow-hidden shadow-sm h-52 bg-gradient-to-br from-[#1a1a3e] to-[#0d0d1f] flex flex-col items-center justify-center border border-indigo-900/50">
          <div className="absolute inset-0 opacity-20">
            <div className="grid grid-cols-10 gap-2 p-3 h-full">
              {Array.from({ length: 40 }).map((_, i) => <div key={i} className="bg-white rounded-sm opacity-50" />)}
            </div>
          </div>
          <div className="relative z-10 flex flex-col items-center text-center">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-1" /> {t[language].home.liveBingo}
            </span>
            <span className="text-yellow-400 font-black text-3xl mb-1">{t[language].home.joinNextGame}</span>
            <span className="text-white/60 text-xs font-semibold mb-4">{t[language].home.pickCartela}</span>
            <div className="bg-yellow-400 text-yellow-950 px-8 py-2 rounded-full font-black text-sm shadow-[0_0_15px_rgba(250,204,21,0.4)]">
              {t[language].home.openCartela}
            </div>
          </div>
        </Link>
      </div>

      {/* ══════════ ROOMS SECTION ══════════ */}
      <div className="px-4 flex-1" onClick={() => showHomeFilterDropdown && setShowHomeFilterDropdown(false)}>
        {/* Section header */}
        <div className="flex items-center justify-between mb-2">
          {/* Left: icon + title */}
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <DoorOpen size={14} className="text-white" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 dark:text-slate-100 text-sm leading-tight">BINGO ROOMS</h2>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold leading-none">
                {rooms.length > 0 ? `${rooms.length} active room${rooms.length !== 1 ? 's' : ''} available` : 'No rooms yet'}
              </p>
            </div>
          </div>

          {/* Right: Search icon + Filter button */}
          <div className="flex items-center space-x-1.5">
            {/* Search icon — parallel to BINGO ROOMS title */}
            <button
              onClick={e => { e.stopPropagation(); setShowHomeSearchBar(v => !v); if (showHomeSearchBar) setHomeRoomSearch(''); }}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center active:scale-95 transition-all shadow-sm ${
                showHomeSearchBar || homeRoomSearch
                  ? 'bg-indigo-500 border-indigo-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2.5"/>
                <path d="m21 21-4.35-4.35" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Advanced Filter Button */}
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setShowHomeFilterDropdown(v => !v); }}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold active:scale-95 transition-all shadow-sm ${
                  homeRoomSortFilter !== 'all'
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>
                  {homeRoomSortFilter === 'all' ? '🔽' : homeRoomSortFilter === 'most_players' ? '👥' : homeRoomSortFilter === 'most_games' ? '🎮' : '✨'}
                </span>
                <span>{homeRoomSortFilter === 'all' ? 'Filter' : homeRoomSortFilter === 'most_players' ? 'Players' : homeRoomSortFilter === 'most_games' ? 'Games' : 'Newest'}</span>
                <ChevronDown size={11} className={showHomeFilterDropdown ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>

              {showHomeFilterDropdown && (
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700 overflow-hidden min-w-[175px]">
                  <div className="px-3 pt-2.5 pb-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort Rooms By</p>
                  </div>
                  {[
                    { key: 'all', label: 'All Rooms', icon: '🏠' },
                    { key: 'most_players', label: 'Most Players', icon: '👥' },
                    { key: 'most_games', label: 'Most Games', icon: '🎮' },
                    { key: 'newest', label: 'Newest Rooms', icon: '✨' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setHomeRoomSortFilter(opt.key as typeof homeRoomSortFilter); setShowHomeFilterDropdown(false); }}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-left transition-colors ${
                        homeRoomSortFilter === opt.key
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-base leading-none">{opt.icon}</span>
                      <span className="text-xs font-bold">{opt.label}</span>
                      {homeRoomSortFilter === opt.key && <span className="ml-auto text-indigo-500 text-xs font-black">✓</span>}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2">
                    <button
                      onClick={() => { handleManualRefresh(); setShowHomeFilterDropdown(false); }}
                      className="w-full flex items-center justify-center space-x-2 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-bold active:scale-95 transition-all hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <RefreshCw size={12} className={manualRefreshing ? 'animate-spin text-indigo-500' : ''} />
                      <span>Refresh Rooms</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible search bar — shown only when search icon is tapped */}
        {showHomeSearchBar && (
          <div className="mb-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200 transition-all">
              <svg className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2.5"/>
                <path d="m21 21-4.35-4.35" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <input
                autoFocus
                type="text"
                value={homeRoomSearch}
                onChange={e => setHomeRoomSearch(e.target.value)}
                placeholder="Search rooms by name..."
                className="flex-1 bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none"
              />
              {homeRoomSearch && (
                <button onClick={() => setHomeRoomSearch('')} className="text-slate-400 hover:text-slate-600 ml-1 text-sm leading-none">×</button>
              )}
            </div>
          </div>
        )}

        {/* Filter chips row */}
        <div className="flex space-x-1.5 overflow-x-auto mb-3" style={{ scrollbarWidth: 'none' }}>
          {[
            { key: 'all', label: 'All Rooms', icon: '🏠' },
            { key: 'most_players', label: 'Most Players', icon: '👥' },
            { key: 'most_games', label: 'Most Games', icon: '🎮' },
            { key: 'newest', label: 'Newest', icon: '✨' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setHomeRoomSortFilter(opt.key as typeof homeRoomSortFilter)}
              className={`shrink-0 flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold border active:scale-95 transition-all ${
                homeRoomSortFilter === opt.key
                  ? 'bg-indigo-500 border-indigo-500 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Room cards — 2-column grid (only real rooms from DB, zero loading delay) */}
        {(() => {
          const filteredHomeRooms = [...rooms]
            .filter(r => !homeRoomSearch.trim() || r.room_name.toLowerCase().includes(homeRoomSearch.trim().toLowerCase()))
            .sort((a, b) => {
              if (homeRoomSortFilter === 'most_players') return (b.total_players || 0) - (a.total_players || 0);
              if (homeRoomSortFilter === 'most_games') return (b.total_games || 0) - (a.total_games || 0);
              return 0;
            });
          return filteredHomeRooms.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
                <DoorOpen size={28} className="text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-xs font-black text-slate-500 dark:text-slate-400">
                {homeRoomSearch.trim() ? `No rooms matching "${homeRoomSearch}"` : 'No active rooms yet'}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {homeRoomSearch.trim() ? 'Try a different search term' : 'Rooms will appear here once agents create them'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredHomeRooms.map((room, idx) => {
                const gradient = ROOM_GRADIENTS[idx % ROOM_GRADIENTS.length];
                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      fetch(`${API_URL}/player/rooms/${room.id}/enter`, { method: 'POST' }).catch(() => {});
                      navigate(`/bingo/live?room=${room.id}`);
                    }}
                    className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col cursor-pointer active:scale-95 transition-all"
                  >
                    {/* Gradient header with room name */}
                    <div className={`h-16 bg-gradient-to-br ${gradient} flex flex-col items-center justify-center relative px-2 text-center`}>
                      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-300 animate-pulse shadow-sm" />
                      <span className="text-white font-black text-sm drop-shadow-sm leading-tight line-clamp-2 px-1">
                        {room.room_name}
                      </span>
                    </div>

                    {/* Players / Total Games — 2 columns */}
                    <div className="w-full bg-slate-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 flex h-[38px] shrink-0">
                      <div className="flex-1 flex flex-col items-center justify-center border-r border-gray-100 dark:border-slate-800">
                        <span className="text-slate-400 dark:text-slate-500 text-[8px] font-bold uppercase tracking-wider">Players</span>
                        <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">{room.total_players}</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <span className="text-slate-400 dark:text-slate-500 text-[8px] font-bold uppercase tracking-wider">Total Games</span>
                        <span className="text-[11px] font-black text-violet-600 dark:text-violet-400">{room.total_games}</span>
                      </div>
                    </div>

                    {/* Join Room button */}
                    <div className="p-2 text-center">
                      <div className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-2 rounded-lg text-xs transition-colors flex items-center justify-center">
                        Join Room
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      {/* ══════════════════════════════════ */}

    </div>
  );
}
