import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import { Gift, ArrowDownToLine, Share2, PlusCircle, Info, DoorOpen, Users, Gamepad2, RefreshCw, ChevronDown, Clapperboard } from 'lucide-react';
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
  const [supportPhoneUsa, setSupportPhoneUsa] = useState('+1 (984) 378-9510');
  const [supportPhoneEth, setSupportPhoneEth] = useState('+251999992524');

  const formatEthPhone = (phone: string) => {
    if (!phone) return '+251999992524';
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

        if (announcementShownRef.current) return;
        const msg = data?.announcement_message || '';
        const maxViews = typeof data?.announcement_max_views === 'number' ? data.announcement_max_views : 2;
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
        <Link
          to="/help-videos"
          className="relative group flex flex-col items-center justify-center space-y-1 bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white py-2.5 rounded-xl font-black text-[11px] shadow-md shadow-violet-500/30 active:scale-95 transition-all overflow-hidden border border-violet-400/40"
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

      {/* LIVE BINGO BANNER */}
      <div className="px-4">
        <Link to="/bingo/live" className="block relative rounded-2xl overflow-hidden shadow-md h-52 flex flex-col items-center justify-center border border-amber-100">
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
                navigate('/support');
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
                {(() => {
                  const userInvitedRoomId = (typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null) || (user as any)?.room_id || null;
                  const count = rooms.filter(r => !r.is_private || (userInvitedRoomId && r.id === userInvitedRoomId)).length;
                  return count > 0 ? `${count} active room${count !== 1 ? 's' : ''} available` : 'No rooms yet';
                })()}
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
          // localStorage always has the latest scanned room — prioritize it over DB value
          const userInvitedRoomId = (typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null) || (user as any)?.room_id || null;

          const filteredHomeRooms = [...rooms]
            .filter(r => !r.is_private || (userInvitedRoomId && r.id === userInvitedRoomId))
            .filter(r => !homeRoomSearch.trim() || r.room_name.toLowerCase().includes(homeRoomSearch.trim().toLowerCase()))
            .sort((a, b) => {
              // 1. User's invited room gets TOP priority #1 position!
              const aInv = Boolean(userInvitedRoomId && a.id === userInvitedRoomId);
              const bInv = Boolean(userInvitedRoomId && b.id === userInvitedRoomId);
              if (aInv !== bInv) return aInv ? -1 : 1;

              // 2. Pinned rooms next
              if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) {
                return b.is_pinned ? 1 : -1;
              }
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
              {filteredHomeRooms.map((room) => {
                const isInvitedRoom = Boolean(userInvitedRoomId && room.id === userInvitedRoomId);
                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      fetch(`${API_URL}/player/rooms/${room.id}/enter`, { method: 'POST' }).catch(() => {});
                      navigate(`/bingo/live?room=${room.id}`);
                    }}
                    className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border overflow-hidden flex flex-col cursor-pointer active:scale-95 transition-all ${
                      isInvitedRoom
                        ? 'border-orange-500 ring-2 ring-orange-400/50 shadow-orange-500/10'
                        : 'border-gray-100 dark:border-slate-800'
                    }`}
                  >
                    {/* Header for room card */}
                    <div className="h-16 bg-black flex flex-col items-center justify-center relative px-2 text-center">
                      {isInvitedRoom ? (
                        <div className="absolute top-2 left-2 flex items-center justify-center bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] w-5 h-5 rounded-full shadow-sm">
                          <span>⭐</span>
                        </div>
                      ) : room.is_pinned ? (
                        <div className="absolute top-2 left-2 flex items-center justify-center bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 text-[10px] w-5 h-5 rounded-full shadow-sm">
                          <span>📌</span>
                        </div>
                      ) : null}
                      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm" />
                      <span className="text-white font-black text-sm leading-tight line-clamp-2 px-1">
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
