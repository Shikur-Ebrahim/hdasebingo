import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Gift, RefreshCw, Users, Clock, Trophy, Volume2, VolumeX, RotateCcw, LayoutGrid, Wand2, Hand, DoorOpen, Gamepad2, Flame } from "lucide-react";
import WebApp from "@twa-dev/sdk";
import { supabase } from "../lib/supabase";
import { useGameStore, Room } from "../store/gameStore";
import { t } from '../lib/translations';

const API = import.meta.env.VITE_API_URL || "/api";

interface BGame {
  id: string; stake: number; prize_pool: number; total_players?: number;
  status: "waiting" | "calling" | "finished";
  called_numbers: number[];
  winner_cartela: number | null; winner_telegram_id: string | null;
  winner_first_name: string | null; winner_prize: number | null;
  start_at: string; finished_at: string | null;
}

const formatGameId = (id: string | null | undefined): string => {
  if (!id) return '';
  return id.replace(/-/g, '').substring(0, 8).toUpperCase();
};
interface MyCard { cartela_number: number; card_matrix: number[][]; }
interface Celebration { winner_name: string; winner_cartela: number; winner_prize: number; winner_matrix: number[][] | null; iWon: boolean; called: number[]; winners_list?: {first_name: string, cartela_number: number, card_matrix: number[][]}[] }

const hdrs = () => ({ "Content-Type": "application/json", "x-telegram-init-data": WebApp?.initData ?? "" });

const ROW_COLORS = [
  "from-blue-500 to-blue-700","from-purple-500 to-purple-700","from-cyan-500 to-cyan-700",
  "from-red-500 to-red-700","from-orange-400 to-orange-600","from-yellow-400 to-yellow-600",
  "from-green-500 to-green-700","from-teal-500 to-teal-700","from-indigo-400 to-indigo-600",
  "from-pink-400 to-pink-600","from-violet-500 to-violet-700","from-blue-400 to-blue-600",
  "from-fuchsia-500 to-fuchsia-700","from-emerald-500 to-emerald-700","from-purple-400 to-purple-600",
];

const STAKE_OPTIONS = [
  { value: 10, label: "10 ETB", color: "from-blue-500 to-blue-700" },
  { value: 20, label: "20 ETB", color: "from-teal-500 to-teal-700" },
  { value: 50, label: "50 ETB", color: "from-purple-500 to-purple-700" },
  { value: 100, label: "100 ETB", color: "from-rose-500 to-rose-700" },
];

const ROOM_GRADIENTS = [
  'from-blue-600 via-indigo-600 to-violet-700',
  'from-emerald-500 via-teal-600 to-cyan-700',
  'from-violet-600 via-purple-600 to-fuchsia-700',
  'from-rose-500 via-pink-600 to-red-600',
  'from-amber-500 via-orange-600 to-amber-700',
  'from-cyan-500 via-sky-600 to-blue-700',
];

const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];

const LETTER_COLOR: Record<string, string> = {
  B: '#f59e0b', I: '#3b82f6', N: '#ec4899', G: '#22c55e', O: '#a855f7',
};
const LETTER_BG: Record<string, string> = {
  B: '#3b82f6', I: '#8b5cf6', N: '#ec4899', G: '#22c55e', O: '#3b82f6',
};

// Full Amharic number words for display under the call
const AMHARIC_NUM: Record<number, string> = {
  1:'አንድ', 2:'ሁለት', 3:'ሶስት', 4:'አራት', 5:'አምስት',
  6:'ስድስት', 7:'ሰባት', 8:'ስምንት', 9:'ዘጠኝ', 10:'አስር',
  11:'አስራ አንድ', 12:'አስራ ሁለት', 13:'አስራ ሶስት', 14:'አስራ አራት', 15:'አስራ አምስት',
  16:'አስራ ስድስት', 17:'አስራ ሰባት', 18:'አስራ ስምንት', 19:'አስራ ዘጠኝ', 20:'ሃያ',
  21:'ሃያ አንድ', 22:'ሃያ ሁለት', 23:'ሃያ ሶስት', 24:'ሃያ አራት', 25:'ሃያ አምስት',
  26:'ሃያ ስድስት', 27:'ሃያ ሰባት', 28:'ሃያ ስምንት', 29:'ሃያ ዘጠኝ', 30:'ሠላሳ',
  31:'ሠላሳ አንድ', 32:'ሠላሳ ሁለት', 33:'ሠላሳ ሶስት', 34:'ሠላሳ አራት', 35:'ሠላሳ አምስት',
  36:'ሠላሳ ስድስት', 37:'ሠላሳ ሰባት', 38:'ሠላሳ ስምንት', 39:'ሠላሳ ዘጠኝ', 40:'አርባ',
  41:'አርባ አንድ', 42:'አርባ ሁለት', 43:'አርባ ሶስት', 44:'አርባ አራት', 45:'አርባ አምስት',
  46:'አርባ ስድስት', 47:'አርባ ሰባት', 48:'አርባ ስምንት', 49:'አርባ ዘጠኝ', 50:'ሃምሳ',
  51:'ሃምሳ አንድ', 52:'ሃምሳ ሁለት', 53:'ሃምሳ ሶስት', 54:'ሃምሳ አራት', 55:'ሃምሳ አምስት',
  56:'ሃምሳ ስድስት', 57:'ሃምሳ ሰባት', 58:'ሃምሳ ስምንት', 59:'ሃምሳ ዘጠኝ', 60:'ስልሳ',
  61:'ስልሳ አንድ', 62:'ስልሳ ሁለት', 63:'ስልሳ ሶስት', 64:'ስልሳ አራት', 65:'ስልሳ አምስት',
  66:'ስልሳ ስድስት', 67:'ስልሳ ሰባት', 68:'ስልሳ ስምንት', 69:'ስልሳ ዘጠኝ', 70:'ሰባ',
  71:'ሰባ አንድ', 72:'ሰባ ሁለት', 73:'ሰባ ሶስት', 74:'ሰባ አራት', 75:'ሰባ አምስት',
};

const getLetter = (num: number) => BINGO_LETTERS[Math.floor((num - 1) / 15)];
const getAudioSrc = (num: number) => {
  return `/audio/bingo/bingo_${String(num).padStart(2, '0')}.mp3`;
};

// Pre-generated static Amharic MP3 files in /audio/bingo/

const getWinningCells = (matrix: number[][], called: number[]) => {
  const winCells = new Set<string>();
  if (!matrix || !called) return winCells;

  const calledSet = new Set((called || []).map(Number));
  const m = (r: number, c: number) => {
    const val = Number(matrix[r]?.[c] ?? -1);
    return val === 0 || calledSet.has(val);
  };

  // Rows
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every(c => m(r, c))) {
      for (let c = 0; c < 5; c++) winCells.add(`${r}-${c}`);
    }
  }

  // Columns
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every(r => m(r, c))) {
      for (let r = 0; r < 5; r++) winCells.add(`${r}-${c}`);
    }
  }

  // Diagonals
  if ([0, 1, 2, 3, 4].every(i => m(i, i))) {
    for (let i = 0; i < 5; i++) winCells.add(`${i}-${i}`);
  }
  if ([0, 1, 2, 3, 4].every(i => m(i, 4 - i))) {
    for (let i = 0; i < 5; i++) winCells.add(`${i}-${4 - i}`);
  }

  // Outer 4 corners (4 corner rule)
  if (m(0, 0) && m(0, 4) && m(4, 0) && m(4, 4)) {
    winCells.add('0-0'); winCells.add('0-4'); winCells.add('4-0'); winCells.add('4-4');
  }

  // Inner 4 corners (2nd corner rule / 2nd frame)
  if (m(1, 1) && m(1, 3) && m(3, 1) && m(3, 3)) {
    winCells.add('1-1'); winCells.add('1-3'); winCells.add('3-1'); winCells.add('3-3');
  }

  return winCells;
};

const getWinningPatternTitle = (matrix: number[][], called: number[]): string => {
  if (!matrix || !called) return 'BINGO!';
  const calledSet = new Set((called || []).map(Number));
  const m = (r: number, c: number) => {
    const val = Number(matrix[r]?.[c] ?? -1);
    return val === 0 || calledSet.has(val);
  };

  const isOuterCorners = m(0, 0) && m(0, 4) && m(4, 0) && m(4, 4);
  const isInnerCorners = m(1, 1) && m(1, 3) && m(3, 1) && m(3, 3);
  const isRow = [0, 1, 2, 3, 4].some(r => [0, 1, 2, 3, 4].every(c => m(r, c)));
  const isCol = [0, 1, 2, 3, 4].some(c => [0, 1, 2, 3, 4].every(r => m(r, c)));
  const isDiag = [0, 1, 2, 3, 4].every(i => m(i, i)) || [0, 1, 2, 3, 4].every(i => m(i, 4 - i));

  if (isInnerCorners && !isRow && !isCol && !isDiag) return '🎯 2ND CORNER BINGO!';
  if (isOuterCorners && !isRow && !isCol && !isDiag) return '🎯 4 CORNERS BINGO!';
  if (isInnerCorners || isOuterCorners) return '🎯 CORNER BINGO!';
  return 'BINGO!';
};

