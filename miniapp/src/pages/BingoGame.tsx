import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Gift, RefreshCw, Users, Clock, Trophy, Volume2, VolumeX, RotateCcw, LayoutGrid, Wand2, Hand, DoorOpen, Gamepad2, Flame } from "lucide-react";
import WebApp from "@twa-dev/sdk";
import { supabase } from "../lib/supabase";
import { useGameStore, Room } from "../store/gameStore";
import { t } from '../lib/translations';

const API = import.meta.env.VITE_API_URL || "/api";

interface BGame {
  id: string; game_id: string; stake: number; prize_pool: number;
  status: "waiting" | "calling" | "finished";
  called_numbers: number[];
  winner_cartela: number | null; winner_telegram_id: string | null;
  winner_first_name: string | null; winner_prize: number | null;
  start_at: string; finished_at: string | null;
}
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
  const [showStakeDropdown, setShowStakeDropdown] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState<number>(150);
  const [maxCartelasPerUser, setMaxCartelasPerUser] = useState<number>(2);
  const [myCartelas, setMyCartelas] = useState<Array<{ cartela_number: number; card_matrix: number[][] }>>([]);
  const [activeCartelaIdx, setActiveCartelaIdx] = useState(0);
  const [uniquePlayers, setUniquePlayers] = useState<number>(0);
  const [previewCartela, setPreviewCartela] = useState<{ seat: number; matrix: number[][] } | null>(null);
  const [homeGames, setHomeGames] = useState<Record<number, { pool: number; start_at?: string; status: string; players: number }>>({});
  const [homeTimeLeft, setHomeTimeLeft] = useState<Record<number, number>>({});
  const [soundEnabled, setSoundEnabled] = useState(true); // default ON
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

  // Filter/sort rooms in BingoGame rooms page
  const filteredRooms = [...rooms].sort((a, b) => {
    if (roomSortFilter === 'most_players') return (b.total_players || 0) - (a.total_players || 0);
    if (roomSortFilter === 'most_games') return (b.total_games || 0) - (a.total_games || 0);
    if (roomSortFilter === 'newest') return 0; // already ordered by created_at from API
    return 0; // 'all' — keep original order
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
      // Use backend API — service key bypasses RLS so unique player count is always accurate
      const r = await fetch(`${API}/bingo/pools`, { headers: hdrs() });
      if (!r.ok || !isMounted) return;
      const { pools } = await r.json();
      const p: Record<number, any> = {};
      (pools || []).forEach((g: any) => {
        p[Number(g.stake)] = {
          pool: g.prize_pool,
          start_at: g.start_at,
          status: g.status,
          players: g.unique_players,
        };
      });
      if (isMounted) setHomeGames(p);
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
  }, [selectedStake]);

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

  // Keep AudioContext resumed and mobile media pipeline unlocked on any touch
  const unlockAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch(e) {}

    try {
      const dummy = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
      dummy.volume = 0.01;
      dummy.play().catch(() => {});
    } catch(e) {}
  }, []);

  const initWebAudio = unlockAudio;

  // Listen continuously on window touch/click so audio never gets suspended during game
  useEffect(() => {
    const handleGesture = () => unlockAudio();
    window.addEventListener('touchstart', handleGesture, { passive: true });
    window.addEventListener('touchend', handleGesture, { passive: true });
    window.addEventListener('click', handleGesture, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleGesture);
      window.removeEventListener('touchend', handleGesture);
      window.removeEventListener('click', handleGesture);
    };
  }, [unlockAudio]);

  // ── RAW ARRAYBUFFER CACHE: fetched at startup, no AudioContext needed yet ──────────────────
  const rawBufferCache = useRef<Map<string, ArrayBuffer>>(new Map());

  // Pre-fetch ALL 75 call files + bingo_win as raw ArrayBuffers immediately on mount.
  // We do NOT need AudioContext for fetching. Decoding happens on-demand when we need to play.
  useEffect(() => {
    let cancel = false;
    const preload = async () => {
      const allSrcs = [
        ...Array.from({ length: 75 }, (_, i) => getAudioSrc(i + 1)),
        '/audio/bingo/bingo_win.mp3',
      ];
      // Stagger: 3 files concurrently, small gap between batches
      for (let i = 0; i < allSrcs.length; i += 3) {
        if (cancel) break;
        await Promise.all(
          allSrcs.slice(i, i + 3).map(async (src) => {
            if (rawBufferCache.current.has(src)) return;
            try {
              const res = await fetch(src);
              if (res.ok) rawBufferCache.current.set(src, await res.arrayBuffer());
            } catch {}
          })
        );
        await new Promise(r => setTimeout(r, 50));
      }
    };
    preload();
    return () => { cancel = true; };
  }, []);

  // ── CORE WEBAUDIO PLAYER: decodes from raw cache or fetches fresh ────────────────────────
  const playViaWebAudio = useCallback(async (src: string, customGain?: number) => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();

      // Use pre-decoded AudioBuffer if cached
      let audioBuf = audioBufferCache.current.get(src);
      if (!audioBuf) {
        // Use raw bytes from preload cache (already fetched at startup)
        let raw = rawBufferCache.current.get(src);
        if (!raw) {
          const res = await fetch(src);
          if (!res.ok) return;
          raw = await res.arrayBuffer();
          rawBufferCache.current.set(src, raw);
        }
        // Must clone (.slice) the ArrayBuffer — decodeAudioData detaches the original
        audioBuf = await ctx.decodeAudioData(raw.slice(0));
        audioBufferCache.current.set(src, audioBuf);
      }

      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      gainNode.gain.value = customGain !== undefined ? customGain : Math.min(2.0, volume * 1.5);
      source.buffer = audioBuf;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    } catch(e) {
      console.warn('WebAudio error:', e);
    }
  }, [volume]);

  // ── CALLER SOUND ─────────────────────────────────────────────────────────────────────────
  // Uses ONE reusable <audio> element. Sets .src then calls .load() before .play().
  // This is the ONLY reliable pattern on Android WebView / Telegram:
  //   - .load() resets the media pipeline fully when src changes
  //   - prevents silent "media session not acquired" failures
  //   - WebAudio is the fallback if HTMLAudio errors
  const callAudioElRef = useRef<HTMLAudioElement | null>(null);

  const playCallAudio = useCallback((num: number) => {
    if (!soundEnabled) return;
    const cleanNum = Number(num);
    if (!cleanNum || isNaN(cleanNum) || cleanNum < 1 || cleanNum > 75) return;

    setLastCallNum(cleanNum);
    setCallAnim(false);
    setTimeout(() => setCallAnim(true), 20);

    const src = getAudioSrc(cleanNum);
    unlockAudio();

    // Create the shared audio element once, reuse it every call
    if (!callAudioElRef.current) {
      callAudioElRef.current = new Audio();
    }
    const audio = callAudioElRef.current;

    // Stop and reset — pause() then clear src so browser fully releases media session
    try { audio.pause(); } catch {}
    audio.currentTime = 0;

    // Set new source and LOAD before play (required on Android when changing src)
    audio.src = src;
    audio.volume = Math.min(1.0, Math.max(0.0, volume));

    // onerror → fall back to WebAudio engine (uses pre-fetched rawBufferCache)
    audio.onerror = () => { playViaWebAudio(src); };

    // .load() must be called explicitly when src changes on a reused element
    audio.load();

    const p = audio.play();
    if (p !== undefined) {
      p.catch(() => {
        // Play was blocked (autoplay policy) → use WebAudio which bypasses this
        playViaWebAudio(src);
      });
    }

    callAudioRef.current = audio; // keep ref in sync
  }, [soundEnabled, volume, unlockAudio, playViaWebAudio]);

  // ── CELEBRATION ──────────────────────────────────────────────────────────────────────────
  // Plays ONLY the "Bingo!" announcement voice (/audio/bingo/bingo_win.mp3) — no synth, no fanfare.
  // Plays at full volume, always on.
  const specialAudioElRef = useRef<HTMLAudioElement | null>(null);

  const playSpecial = useCallback((name: string = 'bingo_win') => {
    const src = `/audio/bingo/${name}.mp3`;
    unlockAudio();

    // Stop caller voice immediately so "Bingo!" is loud and clear
    try {
      if (callAudioElRef.current) {
        callAudioElRef.current.pause();
        callAudioElRef.current.currentTime = 0;
      }
    } catch {}

    // Dedicated celebration audio element with explicit .load()
    try {
      if (!specialAudioElRef.current) {
        specialAudioElRef.current = new Audio();
      }
      const audio = specialAudioElRef.current;
      try { audio.pause(); } catch {}
      audio.currentTime = 0;
      audio.src = src;
      audio.volume = 1.0; // Celebration is always full 100% volume
      audio.onerror = () => { playViaWebAudio(src, 1.5); };
      audio.load();

      const p = audio.play();
      if (p !== undefined) {
        p.catch(() => {
          playViaWebAudio(src, 1.5);
        });
      }
    } catch {
      playViaWebAudio(src, 1.5);
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
  const gameIdRef = useRef<string | null>(null);
  const prevCalledLenRef = useRef(0);
  const hadCartelasRef = useRef(false);

  const fetchState = useCallback(async () => {
    if (!selectedStake) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/bingo/current?stake=${selectedStake}`, { headers: hdrs() });
      if (r.ok) {
        const d = await r.json();
        if (d.max_players) setMaxPlayers(Number(d.max_players));
        if (d.max_cartelas_per_user) setMaxCartelasPerUser(Number(d.max_cartelas_per_user));
        if (d.my_cartelas) setMyCartelas(d.my_cartelas);
        if (d.unique_players !== undefined) setUniquePlayers(Number(d.unique_players));
        if (d.game && d.game.id !== gameIdRef.current) {
          setGame(d.game); setTaken(d.taken_cartelas ?? []); setMyCard(d.my_card ?? null);
          gameIdRef.current = d.game.id;
          prevCalledLenRef.current = d.game.called_numbers?.length || 0;
        } else if (d.game) {
          setGame(d.game); setTaken(d.taken_cartelas ?? []); setMyCard(d.my_card ?? null);
        }
      }
    } catch { } finally { setLoading(false); }
  }, [selectedStake]);

  useEffect(() => { if (selectedStake) fetchState(); }, [selectedStake, fetchState]);

  useEffect(() => {
    if (!selectedStake) return;
    const ch = supabase.channel(`bingo-rt-${selectedStake}-${Date.now()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bingo_games" }, ({ new: g }) => {
        if (Number(g.stake) === selectedStake) setGame(g as BGame);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bingo_games" }, () => { fetchState(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bingo_players" }, ({ new: p }) => {
        const np = p as { game_id: string; cartela_number: number; telegram_id: string };
        if (np.game_id === gameIdRef.current) {
          setTaken(prev => prev.includes(np.cartela_number) ? prev : [...prev, np.cartela_number]);
          // Re-fetch to get accurate unique_players count (same user may buy multiple cartelas)
          fetchState();
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedStake, fetchState]);

  useEffect(() => {
    if (!game || game.status !== "waiting") return;
    const update = () => {
      if (document.visibilityState === 'hidden') return;
      setTimeLeft(Math.max(0, Math.ceil((new Date(game.start_at).getTime() - Date.now()) / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [game?.status, game?.start_at]);

  const called = game?.called_numbers ?? [];
  const lastNum = called.length > 0 ? Number(called[called.length - 1]) : null;

  useEffect(() => {
    if (game?.status === 'calling' && called.length > prevCalledLenRef.current) {
      if (lastNum) { playCallAudio(lastNum); }
      if (WebApp?.HapticFeedback) WebApp.HapticFeedback.impactOccurred('medium');
    }
    prevCalledLenRef.current = called.length;
  }, [called.length, game?.status, lastNum, playCallAudio]);

  const hasCelebratedRef = useRef<string | null>(null);

  // Fire celebration when game finishes — play sound + fetch winner card
  useEffect(() => {
    if (game?.status !== 'finished') return;
    if (hasCelebratedRef.current === game.id) return;
    // Guard: wait for backend to finish populating winner fields before celebrating
    if (!game.winner_cartela && game.winner_first_name !== 'REMATCH') return;

    hasCelebratedRef.current = game.id;

    // ── REMATCH: 3+ way tie ───────────────────────────────────────────────────
    if (game.winner_first_name === 'REMATCH') {
      playSpecial('bingo_win');
      setCelebration({
        winner_name: 'REMATCH',
        winner_cartela: 0,
        winner_prize: 0,
        winner_matrix: null,
        iWon: false,
        called: [...(game.called_numbers || [])],
      });
      return;
    }

    // ── Normal or 2-way tie ───────────────────────────────────────────────────
          const iWon = game.winner_telegram_id === String(user?.telegram_id);
      let isMounted = true;
      playSpecial('bingo_win');
      
      if (game.winner_first_name && game.winner_first_name.includes(' & ')) {
        fetch(`${API}/bingo/winners?game_id=${game.id}`, { headers: hdrs() })
          .then(r => r.json())
          .then(data => {
            if (!isMounted) return;
            setCelebration({
              winner_name: game.winner_first_name || 'Player',
              winner_cartela: 0,
              winner_prize: game.winner_prize!,
              winner_matrix: null,
              winners_list: data.winners,
              iWon, called: [...game.called_numbers]
            });
          }).catch(() => {
            if (isMounted) setCelebration({ winner_name: game.winner_first_name || 'Player', winner_cartela: 0, winner_prize: game.winner_prize!, winner_matrix: null, iWon, called: [...game.called_numbers] });
          });
      } else {
        const localCard = myCartelas.find(c => c.cartela_number === game.winner_cartela)?.card_matrix;
        if (localCard) {
          setCelebration({
            winner_name: game.winner_first_name || 'Player',
            winner_cartela: game.winner_cartela!,
            winner_prize: game.winner_prize!,
            winner_matrix: localCard,
            iWon, called: [...(game.called_numbers || [])]
          });
        } else {
          fetch(`${API}/bingo/card?game_id=${game.id}&cartela=${game.winner_cartela}`, { headers: hdrs() })
            .then(r => r.json())
            .then(data => {
              if (!isMounted) return;
              setCelebration({
                winner_name: game.winner_first_name || 'Player',
                winner_cartela: game.winner_cartela!,
                winner_prize: game.winner_prize!,
                winner_matrix: data.matrix || null,
                iWon, called: [...(game.called_numbers || [])]
              });
            }).catch(() => {
              if (isMounted) setCelebration({ winner_name: game.winner_first_name || 'Player', winner_cartela: game.winner_cartela!, winner_prize: game.winner_prize!, winner_matrix: null, iWon, called: [...(game.called_numbers || [])] });
            });
        }
      }
      return () => { isMounted = false; };
  }, [game?.status, game?.id, game?.winner_cartela, game?.winner_first_name]);

  // Auto-dismiss celebration after 2 seconds
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => {
      setCelebration(null);
      setMyCard(null);
      setMyCartelas([]);
      setActiveCartelaIdx(0);
      setTaken([]);
      hasCelebratedRef.current = null; // Reset so subsequent games celebrate cleanly
      fetchState();
      refreshUser();
    }, 2000);
    return () => clearTimeout(timer);
  }, [celebration]);

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
    setBuying(seat); setErrMsg("");
    setTaken(prev => [...prev, seat]);
    const stakeAmt = game.stake;
    let nb = bonusBal, nm = mainBal;
    if (nb >= stakeAmt) { nb -= stakeAmt; } else { nm -= stakeAmt - nb; nb = 0; }
    useGameStore.setState(s => ({ user: s.user ? { ...s.user, main_balance: nm, bonus_balance: nb } : s.user }));
    // Optimistic: pot = (total cartelas + 1) × stake; commission only if unique players >= 3
    const isFirstCartela = myCartelas.length === 0;
    const newUniquePlayers = isFirstCartela ? uniquePlayers + 1 : uniquePlayers;
    const newTotalCartelas = taken.length + 1;
    const rawPool = newTotalCartelas * stakeAmt;
    setGame(prev => prev ? { ...prev, prize_pool: newUniquePlayers < 3 ? rawPool : Math.floor(rawPool * 0.8) } : prev);
    try {
      const r = await fetch(`${API}/bingo/join`, { method: "POST", headers: hdrs(), body: JSON.stringify({ cartela_number: seat, stake: selectedStake, card_matrix: matrix }) });
      const d = await r.json();
      if (r.ok) {
        if (WebApp?.HapticFeedback) WebApp.HapticFeedback.notificationOccurred("success");
        const newCard = { cartela_number: seat, card_matrix: d.card_matrix };
        setMyCartelas(prev => [...prev, newCard]);
        setMyCard(newCard); // also set my_card for backward compat
        if (d.unique_players !== undefined) setUniquePlayers(Number(d.unique_players));
        refreshUser();
      } else {
        setTaken(prev => prev.filter(n => n !== seat));
        useGameStore.setState(s => ({ user: s.user ? { ...s.user, main_balance: mainBal, bonus_balance: bonusBal } : s.user }));
        setErrMsg(d.error ?? "Could not join."); fetchState();
      }
    } catch { setErrMsg("Network error"); } finally { setBuying(null); }
  };

  const fm = (a: number | undefined) => (a || 0).toLocaleString("en-US");
  const initial = user?.first_name ? user.first_name.charAt(0).toUpperCase() : "U";
  let statusTxt = "Finished", statusCls = "text-slate-400";
  if (game?.status === "waiting") { statusTxt = timeLeft > 86400 ? "Waiting..." : `${timeLeft}s`; statusCls = "text-orange-400"; }
  else if (game?.status === "calling") { statusTxt = "Active"; statusCls = "text-emerald-400"; }

  const Header = () => (
    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-lg">{initial}</div>
        <p className="font-bold text-sm uppercase tracking-wider text-slate-200">{user?.first_name || "USER"}</p>
      </div>
      <div className="flex items-center space-x-4 text-right">
        <div className="flex flex-col items-center"><Gift size={14} className="text-purple-400 mb-0.5" /><p className="text-xs font-bold text-slate-300">{fm(user?.bonus_balance)} ETB</p></div>
        <div className="flex flex-col items-end"><p className="text-[11px] text-slate-400">{t[language].bingo.wallet}</p><p className="text-sm font-bold text-green-400">{fm(user?.main_balance)} ETB</p></div>
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

          {/* Navigation Bar: Back & Filter */}
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
                <span className="hidden xs:inline">
                  {roomSortFilter === 'all' ? (language === 'am' ? 'ፍጥን' : 'Filter') : BINGO_FILTER_OPTIONS.find(o => o.key === roomSortFilter)?.label}
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
                  {language === 'am' ? 'ምንም ክፍሎች የሉም' : 'No active rooms yet'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {language === 'am' ? 'ክፍሎች ሲዘጋጁ እዚህ ይታያሉ' : 'Rooms will appear here once agents create them'}
                </p>
                <button
                  onClick={handleRefreshRooms}
                  className="mt-2 px-4 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-black active:scale-95 shadow-sm"
                >
                  {language === 'am' ? 'አድስ (Refresh)' : 'Refresh'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pb-2">
                {filteredRooms.map((room, idx) => {
                  const gradient = ROOM_GRADIENTS[idx % ROOM_GRADIENTS.length];
                  return (
                    <div
                      key={room.id}
                      onClick={() => handleSelectRoom(room)}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden flex flex-col cursor-pointer active:scale-95 transition-all duration-200 hover:shadow-md"
                    >
                      {/* Card Banner Header */}
                      <div className={`h-20 bg-gradient-to-br ${gradient} flex flex-col items-center justify-center relative px-2.5 text-center shadow-xs`}>
                        <div className="absolute top-2 right-2 flex items-center space-x-1 bg-black/25 backdrop-blur-xs px-1.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                          <span className="text-[7px] font-black text-white uppercase tracking-wider">LIVE</span>
                        </div>
                        <span className="text-white font-black text-base drop-shadow-sm leading-tight line-clamp-2 px-1">
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

  if (loading && !game) return <div className="h-[calc(100dvh-80px)] w-full bg-[#05081a] flex items-center justify-center"><RefreshCw size={28} className="text-orange-500 animate-spin" /></div>;

  if (!game) return (
    <div className="h-[calc(100dvh-80px)] w-full bg-[#05081a] flex flex-col items-center justify-center text-white gap-4">
      <span className="text-5xl">🎱</span>
      <p className="font-bold text-lg">{t[language].bingo.preparingNext}</p>
      <button onClick={fetchState} className="px-6 py-2.5 bg-orange-500 text-black font-black rounded-full text-sm">{t[language].bingo.refresh}</button>
      <button onClick={() => setSelectedStake(null)} className="text-white/40 text-xs underline mt-2">{t[language].bingo.changeStake}</button>
    </div>
  );

  const renderCallingBoard = () => {
    const recent = [...called].reverse().slice(0, 4);
    const currentLetter = lastNum ? getLetter(lastNum) : null;
    const currentAmharic = lastNum ? AMHARIC_NUM[lastNum] : null;

    return (
      <div className="h-full flex flex-col px-1 pt-1 pb-2 gap-1">

        {/* Top Info Bar */}
        <div className="flex items-center justify-between bg-[#0f172a] px-2 py-1 rounded-xl border border-slate-800 shrink-0">
          <div className="text-slate-400 text-[9px] font-bold">ID: {game.game_id}</div>
          <div className="flex items-center gap-1 text-yellow-400 text-[9px] font-bold"><Trophy size={10}/> {game.prize_pool} ETB</div>
          <div className="flex items-center gap-1 text-blue-400 text-[9px] font-bold"><LayoutGrid size={10}/> {taken.length}</div>
          <div className="flex items-center gap-1 text-emerald-400 text-[9px] font-bold"><Clock size={10}/> {called.length}/75</div>
          <div className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-black animate-pulse">LIVE</div>
        </div>

        {/* 1-75 Tracker Board — slightly larger */}
        <div className="bg-[#0b1120] rounded-xl px-1.5 py-1.5 border border-slate-800 shrink-0">
          <div className="flex flex-col gap-[3px]">
            {BINGO_LETTERS.map((letter, rowIndex) => (
              <div key={letter} className="flex items-center gap-1">
                <div className="w-4 flex-shrink-0 flex items-center justify-center font-black text-[10px]" style={{ color: LETTER_COLOR[letter] }}>{letter}</div>
                <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
                  {Array.from({ length: 15 }, (_, i) => {
                    const num = rowIndex * 15 + i + 1;
                    const isCalled = called.includes(num);
                    const isLatest = num === lastNum;
                    return (
                      <div key={num} className={`h-[20px] rounded-[3px] flex items-center justify-center text-[8px] font-bold transition-all ${
                        isLatest ? 'bg-white text-black shadow-[0_0_4px_rgba(255,255,255,0.8)]' :
                        isCalled ? 'bg-yellow-500 text-yellow-950' : 'bg-slate-800/60 text-slate-500'
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
          <div className="shrink-0 bg-[#0a0f1e] rounded-xl border border-white/5 px-2 py-1.5 w-full max-w-[320px] mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {recent.length === 0 ? (
                  <span className="text-slate-500 text-[10px] font-bold animate-pulse">Waiting...</span>
                ) : recent.map((num, idx) => {
                  const l = getLetter(num);
                  const isFirst = idx === 0;
                  if (isFirst) {
                    return (
                      <div key={`${num}-${idx}`} className="flex items-center gap-2">
                        <div className="w-11 h-11 flex flex-col items-center justify-center rounded-full font-black border-2 border-yellow-400 bg-yellow-400/20 shadow-[0_0_12px_rgba(250,204,21,0.3)]">
                          <span style={{ color: LETTER_COLOR[l] }} className="text-[10px] leading-none font-black">{l}</span>
                          <span className="text-white text-lg leading-none font-black">{num}</span>
                        </div>
                        <span className="text-yellow-400 font-black text-sm">{AMHARIC_NUM[num]}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={`${num}-${idx}`} className="w-7 h-7 flex flex-col items-center justify-center rounded-full border border-slate-700 bg-slate-800/60 opacity-50">
                      <span style={{ color: LETTER_COLOR[l] }} className="text-[7px] leading-none font-black">{l}</span>
                      <span className="text-white text-[10px] leading-none font-black">{num}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setAutoMark(a => !a)} className={`w-8 h-8 rounded-lg border flex items-center justify-center active:scale-90 ${autoMark ? 'bg-amber-500/20 border-amber-500/50' : 'bg-slate-800 border-slate-700'}`}>
                  {autoMark ? <Wand2 size={13} className="text-amber-400" /> : <Hand size={13} className="text-slate-400" />}
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
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center active:scale-90 ${soundEnabled ? 'bg-blue-500/20 border-blue-500/50' : 'bg-slate-800 border-slate-700'}`}>
                  {soundEnabled ? <Volume2 size={13} className="text-blue-400" /> : <VolumeX size={13} className="text-red-400" />}
                </button>
              </div>
            </div>
          </div>

          {/* My Cards — dynamic layout: 1 card = centered classic; 2+ cards = all visible side-by-side grid */}
          {myCartelas.length > 0 ? (
            myCartelas.length === 1 ? (
              /* Single Cartela — exact same classic centered layout as preset */
              <div key={myCartelas[0].cartela_number} className="w-full max-w-[250px] mx-auto">
                <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: 'linear-gradient(145deg,#1a2540,#0f1829)' }}>
                  {/* BINGO Header */}
                  <div className="grid grid-cols-5">
                    {BINGO_LETTERS.map(l => (
                      <div key={l} className="flex items-center justify-center py-1 font-black text-white text-xs" style={{ background: LETTER_BG[l] }}>{l}</div>
                    ))}
                  </div>
                  {/* Card Grid */}
                  <div className="grid grid-cols-5 gap-[3px] p-[3px] bg-[#0a0f1e]">
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
                              isFree ? 'bg-yellow-400 text-yellow-900' :
                              isLast && autoMark ? 'bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.7)]' :
                              marked ? 'bg-emerald-500 text-white' :
                              canTap ? 'bg-white text-[#1a2540] active:scale-95 cursor-pointer ring-1 ring-blue-400/50' :
                              'bg-white text-[#1a2540]'
                            }`}
                          >{isFree ? '★' : num}</div>
                        );
                      })
                    )}
                  </div>
                  {/* Cartela Label */}
                  <div className="py-1 text-center bg-[#0a0f1e] border-t border-white/10">
                    <p className="text-white/70 font-black text-[9px] tracking-widest uppercase">{t[language].bingo.cartelaNum} {myCartelas[0].cartela_number}</p>
                  </div>
                </div>
              </div>
            ) : (
              /* 2 or More Cartelas — Side-by-side grid, ALL visible without any hidden tabs! */
              <div className="w-full flex flex-col gap-1 px-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-white/60 text-[10px] font-bold tracking-wider uppercase">CARTELAS ({myCartelas.length})</span>
                  <span className="text-emerald-400 text-[8px] font-black uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">All Active</span>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full">
                  {myCartelas.map((card) => (
                    <div key={card.cartela_number} className="w-full">
                      <div className="rounded-xl overflow-hidden border border-white/10 shadow-md" style={{ background: 'linear-gradient(145deg,#1a2540,#0f1829)' }}>
                        {/* BINGO Header */}
                        <div className="grid grid-cols-5">
                          {BINGO_LETTERS.map(l => (
                            <div key={l} className="flex items-center justify-center py-0.5 font-black text-white text-[10px]" style={{ background: LETTER_BG[l] }}>{l}</div>
                          ))}
                        </div>
                        {/* Card Grid */}
                        <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-[#0a0f1e]">
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
                                    isFree ? 'bg-yellow-400 text-yellow-900 font-black' :
                                    isLast && autoMark ? 'bg-orange-500 text-white shadow-[0_0_6px_rgba(249,115,22,0.8)]' :
                                    marked ? 'bg-emerald-500 text-white' :
                                    canTap ? 'bg-white text-[#1a2540] active:scale-95 cursor-pointer ring-1 ring-blue-400/50' :
                                    'bg-white text-[#1a2540]'
                                  }`}
                                >
                                  {isFree ? '★' : num}
                                </div>
                              );
                            })
                          )}
                        </div>
                        {/* Cartela Label */}
                        <div className="py-0.5 px-2 flex items-center justify-between bg-[#0a0f1e] border-t border-white/10">
                          <p className="text-yellow-400 font-black text-[8px] tracking-wider uppercase">#{card.cartela_number}</p>
                          <span className="text-white/40 text-[7px] font-bold uppercase">{t[language].bingo.cartelaNum.trim()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="w-full max-w-[250px] mx-auto relative mt-1 pointer-events-none">
              <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: 'linear-gradient(145deg,#1a2540,#0f1829)' }}>
                {/* BINGO Header */}
                <div className="grid grid-cols-5">
                  {BINGO_LETTERS.map(l => (
                    <div key={l} className="flex items-center justify-center py-1 font-black text-white text-xs" style={{ background: LETTER_BG[l] }}>{l}</div>
                  ))}
                </div>
                
                {/* Dummy Grid */}
                <div className="grid grid-cols-5 gap-[3px] p-[3px] bg-[#0a0f1e]">
                  {Array.from({ length: 5 }).flatMap((_, r) => 
                    Array.from({ length: 5 }, (_, c) => {
                      const isFree = r === 2 && c === 2;
                      const num = isFree ? '★' : (c * 15) + r + (c % 2 === 0 ? 3 : 8);
                      return (
                        <div key={`${r}-${c}`} className={`aspect-square flex items-center justify-center font-black text-sm rounded-lg ${
                          isFree ? 'bg-yellow-400 text-yellow-900' : 'bg-white text-[#1a2540]'
                        }`}>{num}</div>
                      );
                    })
                  )}
                </div>

                {/* Overlay Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10">
                  <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-3 border border-red-500/30">
                    <span className="text-xl animate-pulse">⏳</span>
                  </div>
                  <h3 className="text-red-400 font-black text-lg uppercase tracking-widest mb-1 shadow-[0_0_10px_rgba(239,68,68,0.5)]">Match is active</h3>
                  <p className="text-white/80 text-[10px] font-bold text-center px-4 leading-relaxed uppercase tracking-wider">
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
    <div className="flex-1 overflow-y-auto relative p-2 pb-16">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-cyan-300 font-black uppercase tracking-widest">
          {canPickMore ? `TAP TO PICK — ${taken.length}/${maxPlayers} TAKEN` : `ALL CARTELAS SELECTED ✓`}
        </p>
        <p className="text-[10px] text-yellow-300 font-black">
          {myCartelas.length}/{maxCartelasPerUser} PICKED
        </p>
      </div>
      {/* My Cartelas chips */}
      {myNums.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {myNums.map(n => (
            <span key={n} className="px-3 py-1 bg-emerald-500 text-white text-xs font-black rounded-full ring-2 ring-yellow-300">#{n} ✓</span>
          ))}
        </div>
      )}
      <div className="rounded-2xl border-[3px] border-cyan-400 overflow-hidden bg-[#05081a] shadow-[0_0_25px_rgba(34,211,238,0.4)]">
        <div className="grid gap-[2px] p-[2px]" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
          {Array.from({ length: maxPlayers }, (_, i) => {
            const n = i + 1;
            const isTaken = taken.includes(n), isMine = myNums.includes(n), isBuying = buying === n;
            if (isMine) {
              return (
                <div key={n} className="aspect-square flex items-center justify-center rounded-[7px] text-[10px] font-black bg-emerald-500 text-white ring-[2.5px] ring-yellow-300 z-10">
                  ✓
                </div>
              );
            }
            if (isTaken) {
              return (
                <div key={n} className="aspect-square flex items-center justify-center rounded-[7px] text-[9px] font-black bg-red-900/60 text-red-300/50 border border-red-700/30">
                  ✕
                </div>
              );
            }
            return (
              <button key={n} disabled={buying !== null || !canPickMore} onClick={() => openPreview(n)}
                className={`aspect-square flex items-center justify-center rounded-[7px] text-[11px] font-black transition-all duration-150 ${!canPickMore ? 'bg-white/20 text-white/30 cursor-not-allowed' : isBuying ? 'bg-white opacity-40 scale-90' : 'bg-white text-black active:scale-90 cursor-pointer'}`}>
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
    <div className="h-[calc(100dvh-80px)] w-full bg-[#05081a] flex flex-col select-none" onClick={initWebAudio}>
      <div className="sticky top-0 z-40 bg-[#05081a] flex flex-col shrink-0">
        <Header />
        {game.status === 'waiting' && (
          <div className="bg-[#0a0d1f] px-3 pt-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setSelectedStake(null)} className="h-9 w-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl"><ArrowLeft size={18} className="text-white" /></button>
              <div className="relative">
                <button 
                  onClick={() => {
                    if (myCartelas.length === 0) setShowStakeDropdown(!showStakeDropdown);
                  }}
                  className={`flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl pl-3 pr-3 h-9 text-white font-black text-sm transition-colors ${myCartelas.length > 0 ? 'opacity-50 cursor-not-allowed' : 'active:bg-white/10'}`}
                >
                  <span>{selectedStake} ETB</span>
                  <ChevronDown size={14} className={`text-white/50 transition-transform ${showStakeDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {/* Dropdown Menu */}
                {showStakeDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowStakeDropdown(false)} />
                    <div className="absolute top-[calc(100%+8px)] left-0 w-32 bg-[#1a2540] border border-white/10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-50 overflow-hidden">
                      {[10, 20, 50, 100].map(val => (
                        <button
                          key={val}
                          onClick={() => {
                            setSelectedStake(val);
                            setGame(null); setMyCard(null); setMyCartelas([]); setActiveCartelaIdx(0); setTaken([]);
                            setShowStakeDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-3 flex items-center justify-between border-b border-white/5 last:border-0 hover:bg-white/5 active:bg-white/10 transition-colors ${selectedStake === val ? 'text-white' : 'text-slate-400'}`}
                        >
                          <span className="font-black text-sm">{val} ETB</span>
                          {selectedStake === val && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="flex-1 bg-white/5 border border-white/10 rounded-xl h-9 flex flex-col items-center justify-center">
                <span className="text-[9px] text-white/30 font-bold leading-none">{t[language].bingo.gameId}</span>
                <span className="text-sm font-black text-white leading-tight">{game.game_id}</span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              <div className="bg-white/5 border border-white/5 rounded-xl py-1.5 text-center"><p className="text-[8px] text-white/30 font-bold uppercase">{t[language].bingo.stake}</p><p className="text-xs font-black text-white">{game.stake} ETB</p></div>
              <div className="bg-white/5 border border-white/5 rounded-xl py-1.5 text-center"><p className="text-[8px] text-white/30 font-bold uppercase">{t[language].bingo.players}</p><p className="text-xs font-black text-emerald-400">{uniquePlayers}</p></div>
              <div className="bg-white/5 border border-white/5 rounded-xl py-1.5 text-center"><p className="text-[8px] text-white/30 font-bold uppercase">{t[language].bingo.cartelas}</p><p className="text-xs font-black text-cyan-400">{taken.length}</p></div>
              <div className="bg-white/5 border border-white/5 rounded-xl py-1.5 text-center"><p className="text-[8px] text-white/30 font-bold uppercase">{t[language].bingo.derash}</p><p className="text-xs font-black text-yellow-400">{game.prize_pool} ETB</p></div>
              <div className="bg-white/5 border border-white/5 rounded-xl py-1.5 text-center"><p className="text-[8px] text-white/30 font-bold uppercase">{t[language].bingo.status}</p><p className={`text-xs font-black ${statusCls}`}>{statusTxt}</p></div>
            </div>
          </div>
        )}
      </div>

      {errMsg && (
        <div className="mx-3 mt-2 px-3 py-2 bg-red-500/20 border border-red-500/40 rounded-xl flex items-center justify-between z-10 shrink-0">
          <p className="text-red-400 text-xs font-bold">{errMsg}</p>
          <button onClick={() => setErrMsg("")} className="text-red-400 text-base leading-none ml-2">✕</button>
        </div>
      )}

      <div className={`flex-1 min-h-0 ${game.status === 'waiting' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {game.status === 'waiting' ? renderCartelaPicker() : renderCallingBoard()}
      </div>

      {/* Winner Celebration */}
      {celebration && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-3 bg-black/95 backdrop-blur-md overflow-y-auto">
          <div className="bg-gradient-to-b from-[#1a0a3e] to-[#0a0f1e] border border-yellow-400/30 rounded-3xl p-4 text-center max-w-sm w-full shadow-[0_0_40px_rgba(250,204,21,0.3)] flex flex-col items-center relative">

            {/* Close button */}
            <button
              onClick={() => { setCelebration(null); setMyCard(null); setMyCartelas([]); setActiveCartelaIdx(0); setTaken([]); fetchState(); refreshUser(); }}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/50 active:scale-90 transition-all text-sm font-black z-10"
            >✕</button>

            {/* ── REMATCH ── */}
            {celebration.winner_name === 'REMATCH' ? (<>
              <div className="text-5xl mb-2 animate-spin">🔄</div>
              <h2 className="text-3xl font-black text-orange-400 mb-2">{t[language].bingo.rematch}</h2>
              <div className="bg-orange-500/10 rounded-2xl p-3 mb-3 w-full border border-orange-500/30">
                <p className="text-orange-300 font-black text-sm mb-1">{t[language].bingo.tieDesc}</p>
                <p className="text-white/60 text-xs">{t[language].bingo.stakeRefunded}</p>
                <p className="text-white/40 text-xs mt-1">{t[language].bingo.newGameStarts}</p>
              </div>

            {/* ── 2-WAY TIE🌟 */}
              </>) : celebration.winner_name.includes(' & ') ? (<>
                <h2 className="text-xl font-black text-yellow-400 mb-1">{t[language].bingo.tieTitle}</h2>
                <div className="mb-2 inline-block bg-emerald-500/20 text-emerald-400 px-3 py-0.5 rounded-full font-black text-sm border border-emerald-500/30">
                  {celebration.winner_prize} ETB {t[language].bingo.each}
                </div>
                
                {celebration.winners_list && celebration.winners_list.length > 0 ? (
                  <div className="flex gap-2 w-full justify-center overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    {celebration.winners_list.map((w, idx) => {
                      const winCells = getWinningCells(w.card_matrix, celebration.called);
                      const winTitle = getWinningPatternTitle(w.card_matrix, celebration.called);
                      return (
                      <div key={idx} className="flex-shrink-0 w-[140px] bg-white/5 rounded-2xl p-2 border border-white/10 flex flex-col items-center">
                        <p className="text-white font-black text-sm truncate w-full">{w.first_name}</p>
                        <div className="flex items-center justify-between w-full mb-1">
                          <p className="text-yellow-400/70 text-[9px] font-bold">{t[language].bingo.cartelaNum}{w.cartela_number}</p>
                          <span className="text-emerald-400 text-[7px] font-black">{winTitle.replace(' BINGO!', '')}</span>
                        </div>
                        <div className="w-full">
                          <div className="grid grid-cols-5">
                            {['B','I','N','G','O'].map(l => (
                              <div key={l} className="flex items-center justify-center py-0.5 font-black text-white text-[9px]" style={{ background: l==='B'?'#3b82f6':l==='I'?'#8b5cf6':l==='N'?'#ec4899':l==='G'?'#22c55e':'#3b82f6' }}>{l}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-5 gap-[1px] p-[1px] bg-[#0a0f1e]">
                            {w.card_matrix.map((row, r) => row.map((num, c) => {
                              const isFree = num === 0;
                              const isWin = winCells.has(`${r}-${c}`);
                              const isCalled = celebration.called?.map(Number).includes(Number(num));
                              return (
                                <div key={c} className={`aspect-square flex items-center justify-center text-[8px] font-black ${
                                  isFree
                                    ? 'bg-yellow-400 text-yellow-900 font-black'
                                    : isWin
                                    ? 'bg-emerald-500 text-white shadow-[0_0_4px_rgba(16,185,129,0.9)] ring-1 ring-yellow-300 font-black'
                                    : isCalled
                                    ? 'bg-amber-100 text-slate-700'
                                    : 'bg-white text-slate-700'
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
                  <div className="bg-white/5 rounded-2xl p-3 mb-3 w-full border border-white/10">
                    <p className="text-white font-black text-lg">{celebration.winner_name}</p>
                  </div>
                )}
                
                <p className="text-white/30 text-[10px] font-bold animate-pulse">{t[language].bingo.returning}</p>
  
              {/* 🌟  ── */}
            </>) : (<>
              {/* Trophy + BINGO label — NO overlap */}
              <div className="flex flex-col items-center mb-3">
                <div className="text-5xl mb-1 animate-bounce">🏆</div>
                <div className="bg-yellow-400 text-yellow-900 px-6 py-1 rounded-full font-black text-2xl tracking-widest shadow-[0_0_20px_rgba(250,204,21,0.5)]">
                  BINGO!
                </div>
              </div>

              {/* Winner info */}
              <div className="w-full bg-white/5 rounded-2xl p-3 mb-3 border border-white/10">
                <p className="text-white/50 text-[9px] uppercase tracking-widest mb-1">{t[language].bingo.winner}</p>
                <p className="text-white font-black text-xl leading-tight">{celebration.winner_name}</p>
                <p className="text-yellow-400/70 text-xs font-bold mt-0.5">{t[language].bingo.cartelaNum}{celebration.winner_cartela}</p>
                <div className="mt-2 inline-block bg-emerald-500 text-white px-5 py-1 rounded-full font-black text-lg shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                  🎉 {celebration.winner_prize} ETB
                </div>
              </div>

              {/* Winner Card — green win cells, gold ring, pattern badge */}
              {celebration.winner_matrix ? (() => {
                const winCells = getWinningCells(celebration.winner_matrix, celebration.called);
                const winTitle = getWinningPatternTitle(celebration.winner_matrix, celebration.called);
                return (
                  <div className="w-full rounded-2xl overflow-hidden border-2 border-yellow-400/50 mb-3 shadow-[0_0_25px_rgba(250,204,21,0.25)]">
                    {/* BINGO header */}
                    <div className="grid grid-cols-5">
                      {BINGO_LETTERS.map(l => (
                        <div key={l} className="flex items-center justify-center py-1.5 font-black text-white text-sm" style={{ background: LETTER_BG[l] }}>{l}</div>
                      ))}
                    </div>
                    {/* Card grid */}
                    <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-slate-200">
                      {Array.from({ length: 5 }).flatMap((_, r) => Array.from({ length: 5 }).map((_, c) => {
                        const num = celebration.winner_matrix![r][c];
                        const isFree = num === 0;
                        const isWin = winCells.has(`${r}-${c}`);
                        const isCalled = celebration.called?.map(Number).includes(Number(num));
                        return (
                          <div key={`${r}-${c}`} className={`aspect-square flex items-center justify-center font-black text-xs rounded transition-all ${
                            isFree
                              ? 'bg-yellow-400 text-yellow-900 font-black'
                              : isWin
                              ? 'bg-emerald-500 text-white font-black shadow-[0_0_8px_rgba(16,185,129,0.9)] ring-2 ring-yellow-300 scale-105 z-10'
                              : isCalled
                              ? 'bg-amber-100 text-slate-700'
                              : 'bg-white text-slate-700'
                          }`}>
                            {isFree ? '★' : num}
                          </div>
                        );
                      }))}
                    </div>
                    {/* Cartela label + Winning Rule Tag */}
                    <div className="py-2 px-3 flex items-center justify-between bg-[#0a0f1e] border-t border-white/10">
                      <p className="text-yellow-400 font-black text-[11px] tracking-wider uppercase">CARTELA # {celebration.winner_cartela}</p>
                      <span className="text-emerald-400 text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/40 shadow-[0_0_6px_rgba(16,185,129,0.3)]">
                        {winTitle}
                      </span>
                    </div>
                  </div>
                );
              })() : (
                <div className="w-full bg-white/5 rounded-2xl p-4 mb-3 border border-white/10 flex flex-col items-center">
                  <div className="animate-spin text-2xl mb-1">⏳</div>
                  <p className="text-white/60 text-xs font-bold">Loading winning cartela...</p>
                </div>
              )}

              {/* Auto-dismiss indicator */}
              <p className="text-white/30 text-[10px] font-bold animate-pulse">{t[language].bingo.returning}</p>
            </>)}

          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewCartela && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setPreviewCartela(null)}>
          <div className="bg-[#0f1829] border border-cyan-400/30 rounded-3xl p-5 w-full max-w-[320px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-white text-center mb-1">{t[language].bingo.cartelaNum}{previewCartela.seat}</h3>
            <p className="text-cyan-300 text-[10px] uppercase font-bold text-center tracking-widest mb-4">{t[language].bingo.previewNumbers}</p>
            
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_15px_rgba(34,211,238,0.2)] mb-5">
              <div className="grid grid-cols-5">
                {BINGO_LETTERS.map(l => (
                  <div key={l} className="flex items-center justify-center py-1.5 font-black text-white text-sm" style={{ background: LETTER_BG[l] }}>{l}</div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-[#0a0f1e]">
                {Array.from({ length: 5 }).flatMap((_, r) =>
                  Array.from({ length: 5 }, (_, c) => {
                    const num = previewCartela.matrix[r][c];
                    const isFree = num === 0;
                    return (
                      <div key={`${r}-${c}`} className={`aspect-square flex items-center justify-center font-black text-sm rounded-md transition-all duration-300 ${
                        isFree ? 'bg-yellow-400 text-yellow-900' : 'bg-white text-[#1a2540]'
                      }`}>{isFree ? '★' : num}</div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPreviewCartela(null)} className="flex-1 py-3 rounded-xl bg-white/10 text-white font-black active:scale-95 transition-transform border border-white/20">{t[language].bingo.cancel}</button>
              <button onClick={() => joinGame(previewCartela.seat, previewCartela.matrix)} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-black active:scale-95 transition-transform shadow-[0_0_15px_rgba(16,185,129,0.5)] border border-emerald-400">
                {t[language].bingo.buy.replace('{stake}', String(game?.stake || 0))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