export default function BingoGame() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, fetchUser: refreshUser, subscribeToBalance, language, rooms, fetchRooms, subscribeToRooms } = useGameStore();

  const urlStake = searchParams.get("stake");
  const urlRoom = searchParams.get("room");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(urlRoom || null);
  const [selectedStake, setSelectedStake] = useState<number | null>(urlStake ? Number(urlStake) : null);
  const [roomsRefreshing, setRoomsRefreshing] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [roomSortFilter, setRoomSortFilter] = useState<'all' | 'most_players' | 'most_games' | 'newest'>('all');
  const [roomSearch, setRoomSearch] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [showStakeDropdown, setShowStakeDropdown] = useState(false);
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState<number>(150);
  const [maxCartelasPerUser, setMaxCartelasPerUser] = useState<number>(2);
  const [myCartelas, setMyCartelas] = useState<Array<{ cartela_number: number; card_matrix: number[][] }>>([]);
  const [activeCartelaIdx, setActiveCartelaIdx] = useState(0);
  const [uniquePlayers, setUniquePlayers] = useState<number>(0);
  const [previewCartela, setPreviewCartela] = useState<{ seat: number; matrix: number[][] } | null>(null);
  const [homeGames, setHomeGames] = useState<Record<number, { pool: number; start_at?: string; status: string; players: number }>>({});
  const [homeTimeLeft, setHomeTimeLeft] = useState<Record<number, number>>({});
  const [soundEnabled, setSoundEnabled] = useState(false); // default OFF
  const [volume, setVolume] = useState(1.0);
  const [autoMark, setAutoMark] = useState(true); // default: auto-mark called numbers
  const [manuallyMarked, setManuallyMarked] = useState<Set<number>>(new Set());

  // Subscribe and ensure rooms are loaded
  useEffect(() => {
    if (rooms.length === 0) {
      fetchRooms();
    }
    const unsub = subscribeToRooms();
    return () => { unsub(); };
  }, [fetchRooms, subscribeToRooms, rooms.length]);

  // Keep selectedRoomId in sync if URL query changes
  useEffect(() => {
    const r = searchParams.get("room");
    if (r) {
      setSelectedRoomId(r);
    }
  }, [searchParams]);

  const handleRefreshRooms = async () => {
    setRoomsRefreshing(true);
    try {
      await fetchRooms();
    } finally {
      setTimeout(() => setRoomsRefreshing(false), 400);
    }
  };

  const selectedRoom = rooms.find(r => r.id === selectedRoomId) || (selectedRoomId ? { id: selectedRoomId, room_name: 'Live Room', total_players: 0, total_games: 0, status: 'active' } : null);

  const handleSelectRoom = (room: Room) => {
    initWebAudio();
    fetch(`${API}/player/rooms/${room.id}/enter`, { method: 'POST', headers: hdrs() }).catch(() => {});
    setSelectedRoomId(room.id);
    setSearchParams(params => {
      params.set('room', room.id);
      return params;
    });
  };

  // User's invited/assigned room — localStorage has the LATEST scan, DB is fallback
  const userInvitedRoomId = (typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null) || (user as any)?.room_id || null;

  // Filter/sort rooms in BingoGame rooms page
  const filteredRooms = [...rooms]
    .filter(r => !r.is_private || (userInvitedRoomId && r.id === userInvitedRoomId))
    .filter(r => !roomSearch.trim() || r.room_name.toLowerCase().includes(roomSearch.trim().toLowerCase()))
    .sort((a, b) => {
      // 1. User's invited/assigned room ALWAYS first
      const aInv = Boolean(userInvitedRoomId && a.id === userInvitedRoomId);
      const bInv = Boolean(userInvitedRoomId && b.id === userInvitedRoomId);
      if (aInv !== bInv) return aInv ? -1 : 1;

      // 2. Pinned rooms next
      const aPinned = Boolean(a.is_pinned);
      const bPinned = Boolean(b.is_pinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      // 3. Manual filter if user picked one
      if (roomSortFilter === 'most_players') return (b.total_players || 0) - (a.total_players || 0);
      if (roomSortFilter === 'most_games') return (b.total_games || 0) - (a.total_games || 0);
      if (roomSortFilter === 'newest') return new Date((b as any).created_at || 0).getTime() - new Date((a as any).created_at || 0).getTime();

      // 4. Smart auto-sort: highest 24h commission first
      const commDiff = ((b as any).commission_24h || 0) - ((a as any).commission_24h || 0);
      if (Math.abs(commDiff) > 0.001) return commDiff;

      // 5. Then most active players
      const playerDiff = (b.total_players || 0) - (a.total_players || 0);
      if (playerDiff !== 0) return playerDiff;

      // 6. Then most total games
      return (b.total_games || 0) - (a.total_games || 0);
    });

  const BINGO_FILTER_OPTIONS = [
    { key: 'all', label: language === 'am' ? 'ሁሉም ክፍሎች' : 'All Rooms', icon: '🏠' },
    { key: 'most_players', label: language === 'am' ? 'ተጫዋቾች (ከፍተኛ)' : 'Most Players', icon: '👥' },
    { key: 'most_games', label: language === 'am' ? 'ጨዋታዎች (ከፍተኛ)' : 'Most Games', icon: '🎮' },
    { key: 'newest', label: language === 'am' ? 'አዲስ ክፍሎች' : 'Newest Rooms', icon: '✨' },
  ] as const;

  // Fetch and listen for active derash & status on stake selection screen
  useEffect(() => {
    if (selectedStake) return;
    let isMounted = true;

    const fetchPools = async () => {
      let loadedPools: any[] | null = null;
      try {
        const url = `${API}/bingo/pools${selectedRoomId ? `?room=${selectedRoomId}` : ''}`;
        const r = await fetch(url, { headers: hdrs() });
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.pools)) loadedPools = d.pools;
        }
      } catch {}

      // Resilient fallback direct to Supabase
      if (!loadedPools) {
        let q = supabase
          .from('bingo_games')
          .select('id, stake, prize_pool, total_players, start_at, status, room_id')
          .in('status', ['waiting', 'calling']);
        if (selectedRoomId) q = q.eq('room_id', selectedRoomId);
        const { data: dbGames } = await q;
        if (dbGames) {
          loadedPools = dbGames.map(g => ({
            stake: g.stake,
            prize_pool: g.prize_pool,
            start_at: g.start_at,
            status: g.status,
            unique_players: g.total_players || 0,
          }));
        }
      }

      if (loadedPools && isMounted) {
        const p: Record<number, any> = {};
        loadedPools.forEach((g: any) => {
          p[Number(g.stake)] = {
            pool: g.prize_pool,
            start_at: g.start_at,
            status: g.status,
            players: g.unique_players,
          };
        });
        setHomeGames(p);
      }
    };
    fetchPools();

    // Listen to table changes so home page updates in real-time
    const ch = supabase.channel('home_pools')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_games' }, () => {
        if (isMounted) fetchPools();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bingo_players' }, () => {
        if (isMounted) fetchPools();
      })
      .subscribe();

    return () => { isMounted = false; supabase.removeChannel(ch); };
  }, [selectedStake, selectedRoomId]);

  // Tick timer for home screen
  useEffect(() => {
    if (selectedStake) return;
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
  }, [selectedStake, homeGames]);
  const [lastCallNum, setLastCallNum] = useState<number | null>(null);
  const [callAnim, setCallAnim] = useState(false);
  const callAudioRef = useRef<HTMLAudioElement | null>(null);
  const specialAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferCache = useRef<Map<string, AudioBuffer>>(new Map());
  const activeCallSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeSpecialSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Keep AudioContext resumed and mobile media pipeline unlocked on any touch
  const unlockAudio = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current && AC) {
        audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        // Play silent 1-sample buffer to permanently unlock audio on Android/iOS
        if (ctx.state === 'running') {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
        }
      }
    } catch(e) {}
  }, []);

  const initWebAudio = unlockAudio;

  // Listen continuously on window touch/click so audio never gets suspended during game
  useEffect(() => {
    const handleGesture = () => unlockAudio();
    window.addEventListener('pointerdown', handleGesture, { passive: true });
    window.addEventListener('touchstart', handleGesture, { passive: true });
    window.addEventListener('touchend', handleGesture, { passive: true });
    window.addEventListener('click', handleGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
      window.removeEventListener('touchend', handleGesture);
      window.removeEventListener('click', handleGesture);
    };
  }, [unlockAudio]);

  // ── RAW ARRAYBUFFER CACHE: fetched at startup ──────────────────
  const rawBufferCache = useRef<Map<string, ArrayBuffer>>(new Map());

  useEffect(() => {
    let cancel = false;
    const preload = async () => {
      const allSrcs = [
        ...Array.from({ length: 75 }, (_, i) => getAudioSrc(i + 1)),
        '/audio/bingo/bingo_win.mp3',
      ];
      for (let i = 0; i < allSrcs.length; i += 4) {
        if (cancel) break;
        await Promise.all(
          allSrcs.slice(i, i + 4).map(async (src) => {
            if (rawBufferCache.current.has(src)) return;
            try {
              const res = await fetch(src);
              if (res.ok) rawBufferCache.current.set(src, await res.arrayBuffer());
            } catch {}
          })
        );
        await new Promise(r => setTimeout(r, 40));
      }
    };
    preload();
    return () => { cancel = true; };
  }, []);

  // Cross-browser safe decodeAudioData (handles both Promise & Callback signatures)
  const decodeAudio = useCallback((ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> => {
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        const res = ctx.decodeAudioData(
          buffer,
          (buf) => { if (!settled) { settled = true; resolve(buf); } },
          (err) => { if (!settled) { settled = true; reject(err); } }
        );
        if (res && typeof (res as any).then === 'function') {
          (res as any).then(
            (buf: AudioBuffer) => { if (!settled) { settled = true; resolve(buf); } },
            (err: any) => { if (!settled) { settled = true; reject(err); } }
          );
        }
      } catch (e) {
        if (!settled) { settled = true; reject(e); }
      }
    });
  }, []);

  // ── CORE WEBAUDIO PLAYER ────────────────────────
  const playViaWebAudio = useCallback(async (src: string, customGain?: number, isSpecial: boolean = false): Promise<boolean> => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();

      // If playing special (bingo_win), stop any active caller audio immediately so they NEVER overlap!
      if (isSpecial) {
        if (activeCallSourceRef.current) {
          try {
            activeCallSourceRef.current.stop();
            activeCallSourceRef.current.disconnect();
          } catch {}
          activeCallSourceRef.current = null;
        }
      } else {
        if (activeCallSourceRef.current) {
          try {
            activeCallSourceRef.current.stop();
            activeCallSourceRef.current.disconnect();
          } catch {}
          activeCallSourceRef.current = null;
        }
      }

      let audioBuf = audioBufferCache.current.get(src);
      if (!audioBuf) {
        let raw = rawBufferCache.current.get(src);
        if (!raw) {
          const res = await fetch(src);
          if (!res.ok) return false;
          raw = await res.arrayBuffer();
          rawBufferCache.current.set(src, raw);
        }
        audioBuf = await decodeAudio(ctx, raw.slice(0));
        audioBufferCache.current.set(src, audioBuf);
      }

      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      gainNode.gain.value = customGain !== undefined ? customGain : Math.min(2.0, volume * 1.5);
      source.buffer = audioBuf;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (isSpecial) {
        activeSpecialSourceRef.current = source;
      } else {
        activeCallSourceRef.current = source;
      }

      source.onended = () => {
        if (isSpecial && activeSpecialSourceRef.current === source) activeSpecialSourceRef.current = null;
        if (!isSpecial && activeCallSourceRef.current === source) activeCallSourceRef.current = null;
      };

      source.start(0);
      return true;
    } catch(e) {
      console.warn('WebAudio error:', e);
      return false;
    }
  }, [volume, decodeAudio]);

  // ── CALLER SOUND ─────────────────────────────────────────────────────────────
  const playCallAudio = useCallback((num: number) => {
    if (!soundEnabled) return;
    const cleanNum = Number(num);
    if (!cleanNum || isNaN(cleanNum) || cleanNum < 1 || cleanNum > 75) return;

    setLastCallNum(cleanNum);
    setCallAnim(false);
    setTimeout(() => setCallAnim(true), 20);

    const src = getAudioSrc(cleanNum);
    unlockAudio();

    // 1. If WebAudio context is running, use WebAudio directly (fast, zero lag, reliable on mobile)
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      playViaWebAudio(src, undefined, false);
      return;
    }

    // 2. Otherwise play via standard HTML5 Audio with fallback to WebAudio
    try {
      if (callAudioRef.current) {
        callAudioRef.current.pause();
      }
      const audio = new Audio(src);
      callAudioRef.current = audio;
      audio.volume = Math.min(1.0, Math.max(0.0, volume));
      audio.play().catch(() => {
        playViaWebAudio(src, undefined, false);
      });
    } catch {
      playViaWebAudio(src, undefined, false);
    }
  }, [soundEnabled, volume, unlockAudio, playViaWebAudio]);

  // ── CELEBRATION ──────────────────────────────────────────────────────────────────────────
  // Plays ONLY the "Bingo!" announcement voice (/audio/bingo/bingo_win.mp3).
  // Immediately stops all other sounds so Bingo! is crystal clear with zero overlap.
  const playSpecial = useCallback((name: string = 'bingo_win') => {
    const src = `/audio/bingo/${name}.mp3`;
    unlockAudio();

    // Stop caller voice immediately so "Bingo!" is loud, clear, and never overlaps
    if (activeCallSourceRef.current) {
      try {
        activeCallSourceRef.current.stop();
        activeCallSourceRef.current.disconnect();
      } catch {}
      activeCallSourceRef.current = null;
    }
    try {
      if (callAudioRef.current) {
        callAudioRef.current.pause();
        callAudioRef.current.currentTime = 0;
      }
    } catch {}

    // Priority 1: WebAudio
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      playViaWebAudio(src, 1.8, true);
      return;
    }

    // Priority 2: HTML Audio
    try {
      const audio = new Audio(src);
      specialAudioRef.current = audio;
      audio.volume = 1.0;
      audio.play().catch(() => {
        playViaWebAudio(src, 1.8, true);
      });
    } catch {
      playViaWebAudio(src, 1.8, true);
    }
  }, [unlockAudio, playViaWebAudio]);



  useEffect(() => {
    if (!user?.telegram_id) return;
    const unsub = subscribeToBalance();
    return () => unsub();
  }, [subscribeToBalance, user?.telegram_id]);

  const [game, setGame] = useState<BGame | null>(null);
  const [taken, setTaken] = useState<number[]>([]);
  const [myCard, setMyCard] = useState<MyCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebrationRef = useRef<Celebration | null>(null);
  celebrationRef.current = celebration;
  const celebratedGamesRef = useRef<Set<string>>(new Set());
  const gameFinishedRef = useRef(false);
  const gameIdRef = useRef<string | null>(null);
  const prevCalledLenRef = useRef(0);
  const hadCartelasRef = useRef(false);
  const celebrationTimerRef = useRef<any>(null);
  const cartelaMatricesRef = useRef<Record<number, number[][]>>({});
  const fetchStateRef = useRef<() => void>(() => {});
  const refreshUserRef = useRef<() => void>(() => {});

  // Instant celebration trigger — displays popup immediately in 0ms without waiting for network!
  const triggerCelebration = useCallback((finGame: any) => {
    if (!finGame || finGame.status !== 'finished') return;
    if (celebratedGamesRef.current.has(finGame.id)) return;
    if (!finGame.winner_cartela && finGame.winner_first_name !== 'REMATCH') return;

    // Guard: ignore stale games > 6s old
    if (finGame.finished_at && (Date.now() - new Date(finGame.finished_at).getTime()) > 6000) {
      celebratedGamesRef.current.add(finGame.id);
      return;
    }

    celebratedGamesRef.current.add(finGame.id);
    if (celebratedGamesRef.current.size > 20) {
      const [oldest] = celebratedGamesRef.current;
      celebratedGamesRef.current.delete(oldest);
    }

    // Play celebration sound
    playSpecial('bingo_win');

    // Start guaranteed 1-second auto-dismiss timer that CANNOT be cancelled or reset by background fetches or re-renders!
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = setTimeout(() => {
      celebrationTimerRef.current = null;
      setCelebration(null);
      setMyCard(null);
      setMyCartelas([]);
      setActiveCartelaIdx(0);
      setTaken([]);
      setGame(prev => prev ? { ...prev, status: 'waiting', called_numbers: [], total_players: 0, prize_pool: 0 } : prev);
      fetchStateRef.current();
      refreshUserRef.current();
    }, 1000);

    if (finGame.winner_first_name === 'REMATCH') {
      setCelebration({
        winner_name: 'REMATCH',
        winner_cartela: 0,
        winner_prize: 0,
        winner_matrix: null,
        iWon: false,
        called: [...(finGame.called_numbers || [])],
      });
      return;
    }

    const iWon = finGame.winner_telegram_id === String(user?.telegram_id);
    const localCard = myCartelas.find(c => c.cartela_number === finGame.winner_cartela)?.card_matrix;
    const cachedCard = finGame.winner_matrix || (finGame.winner_cartela ? cartelaMatricesRef.current[finGame.winner_cartela] : null);
    const winningMatrix = localCard || cachedCard || null;

    // Render celebration popup IMMEDIATELY with full tracked cartela matrix — 0ms, no loading!
    setCelebration({
      winner_name: finGame.winner_first_name || 'Player',
      winner_cartela: finGame.winner_cartela || 0,
      winner_prize: finGame.winner_prize || 0,
      winner_matrix: winningMatrix,
      iWon,
      called: [...(finGame.called_numbers || [])],
    });

    // If 2-way tie, fetch winners list in background
    if (finGame.winner_first_name && finGame.winner_first_name.includes(' & ')) {
      fetch(`${API}/bingo/winners?game_id=${finGame.id}`, { headers: hdrs() })
        .then(r => r.json())
        .then(data => {
          if (data?.winners) {
            setCelebration(prev => prev ? { ...prev, winners_list: data.winners } : prev);
          }
        }).catch(() => {});
    } else if (!winningMatrix && finGame.winner_cartela) {
      // Fallback only if not in memory: fetch winner card matrix
      fetch(`${API}/bingo/card?game_id=${finGame.id}&cartela=${finGame.winner_cartela}`, { headers: hdrs() })
        .then(r => r.json())
        .then(data => {
          if (data?.matrix) {
            setCelebration(prev => prev ? { ...prev, winner_matrix: data.matrix } : prev);
          }
        }).catch(() => {});
    }
  }, [user?.telegram_id, myCartelas, playSpecial]);

  const fetchState = useCallback(async () => {
    if (!selectedStake) return;
    setLoading(true);
    try {
      const url = `${API}/bingo/current?stake=${selectedStake}${selectedRoomId ? `&room=${selectedRoomId}` : ''}`;
      const r = await fetch(url, { headers: hdrs() });
      if (r.ok) {
        const d = await r.json();
        if (d.max_players) setMaxPlayers(Number(d.max_players));
        if (d.max_cartelas_per_user) setMaxCartelasPerUser(Number(d.max_cartelas_per_user));
        if (d.my_cartelas) setMyCartelas(d.my_cartelas);
        if (d.unique_players !== undefined) setUniquePlayers(Number(d.unique_players));
        if (d.cartela_matrices) {
          cartelaMatricesRef.current = { ...cartelaMatricesRef.current, ...d.cartela_matrices };
        }
        
        // Guarantee celebration popup fires even if WebSocket was delayed or dropped!
        if (d.last_finished_game) {
          triggerCelebration(d.last_finished_game);
        }

        if (d.game) {
          if (d.game.status === 'finished') {
            triggerCelebration(d.game);
          }
          setGame(d.game);
          setTaken(d.taken_cartelas ?? []);
          setMyCard(d.my_card ?? null);
          if (d.game.id !== gameIdRef.current) {
            gameIdRef.current = d.game.id;
            prevCalledLenRef.current = d.game.called_numbers?.length || 0;
          }
        }
      }
    } catch { } finally { setLoading(false); }
  }, [selectedStake, selectedRoomId, triggerCelebration]);
  fetchStateRef.current = fetchState;
  refreshUserRef.current = refreshUser;

  useEffect(() => { if (selectedStake) fetchState(); }, [selectedStake, fetchState]);

  useEffect(() => {
    if (!selectedStake) return;
    const ch = supabase.channel(`bingo-rt-${selectedStake}-${Date.now()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bingo_games" }, ({ new: g }) => {
        if (Number(g.stake) === selectedStake && (!selectedRoomId || g.room_id === selectedRoomId)) {
          const bg = g as BGame;
          if (bg.status === 'finished') {
            triggerCelebration(bg);
          } else {
            setGame(bg);
          }
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bingo_games" }, () => {
        fetchState();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bingo_players" }, ({ new: p }) => {
        const np = p as { game_id: string; cartela_number: number; card_matrix?: number[][]; telegram_id: string };
        if (np.game_id === gameIdRef.current) {
          if (np.cartela_number && np.card_matrix) {
            cartelaMatricesRef.current[np.cartela_number] = np.card_matrix;
          }
          setTaken(prev => prev.includes(np.cartela_number) ? prev : [...prev, np.cartela_number]);
          // Re-fetch to get accurate unique_players count (same user may buy multiple cartelas)
          fetchState();
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedStake, selectedRoomId, fetchState, triggerCelebration]);

  useEffect(() => {
    if (!game || game.status !== "waiting") return;
    const update = () => {
      if (document.visibilityState === 'hidden') return;
      const left = Math.max(0, Math.ceil((new Date(game.start_at).getTime() - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        fetchState();
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [game?.status, game?.start_at, fetchState]);

  // Fast polling fallback: keeps game state sync'd with zero delay (1s interval)
  useEffect(() => {
    if (!selectedStake) return;
    const pollId = setInterval(() => {
      if (game?.status === 'calling' || (game?.status === 'waiting' && timeLeft <= 2)) {
        fetchState();
      }
    }, 1000);
    return () => clearInterval(pollId);
  }, [selectedStake, game?.status, timeLeft, fetchState]);

  const called = game?.called_numbers ?? [];
  const lastNum = called.length > 0 ? Number(called[called.length - 1]) : null;

  useEffect(() => {
    if (game?.status === 'calling' && called.length > prevCalledLenRef.current) {
      if (lastNum) { playCallAudio(lastNum); }
      if (WebApp?.HapticFeedback) WebApp.HapticFeedback.impactOccurred('medium');
    }
    prevCalledLenRef.current = called.length;
  }, [called.length, game?.status, lastNum, playCallAudio]);

  // Fire celebration when game finishes
  useEffect(() => {
    if (game?.status === 'finished') {
      triggerCelebration(game);
    }
  }, [game?.status, game?.id, triggerCelebration]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    };
  }, []);

  // Generate matrix client-side for preview
  const generateBingoCard = () => {
    const zones: [number, number][] = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
    const card: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
    for (let col = 0; col < 5; col++) {
      const [lo, hi] = zones[col];
      const chosen = new Set<number>();
      while (chosen.size < 5) chosen.add(Math.floor(Math.random() * (hi - lo + 1)) + lo);
      const nums = Array.from(chosen);
      for (let row = 0; row < 5; row++) card[row][col] = nums[row];
    }
    card[2][2] = 0;
    return card;
  };

  const openPreview = (seat: number) => {
    if (myCartelas.length >= maxCartelasPerUser) { setErrMsg(`Max ${maxCartelasPerUser} cartela${maxCartelasPerUser > 1 ? 's' : ''} per game`); return; }
    if (taken.includes(seat)) { setErrMsg("Taken! Pick another."); return; }
    const matrix = generateBingoCard();
    setPreviewCartela({ seat, matrix });
  };

  const joinGame = async (seat: number, matrix: number[][]) => {
    setPreviewCartela(null);
    initWebAudio();
    if (!game || game.status !== "waiting") return;
    if (myCartelas.length >= maxCartelasPerUser) { setErrMsg(`Max ${maxCartelasPerUser} cartela${maxCartelasPerUser > 1 ? 's' : ''} per game`); return; }
    if (taken.includes(seat)) { setErrMsg("Taken! Pick another."); return; }
    const bonusBal = Number(user?.bonus_balance || 0), mainBal = Number(user?.main_balance || 0);
    if (!user || bonusBal + mainBal < game.stake) { setErrMsg(`Need ${game.stake} ETB`); return; }

    setErrMsg("");
    // INSTANT 0ms OPTIMISTIC UPDATE: Turn green with ✓ immediately!
    const optimisticCard = { cartela_number: seat, card_matrix: matrix };
    setMyCartelas(prev => [...prev, optimisticCard]);
    setMyCard(optimisticCard);
    setTaken(prev => prev.includes(seat) ? prev : [...prev, seat]);
    setBuying(null);
    if (WebApp?.HapticFeedback) WebApp.HapticFeedback.notificationOccurred("success");

    const stakeAmt = game.stake;
    let nb = bonusBal, nm = mainBal;
    if (nb >= stakeAmt) { nb -= stakeAmt; } else { nm -= stakeAmt - nb; nb = 0; }
    useGameStore.setState(s => ({ user: s.user ? { ...s.user, main_balance: nm, bonus_balance: nb } : s.user }));

    // Optimistic pot calculation: pot = (total cartelas + 1) × stake
    const isFirstCartela = myCartelas.length === 0;
    const newUniquePlayers = isFirstCartela ? uniquePlayers + 1 : uniquePlayers;
    const newTotalCartelas = taken.length + 1;
    const rawPool = newTotalCartelas * stakeAmt;
    setGame(prev => prev ? { ...prev, prize_pool: newUniquePlayers < 3 ? rawPool : Math.floor(rawPool * 0.8) } : prev);

    try {
      const r = await fetch(`${API}/bingo/join`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({
          cartela_number: seat,
          stake: selectedStake,
          card_matrix: matrix,
          room_id: selectedRoomId,
          game_id: game.id,
        })
      });
      const d = await r.json();
      if (r.ok) {
        if (d.card_matrix) {
          setMyCartelas(prev => prev.map(c => c.cartela_number === seat ? { ...c, card_matrix: d.card_matrix } : c));
        }
        if (d.unique_players !== undefined) setUniquePlayers(Number(d.unique_players));
        if (d.start_at || d.prize_pool) {
          setGame(prev => prev ? {
            ...prev,
            start_at: d.start_at ?? prev.start_at,
            prize_pool: d.prize_pool !== undefined ? Number(d.prize_pool) : prev.prize_pool,
            total_players: d.total_players !== undefined ? Number(d.total_players) : prev.total_players,
          } : prev);
        }
        refreshUser();
      } else {
        // Rollback optimistic update on error
        setMyCartelas(prev => prev.filter(c => c.cartela_number !== seat));
        setTaken(prev => prev.filter(n => n !== seat));
        useGameStore.setState(s => ({ user: s.user ? { ...s.user, main_balance: mainBal, bonus_balance: bonusBal } : s.user }));
        setErrMsg(d.error ?? "Could not join.");
        fetchState();
      }
    } catch {
      // Rollback on network error
      setMyCartelas(prev => prev.filter(c => c.cartela_number !== seat));
      setTaken(prev => prev.filter(n => n !== seat));
      useGameStore.setState(s => ({ user: s.user ? { ...s.user, main_balance: mainBal, bonus_balance: bonusBal } : s.user }));
      setErrMsg("Network error");
    } finally {
      setBuying(null);
    }
  };

  const fm = (a: number | undefined) => (a || 0).toLocaleString("en-US");
  const initial = user?.first_name ? user.first_name.charAt(0).toUpperCase() : "U";
  let statusTxt = "Finished", statusCls = "text-slate-400";
  if (game?.status === "waiting") {
    if (timeLeft > 86400) { statusTxt = "Waiting..."; statusCls = "text-orange-400"; }
    else if (timeLeft === 0) { statusTxt = "Ready!"; statusCls = "text-emerald-400 animate-pulse"; }
    else { statusTxt = `${timeLeft}s`; statusCls = "text-orange-400"; }
  }
  else if (game?.status === "calling") { statusTxt = "Active"; statusCls = "text-emerald-400"; }

  const Header = () => (
    <div className="px-4 py-3 border-b border-slate-100 bg-white shadow-2xs flex items-center justify-between shrink-0 transition-colors">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-lg shadow-xs">{initial}</div>
        <div>
          <p className="font-black text-sm uppercase tracking-wider text-slate-800 leading-tight">{user?.first_name || "USER"}</p>
          <div className="flex items-center space-x-1 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400">Online</span>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4 text-right">
        <div className="flex flex-col items-center">
          <Gift size={14} className="text-purple-600 mb-0.5" />
          <p className="text-xs font-bold text-slate-700">{fm(user?.bonus_balance)} ETB</p>
        </div>
        <div className="flex flex-col items-end">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t[language].bingo.wallet}</p>
          <p className="text-sm font-black text-emerald-600">{fm(user?.main_balance)} ETB</p>
        </div>
      </div>
    </div>
  );

  // ── 1. ROOMS SELECTION SCREEN (Shown before stake is chosen) ──
  if (!selectedRoomId) {
    return (
      <div className="h-[calc(100dvh-80px)] w-full bg-white flex flex-col select-none overflow-hidden relative" onClick={initWebAudio}>
        {/* Subtle background grid pattern */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]" style={{ display: 'grid', gridTemplateColumns: 'repeat(15, minmax(0, 1fr))', gap: '2px', padding: '2px' }}>
          {Array.from({ length: 150 }, (_, i) => (
            <div key={i} className="flex items-center justify-center bg-black rounded-[3px] text-black font-black" style={{ fontSize: '6px' }}>{i + 1}</div>
          ))}
        </div>

        <div className="relative z-10 flex flex-col h-full">
          {/* Top user profile & wallet header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white shadow-2xs">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-lg shadow-xs">{initial}</div>
              <div>
                <p className="font-black text-sm uppercase tracking-wider text-slate-800 leading-tight">{user?.first_name || "USER"}</p>
                <div className="flex items-center space-x-1 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-400">Online</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4 text-right">
              <div className="flex flex-col items-center">
                <Gift size={14} className="text-purple-600 mb-0.5" />
                <p className="text-xs font-bold text-slate-700">{fm(user?.bonus_balance)} ETB</p>
              </div>
              <div className="flex flex-col items-end">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t[language].bingo.wallet}</p>
                <p className="text-sm font-black text-emerald-600">{fm(user?.main_balance)} ETB</p>
              </div>
            </div>
          </div>

          {/* Navigation Bar: Back | Title | Search + Filter */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0 bg-white">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/60 flex items-center justify-center text-slate-600 active:scale-95 transition-all shadow-2xs"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1.5">
                <DoorOpen size={16} className="text-amber-500" />
                <h2 className="font-black text-base text-slate-800 tracking-wide">
                  {language === 'am' ? 'የቢንጎ ክፍሎች' : 'BINGO ROOMS'}
                </h2>
              </div>
              <p className="text-[10px] text-amber-600 font-bold">
                {language === 'am' ? 'ክፍል ይምረጡና ይጫወቱ' : 'Select an active room to play'}
              </p>
            </div>
            {/* Search icon + Filter */}
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => { setShowSearchBar(v => !v); if (showSearchBar) setRoomSearch(''); }}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center active:scale-95 transition-all shadow-2xs ${
                  showSearchBar || roomSearch
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-slate-100 border-slate-200/60 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" strokeWidth="2.5"/>
                  <path d="m21 21-4.35-4.35" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </button>
              {/* Advanced Filter Button */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterDropdown(v => !v)}
                  className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold active:scale-95 transition-all shadow-2xs ${
                    roomSortFilter !== 'all'
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-slate-100 border-slate-200/60 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>
                    {BINGO_FILTER_OPTIONS.find(o => o.key === roomSortFilter)?.icon ?? '🔽'}
                  </span>
                  <ChevronDown size={12} className={showFilterDropdown ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>

                {/* Dropdown */}
                {showFilterDropdown && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden min-w-[180px]">
                    <div className="px-3 pt-2.5 pb-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {language === 'am' ? 'ክፍሎች ተለይ' : 'Sort Rooms By'}
                      </p>
                    </div>
                    {BINGO_FILTER_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => { setRoomSortFilter(opt.key); setShowFilterDropdown(false); }}
                        className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-left active:bg-slate-50 transition-colors ${
                          roomSortFilter === opt.key
                            ? 'bg-amber-50 text-amber-700'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base leading-none">{opt.icon}</span>
                        <span className="text-xs font-bold leading-tight">{opt.label}</span>
                        {roomSortFilter === opt.key && (
                          <span className="ml-auto text-amber-500 text-xs font-black">✓</span>
                        )}
                      </button>
                    ))}
                    <div className="border-t border-slate-100 px-3 py-2">
                      <button
                        onClick={handleRefreshRooms}
                        className="w-full flex items-center justify-center space-x-2 py-2 bg-slate-100 rounded-xl text-slate-600 text-xs font-bold active:scale-95 transition-all hover:bg-slate-200"
                      >
                        <RefreshCw size={12} className={roomsRefreshing ? 'animate-spin text-amber-500' : ''} />
                        <span>{language === 'am' ? 'አድስ' : 'Refresh Rooms'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Expandable search bar */}
          {showSearchBar && (
            <div className="px-4 pb-2 shrink-0 bg-white">
              <div className="flex items-center bg-slate-100 rounded-xl px-3 py-2 border border-slate-200 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-200 transition-all">
                <svg className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" strokeWidth="2.5"/>
                  <path d="m21 21-4.35-4.35" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                <input
                  autoFocus
                  type="text"
                  value={roomSearch}
                  onChange={e => setRoomSearch(e.target.value)}
                  placeholder={language === 'am' ? 'ክፍል ፈልግ...' : 'Search rooms by name...'}
                  className="flex-1 bg-transparent text-xs font-semibold text-slate-700 placeholder-slate-400 outline-none"
                />
                {roomSearch && (
                  <button onClick={() => setRoomSearch('')} className="text-slate-400 hover:text-slate-600 ml-1 text-sm leading-none">×</button>
                )}
              </div>
            </div>
          )}

          {/* Filter chips row (quick inline buttons, shows active filter) */}
          <div className="px-4 pb-1 flex space-x-1.5 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
            {BINGO_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setRoomSortFilter(opt.key)}
                className={`shrink-0 flex items-center space-x-1 px-3 py-1 rounded-full text-[11px] font-bold border active:scale-95 transition-all ${
                  roomSortFilter === opt.key
                    ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600'
                }`}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Rooms Grid (Mobile friendly, strictly real rooms from DB) */}
          <div className="px-4 flex-1 overflow-y-auto pb-4 pt-2" style={{ scrollbarWidth: 'none' }}
            onClick={() => showFilterDropdown && setShowFilterDropdown(false)}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wide">
                  {language === 'am' ? 'ክፍት ክፍሎች' : 'Available Rooms'}
                </span>
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                  {filteredRooms.length}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold">
                {language === 'am' ? 'ይምረጡና ይግቡ' : 'Tap room to join'}
              </span>
            </div>

            {filteredRooms.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-2 mt-2">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <DoorOpen size={28} />
                </div>
                <p className="text-xs font-black text-slate-600">
                  {roomSearch.trim()
                    ? (language === 'am' ? `"${roomSearch}" አልተገኘም` : `No rooms matching "${roomSearch}"`)
                    : (language === 'am' ? 'ምንም ክፍሎች የሉም' : 'No active rooms yet')}
                </p>
                <p className="text-[10px] text-slate-400">
                  {roomSearch.trim()
                    ? (language === 'am' ? 'ሌላ ቃል ይሞክሩ' : 'Try a different search term')
                    : (language === 'am' ? 'ክፍሎች ሲዘጋጁ እዚህ ይታያሉ' : 'Rooms will appear here once agents create them')}
                </p>
                {!roomSearch.trim() && (
                  <button
                    onClick={handleRefreshRooms}
                    className="mt-2 px-4 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-black active:scale-95 shadow-sm"
                  >
                    {language === 'am' ? 'አድስ (Refresh)' : 'Refresh'}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pb-2">
                {filteredRooms.map((room) => {
                  const isInvitedRoom = Boolean(userInvitedRoomId && room.id === userInvitedRoomId);
                  return (
                    <div
                      key={room.id}
                      onClick={() => handleSelectRoom(room)}
                      className={`bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col cursor-pointer active:scale-95 transition-all duration-200 hover:shadow-md ${isInvitedRoom ? 'border-2 border-orange-500 ring-2 ring-orange-300/60' : 'border border-slate-200/90'}`}
                    >
                      {/* Same black header for all rooms */}
                      <div className="h-20 bg-black flex flex-col items-center justify-center relative px-2.5 text-center">
                        {isInvitedRoom ? (
                          <div className="absolute top-2 left-2 flex items-center justify-center bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] w-5 h-5 rounded-full shadow-sm">
                            <span>⭐</span>
                          </div>
                        ) : room.is_pinned ? (
                          <div className="absolute top-2 left-2 flex items-center justify-center bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 text-[10px] w-5 h-5 rounded-full shadow-sm">
                            <span>📌</span>
                          </div>
                        ) : null}
                        <div className="absolute top-2 right-2 flex items-center space-x-1 bg-white/10 px-1.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[7px] font-black text-white uppercase tracking-wider">LIVE</span>
                        </div>
                        <span className="text-white font-black text-base leading-tight line-clamp-2 px-1">
                          {room.room_name}
                        </span>
                      </div>

                      {/* Stats Row: Players | Total Games */}
                      <div className="w-full bg-slate-50 border-b border-slate-100 flex h-[38px] shrink-0">
                        <div className="flex-1 flex flex-col items-center justify-center border-r border-slate-100">
                          <span className="text-slate-400 text-[8px] font-bold uppercase tracking-wider">
                            {language === 'am' ? 'ተጫዋቾች' : 'Players'}
                          </span>
                          <span className="text-[11px] font-black text-emerald-600">{room.total_players}</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center">
                          <span className="text-slate-400 text-[8px] font-bold uppercase tracking-wider">
                            {language === 'am' ? 'ጨዋታዎች' : 'Games'}
                          </span>
                          <span className="text-[11px] font-black text-violet-600">{room.total_games}</span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="p-2 text-center bg-white">
                        <div className="w-full bg-slate-100 hover:bg-amber-500 hover:text-white text-slate-700 font-black py-2 rounded-xl text-[11px] transition-colors flex items-center justify-center space-x-1 shadow-2xs">
                          <span>{language === 'am' ? 'ክፍል ይግቡ' : 'Join Room'}</span>
                          <span>→</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── 2. STAKE SELECTION SCREEN (Shown AFTER room is selected) ──
  if (!selectedStake) {
    return (
      <div className="h-[calc(100dvh-80px)] w-full bg-white flex flex-col select-none overflow-hidden relative" onClick={initWebAudio}>
        
        {/* Background grid (Light mode) */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.04]" style={{ display: 'grid', gridTemplateColumns: 'repeat(15, minmax(0, 1fr))', gap: '2px', padding: '2px' }}>
          {Array.from({ length: 150 }, (_, i) => (
            <div key={i} className="flex items-center justify-center bg-black rounded-[3px] text-black font-black" style={{ fontSize: '6px' }}>{i + 1}</div>
          ))}
        </div>

        <div className="relative z-10 flex flex-col h-full">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white shadow-2xs">
            <div className="flex items-center space-x-2.5">
              <button
                onClick={() => {
                  setSelectedRoomId(null);
                  setSearchParams(params => {
                    params.delete('room');
                    params.delete('stake');
                    return params;
                  });
                }}
                className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl shrink-0 active:scale-95 transition-transform shadow-xs text-slate-700 hover:bg-slate-50"
                title={language === 'am' ? 'ወደ ክፍሎች ተመለስ' : 'Back to rooms'}
              >
                <ArrowLeft size={16} className="text-slate-700" />
              </button>
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-lg shadow-xs">{initial}</div>
              <div>
                <p className="font-black text-sm uppercase tracking-wider text-slate-800 leading-tight">{user?.first_name || "USER"}</p>
                <div className="flex items-center space-x-1 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-400">Online</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4 text-right">
              <div className="flex flex-col items-center"><Gift size={14} className="text-purple-600 mb-0.5" /><p className="text-xs font-bold text-slate-700">{fm(user?.bonus_balance)} ETB</p></div>
              <div className="flex flex-col items-end"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t[language].bingo.wallet}</p><p className="text-sm font-black text-emerald-600">{fm(user?.main_balance)} ETB</p></div>
            </div>
          </div>

          {/* Selected Room Banner Card with Change Room Action */}
          <div className="mx-4 mt-2.5 p-3 bg-gradient-to-r from-amber-500/10 via-yellow-400/15 to-indigo-500/10 border border-amber-300/40 rounded-2xl flex items-center justify-between shadow-xs shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center text-white shadow-md font-black">
                <DoorOpen size={20} />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider">
                    {language === 'am' ? 'የተመረጠ ክፍል' : 'Selected Room'}
                  </span>
                </div>
                <h3 className="font-black text-sm text-slate-800 leading-tight">
                  {selectedRoom?.room_name || 'Active Room'}
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  👥 {selectedRoom?.total_players || 0} {language === 'am' ? 'ተጫዋቾች' : 'players'} • 🎮 {selectedRoom?.total_games || 0} {language === 'am' ? 'ጨዋታዎች' : 'games'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedRoomId(null);
                setSearchParams(params => {
                  params.delete('room');
                  return params;
                });
              }}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-[11px] font-bold active:scale-95 transition-transform shadow-xs flex items-center space-x-1 hover:bg-slate-50"
            >
              <RotateCcw size={12} className="text-amber-600" />
              <span>{language === 'am' ? 'ክፍል ቀይር' : 'Change Room'}</span>
            </button>
          </div>

          {/* Subtitle */}
          <p className="text-center text-slate-400 text-[10px] uppercase tracking-widest font-bold pt-2.5 pb-1">
            {t[language].bingo.selectStakeWinBig}
          </p>
          
          {/* Stakes Grid (10, 20, 50, 100 ETB) */}
          <div className="flex-1 grid grid-cols-2 gap-3 px-4 pb-2 min-h-0">
            {STAKE_OPTIONS.map(opt => {
              const hg = homeGames[opt.value];
              const pool = hg?.pool || 0;
              const players = hg?.players || 0;
              const hasGame = pool > 0;
              const isWaiting = hg?.status === 'waiting';
              const isCalling = hg?.status === 'calling';
              const tl = homeTimeLeft[opt.value] || 0;
              
              let statusTxt = "Waiting...";
              let statusCls = "text-orange-500";
              if (isWaiting && tl <= 86400 && tl > 0) {
                statusTxt = `${tl}s`;
              } else if (isCalling) {
                statusTxt = "Active";
                statusCls = "text-emerald-500";
              }

              return (
                <button key={opt.value} onClick={() => { setSelectedStake(opt.value); initWebAudio(); }}
                  className="relative overflow-hidden bg-white border border-slate-200 rounded-2xl flex flex-col active:scale-95 transition-all duration-300 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
                  <div className={`absolute inset-0 bg-gradient-to-br ${opt.color} opacity-10`}></div>
                  
                  {/* Top: STAKE */}
                  <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10 pt-2">
                    <span className="text-slate-500 font-bold text-[8px] uppercase tracking-widest">{t[language].bingo.stake}</span>
                    <span className="text-slate-800 font-black text-4xl leading-none mt-1">{opt.value}</span>
                    <span className="text-slate-500 font-bold text-[8px] uppercase tracking-widest mt-1">ETB</span>
                  </div>

                  {/* Middle: Derash | Players | Status — 3 columns */}
                  <div className="w-full bg-slate-50 border-t border-b border-slate-100 flex h-[35px] shrink-0 relative z-10">
                    <div className="flex-1 flex flex-col items-center justify-center border-r border-slate-100">
                      <span className="text-slate-400 text-[7px] font-bold uppercase tracking-wider">{t[language].bingo.derash}</span>
                      <span className={`text-[10px] font-black text-yellow-600 ${hasGame ? 'animate-pulse' : ''}`}>{pool} ETB</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center border-r border-slate-100">
                      <span className="text-slate-400 text-[7px] font-bold uppercase tracking-wider">{t[language].bingo.players}</span>
                      <span className="text-[10px] font-black text-emerald-500">{players}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <span className="text-slate-400 text-[7px] font-bold uppercase tracking-wider">{t[language].bingo.status}</span>
                      <span className={`text-[10px] font-black ${statusCls}`}>{statusTxt}</span>
                    </div>
                  </div>

                  {/* Bottom: Action */}
                  <div className="w-full h-[30px] flex items-center justify-center relative z-10 bg-white">
                    {isWaiting ? (
                      <span className="text-orange-500 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">🔥 {t[language].bingo.joinNow}</span>
                    ) : (
                      <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">{t[language].bingo.startMatch}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      </div>
    );
  }

  if (loading && !game) {
    return (
      <div className="h-[calc(100dvh-80px)] w-full bg-gradient-to-b from-[#fffbf0] via-[#fef3c7]/40 to-[#fffbf0] flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white border-2 border-amber-300 shadow-md flex items-center justify-center">
          <RefreshCw size={26} className="text-amber-500 animate-spin" />
        </div>
        <p className="text-xs font-black text-amber-800 tracking-wider uppercase">Loading Game...</p>
      </div>
    );
  }

  if (!game) return (
    <div className="h-[calc(100dvh-80px)] w-full bg-gradient-to-b from-[#fffbf0] via-[#fef3c7]/30 to-[#fffbf0] flex flex-col items-center justify-center text-slate-800 gap-4">
      <div className="w-16 h-16 rounded-3xl bg-white border-2 border-amber-300 shadow-md flex items-center justify-center text-3xl">🎱</div>
      <p className="font-black text-lg text-slate-800">{t[language].bingo.preparingNext}</p>
      <button onClick={fetchState} className="px-8 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-full text-sm shadow-md active:scale-95 transition-transform">{t[language].bingo.refresh}</button>
      <button onClick={() => setSelectedStake(null)} className="text-slate-400 text-xs underline mt-1">{t[language].bingo.changeStake}</button>
    </div>
  );

  const renderCallingBoard = () => {
    const recent = [...called].reverse().slice(0, 4);
    const currentLetter = lastNum ? getLetter(lastNum) : null;
    const currentAmharic = lastNum ? AMHARIC_NUM[lastNum] : null;

    return (
      <div className="h-full flex flex-col px-1 pt-1 pb-2 gap-1">

        {/* Top Info Bar */}
        <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-amber-200/80 shadow-2xs shrink-0">
          <div className="text-slate-600 text-[9px] font-black">ID: {formatGameId(game.id)}</div>
          <div className="flex items-center gap-1 text-amber-700 text-[9px] font-black"><Trophy size={10} className="text-amber-500"/> {game.prize_pool} ETB</div>
          <div className="flex items-center gap-1 text-blue-700 text-[9px] font-black"><LayoutGrid size={10} className="text-blue-500"/> {taken.length}</div>
          <div className="flex items-center gap-1 text-emerald-700 text-[9px] font-black"><Clock size={10} className="text-emerald-500"/> {called.length}/75</div>
          <div className="text-[8px] bg-red-500/10 text-red-600 px-2 py-0.5 rounded-full font-black animate-pulse border border-red-200">LIVE</div>
        </div>

        {/* 1-75 Tracker Board */}
        <div className="bg-white rounded-2xl px-2 py-2 border-2 border-amber-200/90 shadow-sm shrink-0">
          <div className="flex flex-col gap-[3px]">
            {BINGO_LETTERS.map((letter, rowIndex) => (
              <div key={letter} className="flex items-center gap-1.5">
                <div className="w-4 flex-shrink-0 flex items-center justify-center font-black text-[10px]" style={{ color: LETTER_COLOR[letter] }}>{letter}</div>
                <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
                  {Array.from({ length: 15 }, (_, i) => {
                    const num = rowIndex * 15 + i + 1;
                    const isCalled = called.includes(num);
                    const isLatest = num === lastNum;
                    return (
                      <div key={num} className={`h-[20px] rounded-[3px] flex items-center justify-center text-[8px] font-black transition-all ${
                        isLatest ? 'bg-amber-400 text-amber-950 shadow-md ring-2 ring-orange-500 font-black scale-105 z-10' :
                        isCalled ? 'bg-orange-500 text-white shadow-2xs' : 'bg-slate-100 text-slate-400'
                      }`}>{num}</div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Caller Row + Card — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        <div className={`w-full ${myCartelas.length > 1 ? 'max-w-[420px]' : 'max-w-[290px]'} mx-auto flex flex-col gap-1.5 pb-2`}>
          {/* Caller Row */}
          <div className="shrink-0 bg-white rounded-2xl border-2 border-amber-200/90 shadow-sm px-3 py-2 w-full max-w-[320px] mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {recent.length === 0 ? (
                  <span className="text-amber-700 text-[10px] font-black animate-pulse">Waiting...</span>
                ) : recent.map((num, idx) => {
                  const l = getLetter(num);
                  const isFirst = idx === 0;
                  if (isFirst) {
                    return (
                      <div key={`${num}-${idx}`} className="flex items-center gap-2">
                        <div className="w-11 h-11 flex flex-col items-center justify-center rounded-full font-black border-2 border-amber-400 bg-amber-100/80 shadow-md">
                          <span style={{ color: LETTER_COLOR[l] }} className="text-[10px] leading-none font-black">{l}</span>
                          <span className="text-slate-900 text-lg leading-none font-black">{num}</span>
                        </div>
                        <span className="text-amber-800 font-black text-sm">{AMHARIC_NUM[num]}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={`${num}-${idx}`} className="w-7 h-7 flex flex-col items-center justify-center rounded-full border border-amber-200 bg-amber-50/60">
                      <span style={{ color: LETTER_COLOR[l] }} className="text-[7px] leading-none font-black">{l}</span>
                      <span className="text-slate-700 text-[10px] leading-none font-black">{num}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setAutoMark(a => !a)} className={`w-8 h-8 rounded-xl border flex items-center justify-center active:scale-90 transition-all ${autoMark ? 'bg-amber-100 border-amber-400 shadow-2xs' : 'bg-slate-100 border-slate-200'}`}>
                  {autoMark ? <Wand2 size={13} className="text-amber-600" /> : <Hand size={13} className="text-slate-400" />}
                </button>
                <button onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    unlockAudio();
                    if (next) {
                      // Immediately play current number audio so user hears confirmation!
                      playCallAudio(lastNum || 1);
                    }
                  }}
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center active:scale-90 transition-all ${soundEnabled ? 'bg-blue-100 border-blue-400 shadow-2xs' : 'bg-slate-100 border-slate-200'}`}>
                  {soundEnabled ? <Volume2 size={13} className="text-blue-600" /> : <VolumeX size={13} className="text-red-400" />}
                </button>
              </div>
            </div>
          </div>

          {/* My Cards — dynamic layout: 1 card = centered classic; 2+ cards = all visible side-by-side grid */}
          {myCartelas.length > 0 ? (
            myCartelas.length === 1 ? (
              /* Single Cartela — exact same classic centered layout as preset */
              <div key={myCartelas[0].cartela_number} className="w-full max-w-[250px] mx-auto">
                <div className="rounded-2xl overflow-hidden border-2 border-amber-300 shadow-md bg-white">
                  {/* BINGO Header */}
                  <div className="grid grid-cols-5">
                    {BINGO_LETTERS.map(l => (
                      <div key={l} className="flex items-center justify-center py-1 font-black text-white text-xs" style={{ background: LETTER_BG[l] }}>{l}</div>
                    ))}
                  </div>
                  {/* Card Grid */}
                  <div className="grid grid-cols-5 gap-[3px] p-[3px] bg-amber-50/60">
                    {Array.from({ length: 5 }).flatMap((_, r) =>
                      Array.from({ length: 5 }, (_, c) => {
                        const num = myCartelas[0].card_matrix[r][c];
                        const isFree = num === 0;
                        const isCalled = called.includes(num);
                        const isManualMarked = manuallyMarked.has(num);
                        const marked = isFree || (autoMark ? isCalled : isManualMarked);
                        const isLast = num === lastNum;
                        const canTap = !autoMark && isCalled && !isFree;
                        return (
                          <div
                            key={`${r}-${c}`}
                            onClick={() => {
                              if (!canTap) return;
                              setManuallyMarked(prev => {
                                const next = new Set(prev);
                                if (next.has(num)) next.delete(num); else next.add(num);
                                return next;
                              });
                              if (WebApp?.HapticFeedback) WebApp.HapticFeedback.selectionChanged();
                            }}
                            className={`aspect-square flex items-center justify-center font-black text-sm rounded-lg transition-all duration-200 select-none ${
                              isFree ? 'bg-amber-400 text-amber-950 font-black shadow-xs' :
                              isLast && autoMark ? 'bg-orange-500 text-white shadow-md ring-2 ring-amber-300 scale-105 z-10' :
                              marked ? 'bg-emerald-500 text-white shadow-xs' :
                              canTap ? 'bg-white text-slate-800 active:scale-95 cursor-pointer ring-2 ring-blue-400 shadow-xs' :
                              'bg-white text-slate-800 border border-slate-100 shadow-xs'
                            }`}
                          >{isFree ? '★' : num}</div>
                        );
                      })
                    )}
                  </div>
                  {/* Cartela Label */}
                  <div className="py-1.5 flex items-center justify-center bg-white border-t border-amber-200">
                    <p className="text-amber-800 font-black text-[10px] tracking-widest uppercase flex items-center gap-1.5">
                      <LayoutGrid size={12} className="text-amber-500 shrink-0" />
                      <span>{t[language].bingo.cartelaNum.trim()} {myCartelas[0].cartela_number}</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* 2 or More Cartelas — Side-by-side grid, ALL visible without any hidden tabs! */
              <div className="w-full flex flex-col gap-1 px-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-amber-800 text-[10px] font-black tracking-wider uppercase">CARTELAS ({myCartelas.length})</span>
                  <span className="text-emerald-700 text-[8px] font-black uppercase tracking-wider bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">All Active</span>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full">
                  {myCartelas.map((card) => (
                    <div key={card.cartela_number} className="w-full">
                      <div className="rounded-xl overflow-hidden border-2 border-amber-300 shadow-md bg-white">
                        {/* BINGO Header */}
                        <div className="grid grid-cols-5">
                          {BINGO_LETTERS.map(l => (
                            <div key={l} className="flex items-center justify-center py-0.5 font-black text-white text-[10px]" style={{ background: LETTER_BG[l] }}>{l}</div>
                          ))}
                        </div>
                        {/* Card Grid */}
                        <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-amber-50/60">
                          {Array.from({ length: 5 }).flatMap((_, r) =>
                            Array.from({ length: 5 }, (_, c) => {
                              const num = card.card_matrix[r][c];
                              const isFree = num === 0;
                              const isCalled = called.includes(num);
                              const isManualMarked = manuallyMarked.has(num);
                              const marked = isFree || (autoMark ? isCalled : isManualMarked);
                              const isLast = num === lastNum;
                              const canTap = !autoMark && isCalled && !isFree;
                              return (
                                <div
                                  key={`${r}-${c}`}
                                  onClick={() => {
                                    if (!canTap) return;
                                    setManuallyMarked(prev => {
                                      const next = new Set(prev);
                                      if (next.has(num)) next.delete(num); else next.add(num);
                                      return next;
                                    });
                                    if (WebApp?.HapticFeedback) WebApp.HapticFeedback.selectionChanged();
                                  }}
                                  className={`aspect-square flex items-center justify-center font-black text-[11px] rounded transition-all duration-200 select-none ${
                                    isFree ? 'bg-amber-400 text-amber-950 font-black' :
                                    isLast && autoMark ? 'bg-orange-500 text-white shadow-md ring-2 ring-amber-300 scale-105 z-10' :
                                    marked ? 'bg-emerald-500 text-white' :
                                    canTap ? 'bg-white text-slate-800 active:scale-95 cursor-pointer ring-2 ring-blue-400' :
                                    'bg-white text-slate-800 border border-slate-100 shadow-2xs'
                                  }`}
                                >
                                  {isFree ? '★' : num}
                                </div>
                              );
                            })
                          )}
                        </div>
                        {/* Cartela Label */}
                        <div className="py-1 px-2 flex items-center justify-center bg-white border-t border-amber-200">
                          <p className="text-amber-800 font-black text-[9px] tracking-wider uppercase flex items-center gap-1.5">
                            <LayoutGrid size={11} className="text-amber-500 shrink-0" />
                            <span>{t[language].bingo.cartelaNum.trim()} {card.cartela_number}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="w-full max-w-[250px] mx-auto relative mt-1 pointer-events-none">
              <div className="rounded-2xl overflow-hidden border-2 border-amber-300 bg-white shadow-md">
                {/* BINGO Header */}
                <div className="grid grid-cols-5">
                  {BINGO_LETTERS.map(l => (
                    <div key={l} className="flex items-center justify-center py-1 font-black text-white text-xs" style={{ background: LETTER_BG[l] }}>{l}</div>
                  ))}
                </div>
                
                {/* Dummy Grid */}
                <div className="grid grid-cols-5 gap-[3px] p-[3px] bg-amber-50/60">
                  {Array.from({ length: 5 }).flatMap((_, r) => 
                    Array.from({ length: 5 }, (_, c) => {
                      const isFree = r === 2 && c === 2;
                      const num = isFree ? '★' : (c * 15) + r + (c % 2 === 0 ? 3 : 8);
                      return (
                        <div key={`${r}-${c}`} className={`aspect-square flex items-center justify-center font-black text-sm rounded-lg ${
                          isFree ? 'bg-amber-400 text-amber-950' : 'bg-white text-slate-800 shadow-2xs border border-slate-100'
                        }`}>{num}</div>
                      );
                    })
                  )}
                </div>

                {/* Overlay Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs z-10">
                  <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-3 border border-red-500/30">
                    <span className="text-xl animate-pulse">⏳</span>
                  </div>
                  <h3 className="text-red-400 font-black text-lg uppercase tracking-widest mb-1 drop-shadow-sm">Match is active</h3>
                  <p className="text-white text-[10px] font-bold text-center px-4 leading-relaxed uppercase tracking-wider">
                    <span dangerouslySetInnerHTML={{ __html: t[language].bingo.waitNext }} />
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    );
  };

  const renderCartelaPicker = () => {
    const myNums = myCartelas.map(c => c.cartela_number);
    const canPickMore = myCartelas.length < maxCartelasPerUser;
    return (
    <div className="flex-1 overflow-y-auto relative p-3 pb-16">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs text-slate-700 font-black uppercase tracking-wider">
            {canPickMore ? `TAP TO PICK — ${taken.length}/${maxPlayers} TAKEN` : `ALL CARTELAS SELECTED ✓`}
          </p>
        </div>
        <span className="text-[11px] bg-amber-100 text-amber-800 border border-amber-300/80 px-2.5 py-0.5 rounded-full font-black shadow-2xs">
          {myCartelas.length}/{maxCartelasPerUser} PICKED
        </span>
      </div>
      {/* My Cartelas chips */}
      {myNums.length > 0 && (
        <div className="flex gap-2 mb-2.5 flex-wrap">
          {myNums.map(n => (
            <span key={n} className="px-3 py-1 bg-emerald-500 text-white text-xs font-black rounded-full ring-2 ring-amber-300 flex items-center gap-1.5 shadow-sm">
              <LayoutGrid size={12} className="text-amber-200 shrink-0" />
              <span>{t[language].bingo.cartelaNum.trim()} {n} ✓</span>
            </span>
          ))}
        </div>
      )}
      <div className="rounded-2xl border-2 border-amber-300/90 overflow-hidden bg-white/90 backdrop-blur-sm shadow-md p-1">
        <div className="grid gap-[3px] p-[2px]" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
          {Array.from({ length: maxPlayers }, (_, i) => {
            const n = i + 1;
            const isTaken = taken.includes(n), isMine = myNums.includes(n), isBuying = buying === n;
            if (isMine) {
              return (
                <div key={n} className="aspect-square flex items-center justify-center rounded-[8px] text-[10px] font-black bg-emerald-500 text-white ring-2 ring-amber-400 z-10 shadow-xs">
                  ✓
                </div>
              );
            }
            if (isTaken) {
              return (
                <div key={n} className="aspect-square flex items-center justify-center rounded-[8px] text-[10px] font-bold bg-slate-100 text-slate-300 border border-slate-200/50">
                  ✕
                </div>
              );
            }
            return (
              <button key={n} disabled={buying !== null || !canPickMore} onClick={() => openPreview(n)}
                className={`aspect-square flex items-center justify-center rounded-[8px] text-xs font-black transition-all duration-150 border ${
                  !canPickMore 
                    ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed' 
                    : isBuying 
                    ? 'bg-amber-100 border-amber-300 opacity-60 scale-90' 
                    : 'bg-white text-slate-800 border-slate-200/80 hover:border-amber-400 hover:bg-amber-50/50 shadow-2xs active:scale-90 cursor-pointer'
                }`}>
                {n}
              </button>
            );
          })}
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="h-[calc(100dvh-80px)] w-full bg-gradient-to-b from-[#fffbf0] via-[#fef3c7]/30 to-[#fffbf0] flex flex-col select-none" onClick={initWebAudio}>
      <div className="sticky top-0 z-40 bg-white shadow-2xs border-b border-amber-100/80 flex flex-col shrink-0">
        <Header />
        {game.status !== 'calling' && (
          <div className="bg-gradient-to-r from-amber-50/90 via-yellow-50/60 to-amber-50/90 border-b border-amber-200/70 px-3 pt-3 pb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <button 
                onClick={() => {
                  setSelectedStake(null);
                  setSearchParams(params => {
                    params.delete('stake');
                    return params;
                  });
                  setGame(null);
                  setMyCard(null);
                  setMyCartelas([]);
                  setActiveCartelaIdx(0);
                  setTaken([]);
                }} 
                className="h-9 w-9 flex items-center justify-center bg-white border border-amber-200/80 rounded-xl shrink-0 active:scale-95 transition-transform shadow-xs text-slate-700 hover:bg-amber-50"
                title={language === 'am' ? 'ወደ እጣዎች ተመለስ' : 'Back to stakes'}
              >
                <ArrowLeft size={16} className="text-slate-700" />
              </button>

              {/* Room Name Dropdown */}
              <div className="relative shrink-0">
                <button
                  onClick={() => {
                    if (myCartelas.length === 0) {
                      setShowRoomDropdown(prev => !prev);
                      setShowStakeDropdown(false);
                    }
                  }}
                  className={`flex items-center gap-1 bg-amber-100/90 border border-amber-300/80 rounded-xl px-2 h-9 text-amber-900 font-black text-xs shrink-0 max-w-[125px] shadow-xs ${myCartelas.length > 0 ? 'opacity-70 cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}
                  title={selectedRoom?.room_name || 'Room'}
                >
                  <DoorOpen size={13} className="text-amber-700 shrink-0" />
                  <span className="truncate">{selectedRoom?.room_name || 'Room'}</span>
                  <ChevronDown size={11} className={`text-amber-700 shrink-0 transition-transform ${showRoomDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Room Dropdown Menu */}
                {showRoomDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowRoomDropdown(false)} />
                    <div className="absolute top-[calc(100%+8px)] left-0 w-48 max-h-60 overflow-y-auto bg-white border border-amber-200 rounded-xl shadow-xl z-50 py-1" style={{ scrollbarWidth: 'none' }}>
                      <div className="px-3 py-1.5 border-b border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          {language === 'am' ? 'ክፍል ምረጥ' : 'Select Room'}
                        </p>
                      </div>
                      {((rooms.filter(r => !r.status || r.status === 'active').length > 0 ? rooms.filter(r => !r.status || r.status === 'active') : rooms).slice().sort((a, b) => {
                        if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) return b.is_pinned ? 1 : -1;
                        return 0;
                      })).map(r => {
                        const isCurrent = r.id === selectedRoomId;
                        return (
                          <button
                            key={r.id}
                            onClick={() => {
                              if (r.id !== selectedRoomId) {
                                setSelectedRoomId(r.id);
                                setSearchParams(params => {
                                  params.set('room', r.id);
                                  if (selectedStake) params.set('stake', String(selectedStake));
                                  return params;
                                });
                                setGame(null);
                                setMyCard(null);
                                setMyCartelas([]);
                                setActiveCartelaIdx(0);
                                setTaken([]);
                              }
                              setShowRoomDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between border-b border-slate-50 last:border-0 hover:bg-amber-50 active:bg-amber-100 transition-colors ${
                              isCurrent ? 'bg-amber-50 text-amber-800 font-black' : 'text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <DoorOpen size={13} className={isCurrent ? 'text-amber-600' : 'text-slate-400'} />
                              <div className="truncate">
                                <div className="flex items-center space-x-1">
                                  {r.is_pinned && <span className="text-[10px]">📌</span>}
                                  <p className="font-black text-xs truncate leading-tight">{r.room_name}</p>
                                </div>
                                <p className="text-[9px] text-slate-400 font-semibold leading-none mt-0.5">👥 {r.total_players || 0}</p>
                              </div>
                            </div>
                            {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 ml-1.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Stake Dropdown */}
              <div className="relative shrink-0">
                <button 
                  onClick={() => {
                    if (myCartelas.length === 0) {
                      setShowStakeDropdown(prev => !prev);
                      setShowRoomDropdown(false);
                    }
                  }}
                  className={`flex items-center gap-1.5 bg-white border border-amber-200/80 rounded-xl px-2.5 h-9 text-slate-800 font-black text-xs transition-colors shadow-xs ${myCartelas.length > 0 ? 'opacity-50 cursor-not-allowed' : 'active:bg-amber-50 cursor-pointer'}`}
                >
                  <span>{selectedStake} ETB</span>
                  <ChevronDown size={12} className={`text-slate-400 transition-transform ${showStakeDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {/* Dropdown Menu */}
                {showStakeDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowStakeDropdown(false)} />
                    <div className="absolute top-[calc(100%+8px)] left-0 w-32 bg-white border border-amber-200 rounded-xl shadow-xl z-50 overflow-hidden">
                      {[10, 20, 50, 100].map(val => (
                        <button
                          key={val}
                          onClick={() => {
                            setSelectedStake(val);
                            setSearchParams(params => {
                              params.set('stake', String(val));
                              if (selectedRoomId) params.set('room', selectedRoomId);
                              return params;
                            });
                            setGame(null); setMyCard(null); setMyCartelas([]); setActiveCartelaIdx(0); setTaken([]);
                            setShowStakeDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-3 flex items-center justify-between border-b border-slate-100 last:border-0 hover:bg-amber-50 active:bg-amber-100 transition-colors ${selectedStake === val ? 'text-amber-600 font-black' : 'text-slate-700'}`}
                        >
                          <span className="font-black text-sm">{val} ETB</span>
                          {selectedStake === val && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Game ID Box — 8 uppercase characters, no hyphen */}
              <div className="flex-1 min-w-[75px] bg-white border border-amber-200/80 rounded-xl h-9 flex flex-col items-center justify-center shadow-xs">
                <span className="text-[8px] text-slate-400 font-black tracking-wider uppercase leading-none">{t[language].bingo.gameId}</span>
                <span className="text-xs font-black text-slate-800 leading-tight tracking-wider">{formatGameId(game.id)}</span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              <div className="bg-white/90 border border-amber-200/70 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 font-bold uppercase">{t[language].bingo.stake}</p><p className="text-xs font-black text-slate-800">{game.stake} ETB</p></div>
              <div className="bg-white/90 border border-amber-200/70 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 font-bold uppercase">{t[language].bingo.players}</p><p className="text-xs font-black text-emerald-600">{uniquePlayers}</p></div>
              <div className="bg-white/90 border border-amber-200/70 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 font-bold uppercase">{t[language].bingo.cartelas}</p><p className="text-xs font-black text-blue-600">{taken.length}</p></div>
              <div className="bg-white/90 border border-amber-200/70 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 font-bold uppercase">{t[language].bingo.derash}</p><p className="text-xs font-black text-amber-600">{game.prize_pool} ETB</p></div>
              <div className="bg-white/90 border border-amber-200/70 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 font-bold uppercase">{t[language].bingo.status}</p><p className={`text-xs font-black ${statusCls}`}>{statusTxt}</p></div>
            </div>
          </div>
        )}
      </div>

      {errMsg && (
        <div className={`mx-3 mt-2 px-3 py-2 ${game.status === 'calling' ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-red-50 border-red-200 text-red-600'} border rounded-xl flex items-center justify-between z-10 shrink-0`}>
          <p className="text-xs font-bold">{errMsg}</p>
          <button onClick={() => setErrMsg("")} className="text-base leading-none ml-2">✕</button>
        </div>
      )}

      <div className={`flex-1 min-h-0 ${game.status === 'calling' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {game.status === 'calling' ? renderCallingBoard() : renderCartelaPicker()}
      </div>

      {/* Winner Celebration */}
      {celebration && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white border-2 border-amber-300 rounded-3xl p-4 text-center max-w-sm w-full shadow-2xl flex flex-col items-center relative">
            {/* ── REMATCH ── */}
            {celebration.winner_name === 'REMATCH' ? (<>
              <div className="text-5xl mb-2 animate-spin">🔄</div>
              <h2 className="text-3xl font-black text-orange-500 mb-2">{t[language].bingo.rematch}</h2>
              <div className="bg-amber-50/80 rounded-2xl p-3 mb-3 w-full border border-amber-200">
                <p className="text-orange-600 font-black text-sm mb-1">{t[language].bingo.tieDesc}</p>
                <p className="text-slate-600 text-xs font-semibold">{t[language].bingo.stakeRefunded}</p>
                <p className="text-slate-400 text-xs mt-1 font-semibold">{t[language].bingo.newGameStarts}</p>
              </div>

            {/* ── 2-WAY TIE🌟 */}
              </>) : celebration.winner_name.includes(' & ') ? (<>
                <h2 className="text-xl font-black text-amber-700 mb-1">{t[language].bingo.tieTitle}</h2>
                <div className="mb-2 inline-block bg-emerald-100 text-emerald-800 px-3.5 py-1 rounded-full font-black text-sm border border-emerald-300 shadow-2xs">
                  {celebration.winner_prize} ETB {t[language].bingo.each}
                </div>
                
                {celebration.winners_list && celebration.winners_list.length > 0 ? (
                  <div className="flex gap-2 w-full justify-center overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    {celebration.winners_list.map((w, idx) => {
                      const winCells = getWinningCells(w.card_matrix, celebration.called);
                      const winTitle = getWinningPatternTitle(w.card_matrix, celebration.called);
                      return (
                      <div key={idx} className="flex-shrink-0 w-[140px] bg-white rounded-2xl p-2 border-2 border-amber-200 shadow-xs flex flex-col items-center">
                        <p className="text-slate-900 font-black text-sm truncate w-full">{w.first_name}</p>
                        <div className="flex items-center justify-between w-full mb-1">
                          <p className="text-amber-700 text-[9px] font-bold flex items-center gap-1"><LayoutGrid size={10} className="text-amber-500 shrink-0" /> {t[language].bingo.cartelaNum.trim()} {w.cartela_number}</p>
                          <span className="text-emerald-700 text-[7px] font-black">{winTitle.replace(' BINGO!', '')}</span>
                        </div>
                        <div className="w-full">
                          <div className="grid grid-cols-5">
                            {['B','I','N','G','O'].map(l => (
                              <div key={l} className="flex items-center justify-center py-0.5 font-black text-white text-[9px]" style={{ background: l==='B'?'#3b82f6':l==='I'?'#8b5cf6':l==='N'?'#ec4899':l==='G'?'#22c55e':'#3b82f6' }}>{l}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-5 gap-[1px] p-[1px] bg-amber-50/60">
                            {w.card_matrix.map((row, r) => row.map((num, c) => {
                              const isFree = num === 0;
                              const isWin = winCells.has(`${r}-${c}`);
                              const isCalled = celebration.called?.map(Number).includes(Number(num));
                              return (
                                <div key={c} className={`aspect-square flex items-center justify-center text-[8px] font-black ${
                                  isFree
                                    ? 'bg-amber-400 text-amber-950 font-black'
                                    : isWin
                                    ? 'bg-emerald-500 text-white shadow-xs ring-1 ring-amber-300 font-black'
                                    : isCalled
                                    ? 'bg-orange-100 text-slate-800'
                                    : 'bg-white text-slate-800'
                                }`}>
                                  {isFree ? '★' : num}
                                </div>
                              )
                            }))}
                          </div>
                        </div>
                      </div>
                    );})}
                  </div>
                ) : (
                  <div className="bg-amber-50/80 rounded-2xl p-3 mb-3 w-full border border-amber-200">
                    <p className="text-slate-900 font-black text-lg">{celebration.winner_name}</p>
                  </div>
                )}
                
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider animate-pulse">{t[language].bingo.returning}</p>
  
              {/* 🌟  ── */}
            </>) : (<>
              {/* Trophy + BINGO label — NO overlap */}
              <div className="flex flex-col items-center mb-3">
                <div className="text-5xl mb-1 animate-bounce">🏆</div>
                <div className="bg-amber-400 text-amber-950 px-7 py-1.5 rounded-full font-black text-2xl tracking-widest shadow-md">
                  BINGO!
                </div>
              </div>

              {/* Winner info */}
              <div className="w-full bg-amber-50/80 rounded-2xl p-3 mb-3 border border-amber-200/80 shadow-2xs">
                <p className="text-amber-800 text-[9px] uppercase tracking-widest mb-1 font-black">{t[language].bingo.winner}</p>
                <p className="text-slate-900 font-black text-2xl leading-tight">{celebration.winner_name}</p>
                <p className="text-amber-700 text-xs font-bold mt-0.5 flex items-center justify-center gap-1.5"><LayoutGrid size={12} className="text-amber-500 shrink-0" /> {t[language].bingo.cartelaNum.trim()} {celebration.winner_cartela}</p>
                <div className="mt-2 inline-block bg-emerald-500 text-white px-6 py-1.5 rounded-full font-black text-lg shadow-[0_4px_16px_rgba(16,185,129,0.4)]">
                  🎉 {celebration.winner_prize} ETB
                </div>
              </div>

              {/* Winner Card — green win cells, gold ring, pattern badge */}
              {celebration.winner_matrix ? (() => {
                const winCells = getWinningCells(celebration.winner_matrix, celebration.called);
                const winTitle = getWinningPatternTitle(celebration.winner_matrix, celebration.called);
                return (
                  <div className="w-full rounded-2xl overflow-hidden border-2 border-amber-300 mb-3 shadow-md bg-white">
                    {/* BINGO header */}
                    <div className="grid grid-cols-5">
                      {BINGO_LETTERS.map(l => (
                        <div key={l} className="flex items-center justify-center py-1.5 font-black text-white text-sm" style={{ background: LETTER_BG[l] }}>{l}</div>
                      ))}
                    </div>
                    {/* Card grid */}
                    <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-amber-50/60">
                      {Array.from({ length: 5 }).flatMap((_, r) => Array.from({ length: 5 }).map((_, c) => {
                        const num = celebration.winner_matrix![r][c];
                        const isFree = num === 0;
                        const isWin = winCells.has(`${r}-${c}`);
                        const isCalled = celebration.called?.map(Number).includes(Number(num));
                        return (
                          <div key={`${r}-${c}`} className={`aspect-square flex items-center justify-center font-black text-xs rounded transition-all ${
                            isFree
                              ? 'bg-amber-400 text-amber-950 font-black'
                              : isWin
                              ? 'bg-emerald-500 text-white font-black shadow-md ring-2 ring-amber-300 scale-105 z-10'
                              : isCalled
                              ? 'bg-orange-100 text-slate-800 font-bold'
                              : 'bg-white text-slate-800 border border-slate-100'
                          }`}>
                            {isFree ? '★' : num}
                          </div>
                        );
                      }))}
                    </div>
                    {/* Cartela label + Winning Rule Tag */}
                    <div className="py-2 px-3 flex items-center justify-between bg-white border-t border-amber-200">
                      <p className="text-amber-800 font-black text-[11px] tracking-wider uppercase flex items-center gap-1.5"><LayoutGrid size={13} className="text-amber-500" /> CARTELA {celebration.winner_cartela}</p>
                      <span className="text-emerald-700 text-[10px] font-black uppercase tracking-wider bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 shadow-2xs">
                        {winTitle}
                      </span>
                    </div>
                  </div>
                );
              })() : (
                <div className="w-full bg-amber-50/80 rounded-2xl p-4 mb-3 border border-amber-200 flex flex-col items-center">
                  <div className="animate-spin text-2xl mb-1">⏳</div>
                  <p className="text-amber-800 text-xs font-bold">Loading winning cartela...</p>
                </div>
              )}

              {/* Auto-dismiss indicator */}
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider animate-pulse">{t[language].bingo.returning}</p>
            </>)}

          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewCartela && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setPreviewCartela(null)}>
          <div className="bg-white border-2 border-amber-300 rounded-3xl p-5 w-full max-w-[320px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-slate-800 text-center mb-1 flex items-center justify-center gap-2"><LayoutGrid size={18} className="text-amber-500 shrink-0" /> {t[language].bingo.cartelaNum.trim()} {previewCartela.seat}</h3>
            <p className="text-amber-600 text-[10px] uppercase font-black text-center tracking-widest mb-4">{t[language].bingo.previewNumbers}</p>
            
            <div className="rounded-2xl overflow-hidden border border-amber-200 shadow-md mb-5">
              <div className="grid grid-cols-5">
                {BINGO_LETTERS.map(l => (
                  <div key={l} className="flex items-center justify-center py-1.5 font-black text-white text-sm" style={{ background: LETTER_BG[l] }}>{l}</div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-amber-50/50">
                {Array.from({ length: 5 }).flatMap((_, r) =>
                  Array.from({ length: 5 }, (_, c) => {
                    const num = previewCartela.matrix[r][c];
                    const isFree = num === 0;
                    return (
                      <div key={`${r}-${c}`} className={`aspect-square flex items-center justify-center font-black text-sm rounded-md transition-all duration-300 ${
                        isFree ? 'bg-amber-400 text-amber-950 shadow-xs' : 'bg-white text-slate-800 border border-slate-100 shadow-xs'
                      }`}>{isFree ? '★' : num}</div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPreviewCartela(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-black active:scale-95 transition-transform border border-slate-200">{t[language].bingo.cancel}</button>
              <button onClick={() => joinGame(previewCartela.seat, previewCartela.matrix)} className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black active:scale-95 transition-transform shadow-[0_4px_16px_rgba(16,185,129,0.4)] border border-emerald-400">
                {t[language].bingo.buy.replace('{stake}', String(game?.stake || 0))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
