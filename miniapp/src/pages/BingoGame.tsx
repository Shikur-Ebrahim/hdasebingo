import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Gift, RefreshCw, Users, Clock, Trophy, Volume2, VolumeX, RotateCcw, LayoutGrid, Wand2, Hand, DoorOpen, Gamepad2, Flame, X, Star, Sparkles, Bot, Lock } from "lucide-react";
import WebApp from "@twa-dev/sdk";
import { supabase } from "../lib/supabase";
import { useGameStore, Room } from "../store/gameStore";
import { t } from '../lib/translations';
import { getFixedCartelaMatrix } from "../lib/cartela";

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

const hdrs = () => {
  const pwaToken = typeof window !== 'undefined' ? (localStorage.getItem('hdase_pwa_token') || localStorage.getItem('pwa_token')) : null;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (WebApp?.initData) h["x-telegram-init-data"] = WebApp.initData;
  if (pwaToken) h["Authorization"] = `Bearer ${pwaToken}`;
  return h;
};

const ROW_COLORS = [
  "from-blue-500 to-blue-700","from-purple-500 to-purple-700","from-cyan-500 to-cyan-700",
  "from-red-500 to-red-700","from-orange-400 to-orange-600","from-yellow-400 to-yellow-600",
  "from-green-500 to-green-700","from-teal-500 to-teal-700","from-indigo-400 to-indigo-600",
  "from-pink-400 to-pink-600","from-violet-500 to-violet-700","from-blue-400 to-blue-600",
  "from-fuchsia-500 to-fuchsia-700","from-emerald-500 to-emerald-700","from-purple-400 to-purple-600",
];

const DEFAULT_STAKE_OPTIONS = [
  { value: 5, label: "5 ETB", color: "from-emerald-500 to-teal-700" },
  { value: 10, label: "10 ETB", color: "from-blue-500 to-blue-700" },
  { value: 20, label: "20 ETB", color: "from-purple-500 to-purple-700" },
  { value: 35, label: "35 ETB", color: "from-amber-500 to-orange-700" },
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
  1: '\u12a0\u1295\u12f5', 2: '\u1201\u1208\u1275', 3: '\u1226\u1235\u1275', 4: '\u12a0\u122b\u1275', 5: '\u12a0\u121d\u1235\u1275',
  6: '\u1235\u12f5\u1235\u1275', 7: '\u1230\u1263\u1275', 8: '\u1235\u121d\u1295\u1275', 9: '\u12d8\u1320\u129d', 10: '\u12a0\u1235\u122d',
  11: '\u12a0\u1235\u122b \u12a0\u1295\u12f5', 12: '\u12a0\u1235\u122b \u1201\u1208\u1275', 13: '\u12a0\u1235\u122b \u1226\u1235\u1275', 14: '\u12a0\u1235\u122b \u12a0\u122b\u1275', 15: '\u12a0\u1235\u122b \u12a0\u121d\u1235\u1275',
  16: '\u12a0\u1235\u122b \u1235\u12f5\u1235\u1275', 17: '\u12a0\u1235\u122b \u1230\u1263\u1275', 18: '\u12a0\u1235\u122b \u1235\u121d\u1295\u1275', 19: '\u12a0\u1235\u122b \u12d8\u1320\u129d', 20: '\u1200\u12eb',
  21: '\u1200\u12eb \u12a0\u1295\u12f5', 22: '\u1200\u12eb \u1201\u1208\u1275', 23: '\u1200\u12eb \u1226\u1235\u1275', 24: '\u1200\u12eb \u12a0\u122b\u1275', 25: '\u1200\u12eb \u12a0\u121d\u1235\u1275',
  26: '\u1200\u12eb \u1235\u12f5\u1235\u1275', 27: '\u1200\u12eb \u1230\u1263\u1275', 28: '\u1200\u12eb \u1235\u121d\u1295\u1275', 29: '\u1200\u12eb \u12d8\u1320\u129d', 30: '\u1220\u120b\u1233',
  31: '\u1220\u120b\u1233 \u12a0\u1295\u12f5', 32: '\u1220\u120b\u1233 \u1201\u1208\u1275', 33: '\u1220\u120b\u1233 \u1226\u1235\u1275', 34: '\u1220\u120b\u1233 \u12a0\u122b\u1275', 35: '\u1220\u120b\u1233 \u12a0\u121d\u1235\u1275',
  36: '\u1220\u120b\u1233 \u1235\u12f5\u1235\u1275', 37: '\u1220\u120b\u1233 \u1230\u1263\u1275', 38: '\u1220\u120b\u1233 \u1235\u121d\u1295\u1275', 39: '\u1220\u120b\u1233 \u12d8\u1320\u129d', 40: '\u12a0\u122d\u1263',
  41: '\u12a0\u122d\u1263 \u12a0\u1295\u12f5', 42: '\u12a0\u122d\u1263 \u1201\u1208\u1275', 43: '\u12a0\u122d\u1263 \u1226\u1235\u1275', 44: '\u12a0\u122d\u1263 \u12a0\u122b\u1275', 45: '\u12a0\u122d\u1263 \u12a0\u121d\u1235\u1275',
  46: '\u12a0\u122d\u1263 \u1235\u12f5\u1235\u1275', 47: '\u12a0\u122d\u1263 \u1230\u1263\u1275', 48: '\u12a0\u122d\u1263 \u1235\u121d\u1295\u1275', 49: '\u12a0\u122d\u1263 \u12d8\u1320\u129d', 50: '\u1203\u121d\u1233',
  51: '\u1203\u121d\u1233 \u12a0\u1295\u12f5', 52: '\u1203\u121d\u1233 \u1201\u1208\u1275', 53: '\u1203\u121d\u1233 \u1226\u1235\u1275', 54: '\u1203\u121d\u1233 \u12a0\u122b\u1275', 55: '\u1203\u121d\u1233 \u12a0\u121d\u1235\u1275',
  56: '\u1203\u121d\u1233 \u1235\u12f5\u1235\u1275', 57: '\u1203\u121d\u1233 \u1230\u1263\u1275', 58: '\u1203\u121d\u1233 \u1235\u121d\u1295\u1275', 59: '\u1203\u121d\u1233 \u12d8\u1320\u129d', 60: '\u1235\u120d\u1233',
  61: '\u1235\u120d\u1233 \u12a0\u1295\u12f5', 62: '\u1235\u120d\u1233 \u1201\u1208\u1275', 63: '\u1235\u120d\u1233 \u1226\u1235\u1275', 64: '\u1235\u120d\u1233 \u12a0\u122b\u1275', 65: '\u1235\u120d\u1233 \u12a0\u121d\u1235\u1275',
  66: '\u1235\u120d\u1233 \u1235\u12f5\u1235\u1275', 67: '\u1235\u120d\u1233 \u1230\u1263\u1275', 68: '\u1235\u120d\u1233 \u1235\u121d\u1295\u1275', 69: '\u1235\u120d\u1233 \u12d8\u1320\u129d', 70: '\u1230\u1263',
  71: '\u1230\u1263 \u12a0\u1295\u12f5', 72: '\u1230\u1263 \u1201\u1208\u1275', 73: '\u1230\u1263 \u1226\u1235\u1275', 74: '\u1230\u1263 \u12a0\u122b\u1275', 75: '\u1230\u1263 \u12a0\u121d\u1235\u1275',
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

  if (isInnerCorners && !isRow && !isCol && !isDiag) return '\ud83c\udfaf 2ND CORNER BINGO!';
  if (isOuterCorners && !isRow && !isCol && !isDiag) return '\ud83c\udfaf 4 CORNERS BINGO!';
  if (isInnerCorners || isOuterCorners) return '\ud83c\udfaf CORNER BINGO!';
  return 'BINGO!';
};

export default function BingoGame() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, fetchUser: refreshUser, subscribeToBalance, language, rooms, fetchRooms, subscribeToRooms, setAuthModalOpen } = useGameStore();

  const urlStake = searchParams.get("stake");
  const urlRoom = searchParams.get("room");
  const HDASE_OFFICIAL_ROOM_ID = 'd7c9114a-e112-426f-8f9b-13c00050279c';

  // Determine user's effective room:
  const userRoomId = useMemo(() => {
    // 1. If room is in URL, ALWAYS respect it directly!
    if (urlRoom) return urlRoom;
    // 2. Explicit user selection
    const selected = typeof window !== 'undefined' ? localStorage.getItem('hdase_selected_room_id') : null;
    if (selected) return selected;
    // 3. Direct invite session room
    const sessionRoom = typeof window !== 'undefined' ? sessionStorage.getItem('hdase_session_room') : null;
    if (sessionRoom) return sessionRoom;
    // 4. Default: official HDASE room
    return HDASE_OFFICIAL_ROOM_ID;
  }, [urlRoom]);

  const defaultHdaseRoom = rooms.find(r => r.id === HDASE_OFFICIAL_ROOM_ID) || rooms.find(r => r.room_name?.toUpperCase().includes('HDASE')) || rooms.find(r => r.is_pinned) || rooms[0];
  const effectiveRoomId = userRoomId || defaultHdaseRoom?.id || HDASE_OFFICIAL_ROOM_ID;
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(effectiveRoomId);
  const [selectedStake, setSelectedStake] = useState<number | null>(urlStake ? Number(urlStake) : null);
  const [roomsRefreshing, setRoomsRefreshing] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [roomSortFilter, setRoomSortFilter] = useState<'all' | 'most_players' | 'most_games' | 'newest'>('all');
  const [roomSearch, setRoomSearch] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [showStakeDropdown, setShowStakeDropdown] = useState(false);
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState<number>(300);
  const [maxCartelasPerUser, setMaxCartelasPerUser] = useState<number>(4);
  const pendingPurchasesRef = useRef<Set<number>>(new Set());
  const pendingCancelsRef = useRef<Set<number>>(new Set());
  const [myCartelas, setMyCartelas] = useState<Array<{ cartela_number: number; card_matrix: number[][] }>>([]);
  const [activeCartelaIdx, setActiveCartelaIdx] = useState(0);
  const [uniquePlayers, setUniquePlayers] = useState<number>(0);
  const [homeGames, setHomeGames] = useState<Record<number, { pool: number; start_at?: string; status: string; players: number }>>({});
  const fetchPoolsRef = useRef<() => void>(() => {});
  const [homeTimeLeft, setHomeTimeLeft] = useState<Record<number, number>>({});
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('hdase_bingo_sound_enabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [volume, setVolume] = useState(1.0);
  const [autoMark, setAutoMark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('hdase_bingo_auto_mark');
      return saved !== null ? JSON.parse(saved) : true; // Default is MANUAL OFF (Auto mode active)
    } catch {
      return true; // Default is MANUAL OFF (Auto mode active)
    }
  });
  const [manuallyMarked, setManuallyMarked] = useState<Set<number>>(new Set());
  const [bingoLockSeconds, setBingoLockSeconds] = useState<number>(0);

  const toggleAutoMark = () => {
    setAutoMark(prev => {
      const next = !prev;
      try { localStorage.setItem('hdase_bingo_auto_mark', JSON.stringify(next)); } catch {}
      if (game?.id) {
        fetch(`${API}/bingo/mode`, {
          method: 'POST',
          headers: hdrs(),
          body: JSON.stringify({
            game_id: game.id,
            is_manual: !next,
          })
        }).catch(() => {});
      }
      return next;
    });
  };

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('hdase_bingo_sound_enabled', JSON.stringify(next)); } catch {}
      unlockAudio();
      if (next && lastNum) {
        playCallAudio(lastNum);
      }
      return next;
    });
  };

  useEffect(() => {
    if (bingoLockSeconds <= 0) return;
    const t = setInterval(() => {
      setBingoLockSeconds(s => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [bingoLockSeconds]);

  // Subscribe and ensure rooms are loaded
  useEffect(() => {
    if (rooms.length === 0) {
      fetchRooms();
    }
    const unsub = subscribeToRooms();
    return () => { unsub(); };
  }, [fetchRooms, subscribeToRooms, rooms.length]);

  // Keep selectedStake and selectedRoomId in sync if URL query changes or when rooms load
  useEffect(() => {
    const s = searchParams.get("stake");
    if (s && !isNaN(Number(s))) {
      setSelectedStake(Number(s));
    } else {
      setSelectedStake(null);
      setGame(null);
      setMyCard(null);
      setMyCartelas([]);
      pendingPurchasesRef.current.clear();
      pendingCancelsRef.current.clear();
      setActiveCartelaIdx(0);
      setTaken([]);
    }
    const r = searchParams.get("room");
    if (r) {
      setSelectedRoomId(r);
    } else if (effectiveRoomId && (!selectedRoomId || selectedRoomId === 'null')) {
      setSelectedRoomId(effectiveRoomId);
    }
  }, [searchParams, effectiveRoomId, selectedRoomId]);

  const handleRefreshRooms = async () => {
    setRoomsRefreshing(true);
    try {
      await fetchRooms();
    } finally {
      setTimeout(() => setRoomsRefreshing(false), 400);
    }
  };

  const selectedRoom = rooms.find(r => r.id === selectedRoomId) || (selectedRoomId ? { id: selectedRoomId, room_name: 'Live Room', total_players: 0, total_games: 0, status: 'active' } : null);

  const roomStakes: number[] = useMemo(() => {
    if (selectedRoom && Array.isArray(selectedRoom.stakes) && selectedRoom.stakes.length === 4) {
      return selectedRoom.stakes.map(Number);
    }
    return [5, 10, 20, 35];
  }, [selectedRoom]);

  const dynamicStakeOptions = useMemo(() => {
    const STAKE_COLORS = [
      "from-emerald-500 to-teal-700",
      "from-blue-500 to-blue-700",
      "from-purple-500 to-purple-700",
      "from-amber-500 to-orange-700",
    ];
    return roomStakes.map((val, idx) => ({
      value: val,
      label: `${val} ETB`,
      color: STAKE_COLORS[idx % STAKE_COLORS.length],
    }));
  }, [roomStakes]);

  const handleSelectRoom = (room: Room) => {
    initWebAudio();
    fetch(`${API}/player/rooms/${room.id}/enter`, { method: 'POST', headers: hdrs() }).catch(() => {});
    setSelectedRoomId(room.id);
    setSearchParams(params => {
      params.set('room', room.id);
      return params;
    });
  };

  // User's invited/assigned room: uses userRoomId which preserves previous agent room
  const userInvitedRoomId = userRoomId;

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
    { key: 'all', label: language === 'am' ? '\u1201\u1209\u121d \u12ad\u134d\u120e\u127d' : 'All Rooms', icon: '\ud83c\udfe0' },
    { key: 'most_players', label: language === 'am' ? '\u1270\u132b\u12cb\u127e\u127d (\u12a8\u134d\u1270\u129b)' : 'Most Players', icon: '\ud83d\udc65' },
    { key: 'most_games', label: language === 'am' ? '\u1328\u12cb\u1273\u12c8\u127d (\u12a8\u134d\u1270\u129b)' : 'Most Games', icon: '\ud83c\udfae' },
    { key: 'newest', label: language === 'am' ? '\u12a0\u12f2\u1235 \u12ad\u134d\u120e\u127d' : 'Newest Rooms', icon: '\u2728' },
  ] as const;

  // Fetch and listen for active derash & status on stake selection screen
  useEffect(() => {
    if (selectedStake) return;
    let isMounted = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const fetchPools = async () => {
      if (document.visibilityState === 'hidden') return;
      let loadedPools: any[] | null = null;
      try {
        const url = `${API}/bingo/pools${selectedRoomId ? `?room=${selectedRoomId}` : ''}&_t=${Date.now()}`;
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
          .in('status', ['waiting', 'calling'])
          .order('created_at', { ascending: false });
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
          const s = Number(g.stake);
          const pool = Number(g.prize_pool || 0);
          const players = Number(g.players !== undefined ? g.players : (g.unique_players !== undefined ? g.unique_players : 0));
          const status = g.status;

          if (!p[s]) {
            p[s] = { pool, start_at: g.start_at, status, players };
          } else {
            if (p[s].status !== 'calling' && status === 'calling') {
              p[s] = { pool, start_at: g.start_at, status, players };
            } else if (p[s].status === status && players > p[s].players) {
              p[s] = { pool, start_at: g.start_at, status, players };
            }
          }
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

    // Listen to table changes so home page updates in real-time
    const ch = supabase.channel('home_pools')
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
  }, [selectedStake, selectedRoomId]);

  // Tick timer for stake screen
  useEffect(() => {
    if (selectedStake) return;
    const update = () => {
      if (document.visibilityState === 'hidden') return;
      let shouldRefresh = false;
      setHomeTimeLeft(prev => {
        const next: Record<number, number> = {};
        for (const [stake, g] of Object.entries(homeGames)) {
          const pCount = Number(g.players || 0);
          if (g.status === 'waiting' && g.start_at && pCount >= 1) {
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

  // -- RAW ARRAYBUFFER CACHE: fetched at startup ------------------
  const rawBufferCache = useRef<Map<string, ArrayBuffer>>(new Map());

  useEffect(() => {
    let cancel = false;
    const preload = async () => {
      const allSrcs = [
        ...Array.from({ length: 75 }, (_, i) => getAudioSrc(i + 1)),
        '/audio/bingo/bingo_win.mp3',
        '/audio/bingo/game_start.mp3',
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

  // -- CORE WEBAUDIO PLAYER ------------------------
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

  // -- CALLER SOUND -------------------------------------------------------------
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

  // -- CELEBRATION --------------------------------------------------------------------------
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
  useEffect(() => {
    if (!errMsg) return;
    const t = setTimeout(() => {
      setErrMsg("");
    }, 4000);
    return () => clearTimeout(t);
  }, [errMsg]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebrationRef = useRef<Celebration | null>(null);
  celebrationRef.current = celebration;
  const celebratedGamesRef = useRef<Set<string>>(new Set());
  const gameFinishedRef = useRef(false);
  const gameIdRef = useRef<string | null>(null);
  const prevCalledLenRef = useRef(0);
  const prevStatusRef = useRef<string | null>(null);
  const introPlayedRef = useRef<string | null>(null);
  const prevTimeLeftRef = useRef<number>(-1);
  const hadCartelasRef = useRef(false);
  const celebrationTimerRef = useRef<any>(null);
  const finishingDelayTimerRef = useRef<any>(null);
  const lastPlayedBallRef = useRef<number | null>(null);
  const isFinishingRef = useRef(false);
  const finishingGameRef = useRef<any>(null);
  const finishedCartelasRef = useRef<MyCard[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);
  const cartelaMatricesRef = useRef<Record<number, number[][]>>({});
  const myCartelasRef = useRef(myCartelas);
  myCartelasRef.current = myCartelas;
  const triggerCelebrationRef = useRef<(g: any) => void>(() => {});
  const fetchStateRef = useRef<() => void>(() => {});
  const refreshUserRef = useRef<() => void>(() => {});

  // Sync manual/auto mode to backend when calling begins
  useEffect(() => {
    if (game?.id && game.status === 'calling') {
      fetch(`${API}/bingo/mode`, {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({
          game_id: game.id,
          is_manual: !autoMark,
        })
      }).catch(() => {});
    }
  }, [game?.id, game?.status, autoMark]);

  const dismissCelebration = useCallback(() => {
    if (celebrationTimerRef.current) {
      clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
    if (finishingDelayTimerRef.current) {
      clearTimeout(finishingDelayTimerRef.current);
      finishingDelayTimerRef.current = null;
    }
    const lastId = finishingGameRef.current?.id || game?.id;
    if (lastId) {
      celebratedGamesRef.current.add(lastId);
    }
    gameIdRef.current = null;
    setIsFinishing(false);
    isFinishingRef.current = false;
    finishingGameRef.current = null;
    setCelebration(null);
    celebrationRef.current = null;
    finishedCartelasRef.current = [];
    setMyCard(null);
    setMyCartelas([]);
    pendingPurchasesRef.current.clear();
    pendingCancelsRef.current.clear();
    setActiveCartelaIdx(0);
    setTaken([]);
    setManuallyMarked(new Set());
    setBingoLockSeconds(0);
    setUniquePlayers(0);
    setTimeLeft(30);
    setGame(prev => prev ? {
      ...prev,
      status: 'waiting',
      called_numbers: [],
      total_players: 0,
      prize_pool: 0,
      start_at: new Date(Date.now() + 30000).toISOString()
    } : null);
    fetchStateRef.current();
    refreshUserRef.current();
  }, []);

  // Delayed celebration trigger: shows the winning called ball on screen & marks it on cartela for EXACTLY 3 SECONDS before celebration popup!
  const triggerCelebration = useCallback((finGame: any) => {
    if (!finGame || finGame.status !== 'finished') return;
    if (celebratedGamesRef.current.has(finGame.id)) return;
    if (!finGame.winner_cartela && finGame.winner_first_name !== 'REMATCH') return;

    // Guard: ignore stale games > 20s old
    if (finGame.finished_at && (Date.now() - new Date(finGame.finished_at).getTime()) > 20000) {
      celebratedGamesRef.current.add(finGame.id);
      return;
    }

    celebratedGamesRef.current.add(finGame.id);
    if (celebratedGamesRef.current.size > 20) {
      const [oldest] = celebratedGamesRef.current;
      celebratedGamesRef.current.delete(oldest);
    }

    // Immediately mark as finishing and save the finished game reference!
    isFinishingRef.current = true;
    setIsFinishing(true);
    finishingGameRef.current = finGame;

    // Preserve the user's cartelas so they remain on screen with marked numbers!
    if (myCartelasRef.current && myCartelasRef.current.length > 0) {
      finishedCartelasRef.current = myCartelasRef.current;
    }

    // 1. Ensure game state is updated with this finished game's final called numbers & state
    setGame({
      ...finGame,
      status: 'finished',
      called_numbers: finGame.called_numbers || [],
    });

    const finalCalled = finGame.called_numbers || [];
    const finalBall = finalCalled.length > 0 ? Number(finalCalled[finalCalled.length - 1]) : null;

    // 2. Play the final winning ball call sound so voice announces the ball
    if (finalBall && finalBall !== lastPlayedBallRef.current) {
      lastPlayedBallRef.current = finalBall;
      playCallAudio(finalBall);
      if (typeof WebApp !== 'undefined' && WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred('heavy');
      }
    }

    // 3. Keep live calling board visible for EXACTLY 3 SECONDS (3000ms):
    // - The final ball called in the caller circle
    // - The final number marked in orange on the winning cartela!
    // - "Waiting..." is NEVER visible!
    if (finishingDelayTimerRef.current) clearTimeout(finishingDelayTimerRef.current);
    finishingDelayTimerRef.current = setTimeout(() => {
      finishingDelayTimerRef.current = null;
      setIsFinishing(false);
      isFinishingRef.current = false;

      // 4. Play "Bingo!" / win sound now!
      playSpecial('bingo_win');

      // 5. Auto-dismiss matches bingo_win.mp3 duration + viewing time (minimum 5s)
      let durationMs = 5000;
      try {
        const audioBuffer = audioBufferCache.current.get('/audio/bingo/bingo_win.mp3');
        if (audioBuffer && audioBuffer.duration > 0) {
          durationMs = Math.max(5000, Math.ceil(audioBuffer.duration * 1000) + 1200);
        }
      } catch {}

      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = setTimeout(() => {
        dismissCelebration();
      }, durationMs);

      if (finGame.winner_first_name === 'REMATCH') {
        const celObj = {
          winner_name: 'REMATCH',
          winner_cartela: 0,
          winner_prize: 0,
          winner_matrix: null,
          iWon: false,
          called: [...finalCalled],
        };
        setCelebration(celObj);
        celebrationRef.current = celObj;
        return;
      }

      const uidStr = String(user?.telegram_id || '');
      const isWinnerById = Boolean(finGame.winner_telegram_id && finGame.winner_telegram_id.split(',').includes(uidStr));
      const isWinnerByName = Boolean(finGame.winner_first_name && user?.first_name && finGame.winner_first_name.includes(user.first_name));
      const iWon = isWinnerById || isWinnerByName;
      const localCard = myCartelasRef.current.find(c => c.cartela_number === finGame.winner_cartela)?.card_matrix;
      const cachedCard = finGame.winner_matrix || (finGame.winner_cartela ? cartelaMatricesRef.current[finGame.winner_cartela] : null);
      const winningMatrix = localCard || cachedCard || (finGame.winner_cartela ? getFixedCartelaMatrix(finGame.winner_cartela) : null);

      // 6. NOW show the celebration popup!
      const celObj = {
        winner_name: finGame.winner_first_name || 'Player',
        winner_cartela: finGame.winner_cartela || 0,
        winner_prize: finGame.winner_prize || 0,
        winner_matrix: winningMatrix,
        iWon,
        called: [...finalCalled],
      };
      setCelebration(celObj);
      celebrationRef.current = celObj;

      // If tie (2, 3, or 4 winners), fetch full winners list in background
      if (finGame.winner_first_name && finGame.winner_first_name.includes(' & ')) {
        fetch(`${API}/bingo/winners?game_id=${finGame.id}`, { headers: hdrs() })
          .then(r => r.json())
          .then(data => {
            if (data?.winners) {
              setCelebration(prev => {
                if (!prev) return prev;
                const wonInTie = data.winners.some((w: any) =>
                  myCartelasRef.current.some(c => c.cartela_number === w.cartela_number) ||
                  w.first_name === user?.first_name
                );
                const next = {
                  ...prev,
                  winners_list: data.winners,
                  iWon: prev.iWon || wonInTie,
                };
                celebrationRef.current = next;
                return next;
              });
            }
          }).catch(() => {});
      } else if (!winningMatrix && finGame.winner_cartela) {
        // Fallback only if not in memory: fetch winner card matrix
        fetch(`${API}/bingo/card?game_id=${finGame.id}&cartela=${finGame.winner_cartela}`, { headers: hdrs() })
          .then(r => r.json())
          .then(data => {
            if (data?.matrix) {
              setCelebration(prev => {
                const next = prev ? { ...prev, winner_matrix: data.matrix } : prev;
                celebrationRef.current = next;
                return next;
              });
            }
          }).catch(() => {});
      }
    }, 3000);
  }, [user?.telegram_id, playSpecial, playCallAudio, dismissCelebration]);
  triggerCelebrationRef.current = triggerCelebration;


  const fetchState = useCallback(async () => {
    if (!selectedStake) return;
    // CRITICAL: Never wipe out the active calling board or cartelas while finishing or celebrating!
    if (isFinishingRef.current || celebrationRef.current) return;
    if (!gameIdRef.current) setLoading(true);
    try {
      const url = `${API}/bingo/current?stake=${selectedStake}${selectedRoomId ? `&room=${selectedRoomId}` : ''}&_t=${Date.now()}`;
      const r = await fetch(url, { headers: hdrs() });
      if (r.ok) {
        if (isFinishingRef.current || celebrationRef.current) return;
        const d = await r.json();
        if (d.max_players) setMaxPlayers(Number(d.max_players));
        if (d.max_cartelas_per_user) setMaxCartelasPerUser(Math.min(4, Number(d.max_cartelas_per_user) || 4));
        if (d.my_cartelas) {
          setMyCartelas(prev => {
            const serverMap = new Map<number, any>(d.my_cartelas.map((c: any) => [c.cartela_number, c]));
            const merged = d.my_cartelas.map((c: any) => ({
              cartela_number: c.cartela_number,
              card_matrix: c.card_matrix || getFixedCartelaMatrix(c.cartela_number)
            }));
            for (const local of prev) {
              if (!serverMap.has(local.cartela_number) && pendingPurchasesRef.current.has(local.cartela_number)) {
                merged.push(local);
              }
            }
            return merged;
          });
        }
        if (d.unique_players !== undefined) setUniquePlayers(Number(d.unique_players));
        if (d.cartela_matrices) {
          cartelaMatricesRef.current = { ...cartelaMatricesRef.current, ...d.cartela_matrices };
        }
        
        // Guarantee celebration popup fires even if WebSocket was delayed or dropped,
        // but ONLY if the user was actively watching this game live on screen!
        // Never hijack visitors navigating from Home or who already left!
        if (d.last_finished_game && !celebratedGamesRef.current.has(d.last_finished_game.id)) {
          const isActivelyWatching = Boolean(gameIdRef.current && gameIdRef.current === d.last_finished_game.id);

          if (isActivelyWatching) {
            triggerCelebrationRef.current(d.last_finished_game);
            return;
          } else {
            // Player just arrived from Home/another room to pick cartelas: suppress celebration modal
            celebratedGamesRef.current.add(d.last_finished_game.id);
          }
        }

        if (d.game) {
          if (d.game.status === 'finished' && !celebratedGamesRef.current.has(d.game.id)) {
            const isActivelyWatching = Boolean(gameIdRef.current && gameIdRef.current === d.game.id);
            if (isActivelyWatching) {
              triggerCelebrationRef.current(d.game);
              return;
            } else {
              celebratedGamesRef.current.add(d.game.id);
            }
          }
          setGame(d.game);
          setTaken(d.taken_cartelas ?? []);
          setMyCard(d.my_card ?? null);
          if (d.game.id !== gameIdRef.current) {
            gameIdRef.current = d.game.id;
            prevCalledLenRef.current = d.game.called_numbers?.length || 0;
            lastPlayedBallRef.current = null;
            setManuallyMarked(new Set());
            setBingoLockSeconds(0);
          }
        }

        if (Array.isArray(d.room_stakes)) {
          setHomeGames(prev => {
            const next = { ...prev };
            d.room_stakes.forEach((s: any) => {
              const st = Number(s.stake);
              const pool = Number(s.prize_pool || 0);
              const players = Number(s.total_players || 0);
              const status = s.status;

              if (!next[st]) {
                next[st] = { pool, status, players, start_at: prev[st]?.start_at };
              } else {
                if (next[st].status !== 'calling' && status === 'calling') {
                  next[st] = { pool, status, players, start_at: prev[st]?.start_at };
                } else if (next[st].status === status && players > next[st].players) {
                  next[st] = { pool, status, players, start_at: prev[st]?.start_at };
                }
              }
            });
            return next;
          });
        }
      }
    } catch { } finally { setLoading(false); }
  }, [selectedStake, selectedRoomId]);
  fetchStateRef.current = fetchState;
  refreshUserRef.current = refreshUser;

  useEffect(() => { if (selectedStake) fetchState(); }, [selectedStake, fetchState]);

  useEffect(() => {
    if (!selectedStake) return;
    const ch = supabase.channel(`bingo-rt-${selectedStake}-${Date.now()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bingo_games" }, ({ new: g }) => {
        if (Number(g.stake) === selectedStake && (!selectedRoomId || g.room_id === selectedRoomId)) {
          const bg = g as BGame;
          // Guard: if finishing or celebrating this game, ignore updates from any different game!
          if (isFinishingRef.current || celebrationRef.current) {
            if (bg.id === finishingGameRef.current?.id && bg.status === 'finished') {
              finishingGameRef.current = { ...finishingGameRef.current, ...bg };
            }
            return;
          }
          // Strictly ignore updates (including finished) from different games than what player is in!
          if (gameIdRef.current && bg.id !== gameIdRef.current) return;
          if (bg.status === 'finished') {
            triggerCelebrationRef.current(bg);
            return;
          }
          setGame(bg);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bingo_games" }, () => {
        if (isFinishingRef.current || celebrationRef.current) return;
        fetchStateRef.current();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bingo_players" }, ({ new: p }) => {
        if (isFinishingRef.current || celebrationRef.current) return;
        const np = p as { game_id: string; cartela_number: number; card_matrix?: number[][]; telegram_id: string };
        if (np.game_id === gameIdRef.current) {
          if (np.cartela_number && np.card_matrix) {
            cartelaMatricesRef.current[np.cartela_number] = np.card_matrix;
          }
          setTaken(prev => prev.includes(np.cartela_number) ? prev : [...prev, np.cartela_number]);
          setUniquePlayers(prev => prev + 1);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedStake, selectedRoomId]);

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

  // Fast polling: keeps game state, players, cartelas, derash & status sync'd with zero lag (1.2s interval)
  useEffect(() => {
    if (!selectedStake) return;
    const pollId = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (isFinishingRef.current || celebrationRef.current) return;
      fetchState();
    }, 1200);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !isFinishingRef.current && !celebrationRef.current) {
        fetchState();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [selectedStake, fetchState]);

  const activeGame = (isFinishing || celebration) && finishingGameRef.current
    ? finishingGameRef.current
    : game;
  const called = activeGame?.called_numbers ?? [];
  const lastNum = called.length > 0 ? Number(called[called.length - 1]) : null;


  // Track previous timeLeft to detect real 1..10s -> 0s countdown transitions
  useEffect(() => {
    prevTimeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // Play game_start.mp3 ONLY when:
  // 1. User has bought cartelas for this game (myCartelas.length > 0)
  // 2. Sound is enabled
  // 3. Not already played for this game ID
  // 4. Either countdown reached 0 (was actively counting down 1..10s -> 0s) OR game transitioned to 'calling' before balls are called
  useEffect(() => {
    if (!game) return;
    if (myCartelas.length === 0) return; // User hasn't bought any cartela - NEVER play!
    if (!soundEnabled) return;

    const gid = String(game.id || '');
    if (introPlayedRef.current === gid) return;

    const calledCount = (game.called_numbers || []).length;
    const playerCount = Math.max(uniquePlayers || 0, game?.total_players || 0, taken.length || 0);
    const hasMinPlayers = playerCount >= 2;
    const isCountingDownToZero = hasMinPlayers && game.status === 'waiting' && timeLeft === 0 && prevTimeLeftRef.current > 0 && prevTimeLeftRef.current <= 10;
    const isJustStartingCalling = game.status === 'calling' && calledCount === 0;

    if (isCountingDownToZero || isJustStartingCalling) {
      introPlayedRef.current = gid;
      playSpecial('game_start');
    }
  }, [game?.status, game?.id, game?.called_numbers, timeLeft, soundEnabled, myCartelas.length, playSpecial, uniquePlayers, taken.length]);

  useEffect(() => {
    if (game?.status === 'calling' && called.length > prevCalledLenRef.current) {
      if (lastNum && lastNum !== lastPlayedBallRef.current) {
        lastPlayedBallRef.current = lastNum;
        playCallAudio(lastNum);
      }
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
      if (finishingDelayTimerRef.current) clearTimeout(finishingDelayTimerRef.current);
    };
  }, []);

  // Fixed standard 300-cartela matrix generator
  const generateBingoCard = (seat: number = 1) => {
    return getFixedCartelaMatrix(seat);
  };

  const handleQuickBuy = (seat: number) => {
    if (!user && !WebApp?.initData) {
      setAuthModalOpen(true);
      return;
    }
    // Prevent action if this seat is currently being cancelled or purchased
    if (pendingCancelsRef.current.has(seat) || pendingPurchasesRef.current.has(seat)) {
      return;
    }
    // Deduplicate distinct seats selected in state or pending in-flight
    const allSelectedNumbers = new Set<number>([
      ...myCartelas.map(c => c.cartela_number),
      ...Array.from(pendingPurchasesRef.current)
    ]);

    if (allSelectedNumbers.has(seat)) return;

    if (allSelectedNumbers.size >= maxCartelasPerUser) {
      setErrMsg(`Max ${maxCartelasPerUser} cartela${maxCartelasPerUser > 1 ? 's' : ''} per game • በጨዋታ ቢበዛ ${maxCartelasPerUser} ካርቴላ`);
      return;
    }
    if (taken.includes(seat)) {
      setErrMsg(language === 'am' ? 'ይህ ቁጥር ተይዟል!' : 'Taken! Pick another.');
      return;
    }
    setErrMsg('');
    pendingPurchasesRef.current.add(seat);
    const matrix = getFixedCartelaMatrix(seat);
    joinGame(seat, matrix);
  };

  const handleCancelCartela = async (seat: number) => {
    if (!game || game.status !== 'waiting') return;
    // Strict Guard: Prevent double-click or spam cancelling
    if (pendingCancelsRef.current.has(seat)) return;
    // Strict Guard: If purchase of this seat is currently in-flight, do not allow cancel until buy finishes
    if (pendingPurchasesRef.current.has(seat)) {
      setErrMsg(language === 'am' ? 'እባክዎ ግዢው እስኪጠናቀቅ ይጠብቁ...' : 'Purchase in progress, please wait...');
      return;
    }

    const existing = myCartelas.find(c => c.cartela_number === seat);
    if (!existing) return;

    pendingCancelsRef.current.add(seat);
    setErrMsg('');
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');

    setMyCartelas(prev => prev.filter(c => c.cartela_number !== seat));
    setTaken(prev => prev.filter(n => n !== seat));

    const stakeAmt = game.stake || 0;
    useGameStore.setState(s => ({
      user: s.user ? { ...s.user, main_balance: Number(s.user.main_balance || 0) + stakeAmt } : s.user
    }));

    try {
      const res = await fetch(`${API}/bingo/leave`, {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({
          cartela_number: seat,
          game_id: game.id,
        })
      });
      if (res.ok) {
        refreshUser();
        fetchState();
      } else {
        const errData = await res.json().catch(() => ({}));
        setMyCartelas(prev => prev.some(c => c.cartela_number === seat) ? prev : [...prev, existing]);
        setTaken(prev => prev.includes(seat) ? prev : [...prev, seat]);
        useGameStore.setState(s => ({
          user: s.user ? { ...s.user, main_balance: Math.max(0, Number(s.user.main_balance || 0) - stakeAmt) } : s.user
        }));
        setErrMsg(errData.error || (language === 'am' ? 'ካርቴላውን መሰረዝ አልተቻለም' : 'Could not cancel cartela'));
        refreshUser();
      }
    } catch {
      setMyCartelas(prev => prev.some(c => c.cartela_number === seat) ? prev : [...prev, existing]);
      setTaken(prev => prev.includes(seat) ? prev : [...prev, seat]);
      useGameStore.setState(s => ({
        user: s.user ? { ...s.user, main_balance: Math.max(0, Number(s.user.main_balance || 0) - stakeAmt) } : s.user
      }));
      setErrMsg(language === 'am' ? 'የኔትወርክ ችግር' : 'Network error');
      refreshUser();
    } finally {
      pendingCancelsRef.current.delete(seat);
    }
  };

  const handleManualBingoClaim = async () => {
    if (bingoLockSeconds > 0) return;
    if (!game || game.status !== 'calling') return;

    let winCard: { cartela_number: number; card_matrix: number[][] } | null = null;
    let winPattern = '';
    let hasUnmarkedWin = false;

    for (const card of myCartelas) {
      const winCells = getWinningCells(card.card_matrix, called);
      if (winCells.size > 0) {
        // In manual mode, verify the winning cells have been marked by the user
        const allMarked = Array.from(winCells).every(pos => {
          const [r, c] = pos.split('-').map(Number);
          const num = card.card_matrix[r][c];
          return num === 0 || manuallyMarked.has(num);
        });

        if (allMarked) {
          winCard = card;
          winPattern = getWinningPatternTitle(card.card_matrix, called);
          break;
        } else {
          hasUnmarkedWin = true;
        }
      }
    }

    if (winCard) {
      // SUCCESSFUL BINGO CLAIM: Send to backend!
      try {
        const res = await fetch(`${API}/bingo/claim`, {
          method: 'POST',
          headers: hdrs(),
          body: JSON.stringify({
            game_id: game.id,
            cartela_number: winCard.cartela_number,
            marked_numbers: Array.from(manuallyMarked),
          })
        });
        const d = await res.json();
        if (res.ok && d.success) {
          if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
          playSpecial('bingo_win');
          setCelebration({
            winner_name: user?.first_name || 'You',
            winner_cartela: winCard.cartela_number,
            winner_prize: d.prize || game.prize_pool || 0,
            winner_matrix: winCard.card_matrix,
            iWon: true,
            called: called,
          });
          refreshUser();
        } else {
          setErrMsg(d.error || 'Could not claim Bingo');
        }
      } catch {
        setErrMsg('Network error claiming Bingo');
      }
    } else if (hasUnmarkedWin) {
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('warning');
      setErrMsg(language === 'am'
        ? 'እባክዎ የተጠሩትን የቢንጎ ቁጥሮች ካርቴላዎ ላይ ይጫኑ!'
        : 'Please tap and mark all the called winning numbers on your card first!');
    } else {
      // FALSE BINGO CLAIM PENALTY!
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('error');
      setBingoLockSeconds(10);
      setErrMsg(language === 'am'
        ? 'የተሳሳተ ቢንጎ! ምንም አይነት የተጠናቀቀ የቢንጎ መስመር አልተገኘም (ለ10 ሰከንድ ተቆልፏል)'
        : 'False Bingo! No completed winning pattern found. Locked for 10s.');
    }
  };

  const joinGame = async (seat: number, matrix: number[][]) => {
    initWebAudio();
    if (!game || game.status !== "waiting") {
      pendingPurchasesRef.current.delete(seat);
      return;
    }
    if (pendingCancelsRef.current.has(seat)) {
      pendingPurchasesRef.current.delete(seat);
      return;
    }
    if (myCartelas.some(c => c.cartela_number === seat)) {
      pendingPurchasesRef.current.delete(seat);
      return;
    }
    const distinctOtherCount = new Set([
      ...myCartelas.map(c => c.cartela_number).filter(n => n !== seat),
      ...Array.from(pendingPurchasesRef.current).filter(n => n !== seat)
    ]).size;

    if (distinctOtherCount >= maxCartelasPerUser) {
      pendingPurchasesRef.current.delete(seat);
      setErrMsg(`Max ${maxCartelasPerUser} cartela${maxCartelasPerUser > 1 ? 's' : ''} per game • በጨዋታ ቢበዛ ${maxCartelasPerUser} ካርቴላ`);
      return;
    }
    if (taken.includes(seat) && !myCartelas.some(c => c.cartela_number === seat)) {
      pendingPurchasesRef.current.delete(seat);
      setErrMsg(language === 'am' ? 'ይህ ቁጥር ተይዟል!' : "Taken! Pick another.");
      return;
    }
    const bonusBal = Number(user?.bonus_balance || 0), mainBal = Number(user?.main_balance || 0);
    if (!user || bonusBal + mainBal < game.stake) {
      pendingPurchasesRef.current.delete(seat);
      setErrMsg(`Need ${game.stake} ETB`);
      return;
    }

    setErrMsg("");
    // INSTANT 0ms OPTIMISTIC UPDATE: Turn green with \u2713 immediately!
    const optimisticCard = { cartela_number: seat, card_matrix: matrix };
    setMyCartelas(prev => prev.some(c => c.cartela_number === seat) ? prev : [...prev, optimisticCard]);
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
    const prizePercent = newUniquePlayers >= 3 ? 0.8 : 1.0;
    setGame(prev => prev ? { ...prev, prize_pool: Math.floor(rawPool * prizePercent) } : prev);

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
          is_manual: !autoMark,
        })
      });
      const d = await r.json();
      if (r.ok) {
        if (d.card_matrix) {
          setMyCartelas(prev => prev.map(c => c.cartela_number === seat ? { ...c, card_matrix: d.card_matrix } : c));
        }
        if (d.game_id) {
          gameIdRef.current = d.game_id;
        }
        if (d.unique_players !== undefined) setUniquePlayers(Number(d.unique_players));
        if (d.start_at || d.prize_pool || d.game_id) {
          setGame(prev => prev ? {
            ...prev,
            id: d.game_id || prev.id,
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
      pendingPurchasesRef.current.delete(seat);
      setBuying(null);
    }
  };

  const fm = (a: number | undefined) => (a || 0).toLocaleString("en-US");
  const initial = user?.first_name ? user.first_name.charAt(0).toUpperCase() : "U";
  let statusTxt = "Finished", statusCls = "text-slate-400";
  if (game?.status === "waiting") {
    if (timeLeft > 86400) {
      statusTxt = "Waiting..."; 
      statusCls = "text-orange-400"; 
    } else if (timeLeft === 0) { 
      statusTxt = (uniquePlayers >= 2 || (game.total_players || 0) >= 2 || myCartelas.length > 0) ? "Ready..." : "Waiting..."; 
      statusCls = "text-emerald-400 animate-pulse font-black"; 
    } else { 
      statusTxt = `${timeLeft}s`; 
      statusCls = "text-amber-500 font-black"; 
    }
  } else if (game?.status === "calling") { 
    statusTxt = "Calling"; 
    statusCls = "text-emerald-500 animate-pulse font-black"; 
  }

  const isCallingBoardVisible = Boolean(
    game?.status === 'calling' ||
    isFinishing ||
    celebration ||
    (game?.status === 'waiting' && timeLeft === 0 && myCartelas.length > 0)
  );

  const Header = () => (
    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0b1020]/95 backdrop-blur-md shadow-2xs flex items-center justify-between shrink-0 transition-colors">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-black text-lg shadow-[0_0_12px_rgba(16,185,129,0.35)]">{initial}</div>
        <div>
          <p className="font-black text-sm uppercase tracking-wider text-slate-800 dark:text-white leading-tight">{user?.first_name || "USER"}</p>
          <div className="flex items-center space-x-1 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">Online</span>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4 text-right">
        <div className="flex flex-col items-center">
          <Gift size={14} className="text-purple-600 dark:text-purple-400 mb-0.5" />
          <p className="text-xs font-bold text-slate-700 dark:text-purple-300">{fm(user?.bonus_balance)} ETB</p>
        </div>
        <div className="flex flex-col items-end">
          <p className="text-[10px] text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider">{t[language].bingo.wallet}</p>
          <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.25)]">{fm(user?.main_balance)} ETB</p>
        </div>
      </div>
    </div>
  );

  // -- 1. CONNECTING / LOADING STATE (Room is automatically resolved; players never pick rooms) --
  if (!selectedRoomId) {
    return (
      <div className="h-[calc(100dvh-80px)] w-full bg-white dark:bg-[#070b14] flex flex-col items-center justify-center select-none transition-colors" onClick={initWebAudio}>
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-400 flex items-center justify-center animate-spin">
            <Sparkles className="text-amber-500" size={24} />
          </div>
          <p className="text-sm font-black text-slate-700 dark:text-slate-100">
            {language === 'am' ? 'ወደ ቢንጎ ጠረጴዛ በመግባት ላይ...' : 'Connecting to Bingo Table...'}
          </p>
          <p className="text-xs text-slate-400 font-semibold">
            {language === 'am' ? 'እባክዎ ትንሽ ይጠብቁ' : 'Please wait a moment'}
          </p>
        </div>
      </div>
    );
  }

  // -- 2. STAKE SELECTION SCREEN (Shown AFTER room is selected) --
  if (!selectedStake) {
    return (
      <div className="fixed inset-x-0 top-0 bottom-16 w-full bg-white dark:bg-[#070b14] flex flex-col select-none overflow-hidden transition-colors" onClick={initWebAudio}>
        
        {/* Background grid */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.04] dark:opacity-[0.02]" style={{ display: 'grid', gridTemplateColumns: 'repeat(15, minmax(0, 1fr))', gap: '2px', padding: '2px' }}>
          {Array.from({ length: 300 }, (_, i) => (
            <div key={i} className="flex items-center justify-center bg-black dark:bg-white rounded-[3px] text-black dark:text-white font-black" style={{ fontSize: '6px' }}>{i + 1}</div>
          ))}
        </div>

        <div className="relative z-10 flex flex-col h-full overflow-y-auto pb-4">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between shrink-0 bg-white dark:bg-[#0b1020]/95 backdrop-blur-md shadow-2xs transition-colors">
            <div className="flex items-center space-x-2.5">
              <button
                onClick={() => navigate('/')}
                className="h-9 w-9 flex items-center justify-center bg-white dark:bg-[#12192c] border border-slate-200 dark:border-slate-700/80 rounded-xl shrink-0 active:scale-95 transition-transform shadow-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#19233d]"
                title={language === 'am' ? 'ወደ ዋና ገጽ ተመለስ' : 'Back to Home'}
              >
                <ArrowLeft size={16} className="text-slate-700 dark:text-slate-200" />
              </button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-black text-lg shadow-[0_0_12px_rgba(16,185,129,0.35)]">{initial}</div>
              <div>
                <p className="font-black text-sm uppercase tracking-wider text-slate-800 dark:text-white leading-tight">{user?.first_name || "USER"}</p>
                <div className="flex items-center space-x-1 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">Online</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4 text-right">
              <div className="flex flex-col items-center"><Gift size={14} className="text-purple-600 dark:text-purple-400 mb-0.5" /><p className="text-xs font-bold text-slate-700 dark:text-purple-300">{fm(user?.bonus_balance)} ETB</p></div>
              <div className="flex flex-col items-end"><p className="text-[10px] text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider">{t[language].bingo.wallet}</p><p className="text-sm font-black text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.25)]">{fm(user?.main_balance)} ETB</p></div>
            </div>
          </div>

          {/* Active Table Banner (Live Bingo status) */}
          <div className="mx-4 mt-2.5 p-3 bg-gradient-to-r from-amber-500/10 via-yellow-400/15 to-indigo-500/10 dark:from-[#0c1222] dark:via-[#131b2e] dark:to-[#0c1222] border border-amber-300/40 dark:border-amber-500/25 rounded-2xl flex items-center justify-between shadow-xs shrink-0 transition-colors">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center text-white shadow-md font-black">
                <Sparkles size={20} />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    {language === 'am' ? 'ቀጥታ ቢንጎ • LIVE BINGO' : 'LIVE BINGO TABLE'}
                  </span>
                </div>
                <h3 className="font-black text-sm text-slate-800 dark:text-white leading-tight">
                  {selectedRoom ? `${selectedRoom.room_number ? `#${selectedRoom.room_number} ` : ''}${selectedRoom.room_name}` : 'Active Room'}
                </h3>
                <p className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  <Users size={11} className="inline mr-1 text-slate-400 -mt-0.5" />{selectedRoom?.total_players || 0} {language === 'am' ? 'ተጫዋቾች' : 'players'} • <Gamepad2 size={11} className="inline mr-1 ml-1.5 text-slate-400 -mt-0.5" />{selectedRoom?.total_games || 0} {language === 'am' ? 'ጨዋታዎች' : 'games'}
                </p>
              </div>
            </div>
            <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-700 dark:text-emerald-400 text-[11px] font-black shadow-xs flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{language === 'am' ? 'ንቁ' : 'Active'}</span>
            </div>
          </div>

          {/* Subtitle */}
          <p className="text-center text-slate-400 dark:text-slate-400 text-[10px] uppercase tracking-widest font-bold pt-2.5 pb-1">
            {t[language].bingo.selectStakeWinBig}
          </p>
          
          {/* Stakes Grid (Dynamic per Room) - Matching Home Page Design */}
          <div className="grid grid-cols-2 gap-2.5 px-3 pb-2">
            {dynamicStakeOptions.map((opt: { value: number; label: string; color: string }, idx: number) => {
              const hg = homeGames[opt.value];
              const pool = hg?.pool || 0;
              const players = hg?.players || 0;
              const isCalling = hg?.status === 'calling';
              const tl = homeTimeLeft[opt.value] || 0;
              const isCountingDown = hg?.status === 'waiting' && tl > 0 && tl <= 120;
              const isStarting = hg?.status === 'waiting' && tl === 0 && hg?.start_at && (new Date(hg.start_at).getTime() <= Date.now() + 4000);
              const isLiveCalling = isCalling || isStarting;
              const displayPool = pool > 0 ? pool : (players >= 1 ? Math.floor(players * opt.value * (players >= 3 ? 0.8 : 1)) : 0);

              const THEMES = [
                { gradient: 'from-[#1e40af] via-[#2563eb] to-[#3b82f6]' }, // Blue
                { gradient: 'from-[#047857] via-[#059669] to-[#10b981]' }, // Green
                { gradient: 'from-[#7e22ce] via-[#9333ea] to-[#a855f7]' }, // Purple
                { gradient: 'from-[#b91c1c] via-[#dc2626] to-[#ef4444]' }, // Red
              ];
              const theme = THEMES[idx % THEMES.length];

              const handleSelect = () => {
                if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
                initWebAudio();
                gameIdRef.current = null;
                setCelebration(null);
                celebrationRef.current = null;
                setIsFinishing(false);
                isFinishingRef.current = false;
                setSelectedStake(opt.value);
                setSearchParams(params => {
                  params.set('stake', String(opt.value));
                  return params;
                });
              };

              return (
                <div
                  key={opt.value}
                  onClick={handleSelect}
                  className="bg-white dark:bg-[#0c1222] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.45)] border border-slate-100/90 dark:border-slate-800/80 dark:hover:border-slate-700 overflow-hidden flex flex-col cursor-pointer active:scale-[0.98] transition-all"
                >
                  {/* Header with vibrant gradient (exact height ~64px, snug & centered) - Displays DERASH */}
                  <div
                    className={`h-16 bg-gradient-to-r ${theme.gradient} flex items-center justify-center relative rounded-t-2xl`}
                  >
                    <span className="text-white font-black text-3xl tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)] select-none">
                      {displayPool || 0}
                    </span>
                    <div className="absolute top-2 right-2 bg-white/25 dark:bg-black/35 backdrop-blur-xs text-white text-[8.5px] font-black px-1.5 py-0.5 rounded tracking-wider border border-white/20 select-none">
                      ETB
                    </div>
                  </div>

                  {/* 2-Column Stats Row: PLAYERS and STATUS (Clickable as part of the card) */}
                  <div className="px-3 py-2 flex items-center justify-around text-center border-b border-slate-50 dark:border-slate-800/80 bg-white dark:bg-[#080d19] select-none">
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[8.5px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">{t[language].bingo.players}</span>
                      <span className="text-[11px] font-black text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.35)] mt-0.5">{players}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-100 dark:bg-slate-800/80" />
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[8.5px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">{t[language].bingo.status}</span>
                      <span className={`text-[11px] font-black mt-0.5 ${
                        isLiveCalling
                          ? 'text-emerald-500 dark:text-emerald-400 animate-pulse drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                          : isCountingDown
                          ? 'text-amber-500 dark:text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]'
                          : 'text-orange-400 dark:text-amber-500/80 font-bold'
                      }`}>
                        {isLiveCalling ? 'Calling...' : isCountingDown ? `${tl}s...` : 'Waiting...'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Action Button: Displays STAKE amount */}
                  <div className="p-2 pt-1.5 bg-white dark:bg-[#080d19]">
                    <button
                      type="button"
                      className="w-full bg-[#eef3f9] hover:bg-[#e2eaf5] dark:bg-[#12192c] dark:hover:bg-[#19233d] text-slate-800 dark:text-slate-100 font-black py-2 rounded-xl text-xs transition-all shadow-2xs dark:shadow-xs border border-slate-200/60 dark:border-slate-700/80 flex items-center justify-center pointer-events-none"
                    >
                      {opt.value} ETB
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

  if (loading && !game) {
    return (
      <div className="h-[calc(100dvh-80px)] w-full bg-gradient-to-b from-[#fffbf0] via-[#fef3c7]/40 to-[#fffbf0] dark:from-[#070b14] dark:via-[#090e1c] dark:to-[#070b14] flex flex-col items-center justify-center gap-3 transition-colors">
        <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#0c1222] border-2 border-amber-300 dark:border-amber-500/30 shadow-md flex items-center justify-center">
          <RefreshCw size={26} className="text-amber-500 animate-spin" />
        </div>
        <p className="text-xs font-black text-amber-800 dark:text-amber-300 tracking-wider uppercase">Loading Game...</p>
      </div>
    );
  }

  if (!game) return (
    <div className="h-[calc(100dvh-80px)] w-full bg-gradient-to-b from-[#fffbf0] via-[#fef3c7]/30 to-[#fffbf0] dark:from-[#070b14] dark:via-[#090e1c] dark:to-[#070b14] flex flex-col items-center justify-center text-slate-800 dark:text-slate-100 gap-4 transition-colors">
      <div className="w-16 h-16 rounded-3xl bg-white dark:bg-[#0c1222] border-2 border-amber-300 dark:border-amber-500/30 shadow-md flex items-center justify-center text-3xl">🎱</div>
      <p className="font-black text-lg text-slate-800 dark:text-white">{t[language].bingo.preparingNext}</p>
      <button onClick={fetchState} className="px-8 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-full text-sm shadow-md active:scale-95 transition-transform">{t[language].bingo.refresh}</button>
      <button onClick={() => setSelectedStake(null)} className="text-slate-400 dark:text-slate-400 text-xs underline mt-1">{t[language].bingo.changeStake}</button>
    </div>
  );

  const renderCallingBoard = () => {
    const recent = [...called].reverse().slice(0, 6);
    const currentLetter = lastNum ? getLetter(lastNum) : null;

    const renderCartelaCard = (card: { cartela_number: number; card_matrix: number[][] }, isSingle: boolean) => {
      return (
        <div className="w-full rounded-xl overflow-hidden bg-white dark:bg-[#0c1222] border border-amber-300/90 dark:border-slate-800/90 shadow-[0_2px_6px_rgba(180,83,9,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex flex-col transition-colors">
          {/* B I N G O Header Row */}
          <div className="grid grid-cols-5 gap-[1px]">
            {[
              { l: 'B', bg: '#2563eb' },
              { l: 'I', bg: '#7c3aed' },
              { l: 'N', bg: '#ec4899' },
              { l: 'G', bg: '#16a34a' },
              { l: 'O', bg: '#0284c7' },
            ].map(c => (
              <div
                key={c.l}
                className="h-[17px] sm:h-[19px] flex items-center justify-center font-black text-white text-[9.5px] sm:text-[10.5px] leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
                style={{ backgroundColor: c.bg }}
              >
                {c.l}
              </div>
            ))}
          </div>

          {/* 5x5 Matrix - Taller responsive height to eliminate empty gap below */}
          <div className="grid grid-cols-5 gap-[1px] p-[1px] bg-amber-50/40 dark:bg-[#080d19]">
            {Array.from({ length: 5 }).flatMap((_, r) =>
              Array.from({ length: 5 }, (_, c) => {
                const num = card.card_matrix[r][c];
                const isFree = (r === 2 && c === 2) || num === 0;
                const isCalled = called.includes(num);
                const isManualMarked = manuallyMarked.has(num);
                const marked = isFree || (autoMark || isFinishing || celebration ? isCalled : isManualMarked);
                const isLast = num === lastNum;
                const canTap = !autoMark && isCalled && !isFree && !isFinishing && !celebration;

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
                      if (typeof WebApp !== 'undefined' && WebApp?.HapticFeedback) {
                        WebApp.HapticFeedback.selectionChanged();
                      }
                    }}
                    className={`flex items-center justify-center font-black rounded-[2px] select-none transition-all duration-150 ${
                      isSingle
                        ? 'h-[36px] sm:h-[40px] text-xs sm:text-sm'
                        : 'h-[25.5px] min-[380px]:h-[27px] sm:h-[28.5px] text-[9.5px] sm:text-[10.5px]'
                    } ${
                      isFree
                        ? 'bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500 text-amber-950 font-black shadow-[0_1px_2px_rgba(217,119,6,0.35),inset_0_0.5px_0.5px_rgba(255,255,255,0.9)] text-[10.5px]'
                        : (isLast && (autoMark || isFinishing || celebration))
                        ? 'bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600 text-white font-black shadow-[0_0_8px_rgba(249,115,22,0.8),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-2 ring-yellow-300 scale-105 z-10'
                        : marked
                        ? 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 text-white font-black shadow-[0_1px_2px_rgba(16,185,129,0.4),inset_0_1px_1px_rgba(255,255,255,0.8),inset_0_-1px_1px_rgba(5,150,105,0.5)] border border-emerald-400'
                        : canTap
                        ? 'bg-white dark:bg-[#141d33] text-blue-900 dark:text-cyan-300 font-black border-2 border-blue-400 dark:border-cyan-400 ring-2 ring-blue-300/80 dark:ring-cyan-500/50 shadow-[0_0_6px_rgba(59,130,246,0.5)] animate-pulse active:scale-90 cursor-pointer'
                        : 'bg-gradient-to-b from-white via-[#fafbfe] to-[#ebeff8] dark:from-[#131b2e] dark:via-[#17223b] dark:to-[#0f172a] text-slate-800 dark:text-slate-200 font-bold border border-slate-200/80 dark:border-slate-700/70 shadow-[0_0.5px_1px_rgba(0,0,0,0.06),inset_0_0.5px_0_rgba(255,255,255,0.95)]'
                    }`}
                  >
                    {isFree ? '★' : num}
                  </div>
                );
              })
            )}
          </div>

          {/* Slim Footer: #number on left, CARTELA on right */}
          <div className="h-[14px] px-1.5 flex items-center justify-between bg-white dark:bg-[#080d19] border-t border-amber-200/60 dark:border-slate-800/80 leading-none">
            <span className="text-slate-500 dark:text-slate-400 font-black text-[7.5px]">#{card.cartela_number}</span>
            <span className="text-amber-800 dark:text-amber-400 font-black text-[7.5px] uppercase tracking-wider flex items-center gap-0.5">
              <LayoutGrid size={8} className="text-amber-500 inline" />
              <span>CARTELA</span>
            </span>
          </div>
        </div>
      );
    };

    return (
      <div className="h-full flex flex-col px-1 pt-0.5 pb-0 gap-0.5 overflow-hidden select-none justify-between">

        {/* Top Info Bar */}
        <div className="flex items-center justify-between bg-gradient-to-r from-white via-amber-50/60 to-white dark:from-[#0b1020] dark:via-[#12192c] dark:to-[#0b1020] px-2 py-0.5 rounded-lg border border-amber-200/80 dark:border-slate-800/80 shadow-[0_1.5px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-md shrink-0 transition-colors">
          <div className="text-slate-600 dark:text-slate-300 text-[8px] font-black">ID: {formatGameId(activeGame?.id || game?.id || '')}</div>
          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-[8px] font-black"><Trophy size={9} className="text-amber-500"/> {activeGame?.prize_pool ?? game?.prize_pool ?? 0} ETB</div>
          <div className="flex items-center gap-1 text-blue-700 dark:text-cyan-400 text-[8px] font-black"><LayoutGrid size={9} className="text-blue-500 dark:text-cyan-400"/> {taken.length}</div>
          <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-[8px] font-black"><Clock size={9} className="text-emerald-500"/> {called.length}/75</div>
          <div className="text-[7px] bg-red-500/10 dark:bg-rose-950/60 text-red-600 dark:text-rose-400 px-1.5 py-0.2 rounded-full font-black animate-pulse border border-red-200 dark:border-rose-500/30">LIVE</div>
        </div>

        {/* 1-75 Tracker Board with 3D tactile tiles - Enlarged & Height Increased */}
        <div className="bg-white/95 dark:bg-[#0c1222]/95 rounded-xl px-2 py-1 border border-amber-200/90 dark:border-slate-800/80 shadow-[0_2px_5px_rgba(180,83,9,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-md shrink-0 transition-colors">
          <div className="flex flex-col gap-[2px]">
            {BINGO_LETTERS.map((letter, rowIndex) => (
              <div key={letter} className="flex items-center gap-1">
                <div
                  className="w-3.5 flex-shrink-0 flex items-center justify-center font-black text-[9.5px] sm:text-[10.5px] leading-none"
                  style={{ color: LETTER_COLOR[letter] }}
                >
                  {letter}
                </div>
                <div className="flex-1 grid gap-[1px]" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
                  {Array.from({ length: 15 }, (_, i) => {
                    const num = rowIndex * 15 + i + 1;
                    const isCalled = called.includes(num);
                    const isLatest = num === lastNum;
                    return (
                      <div
                        key={num}
                        className={`h-[14px] sm:h-[15.5px] rounded-[2px] flex items-center justify-center text-[7.5px] sm:text-[8.5px] font-black transition-all duration-150 select-none ${
                          isLatest
                            ? 'bg-gradient-to-b from-yellow-300 via-amber-400 to-yellow-500 text-amber-950 font-black shadow-[0_0_8px_rgba(245,158,11,0.9),0_1.5px_2px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.95)] border border-amber-200 ring-2 ring-orange-500 animate-pulse scale-110 z-20'
                            : isCalled
                            ? 'bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600 text-white font-black shadow-[0_1px_2px_rgba(234,88,12,0.4),inset_0_0.5px_0.5px_rgba(255,255,255,0.8),inset_0_-0.5px_0.5px_rgba(180,83,9,0.4)] border border-amber-300'
                            : 'bg-gradient-to-b from-white via-[#fafbfe] to-[#ebeff8] dark:from-[#131b2e] dark:via-[#17223b] dark:to-[#0f172a] text-slate-500 dark:text-slate-400 font-bold border border-slate-200/80 dark:border-slate-700/60 shadow-[0_0.5px_1px_rgba(0,0,0,0.05),inset_0_0.5px_0_rgba(255,255,255,0.95)]'
                        }`}
                      >
                        {num}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3D Calling Ball Row - Enlarged Height, 52px 3D Black Sphere, Amharic Text ABOVE, 5 Mini Balls BELOW! */}
        <div className="shrink-0 bg-gradient-to-b from-white via-amber-50/20 to-white dark:from-[#0c1222] dark:via-[#12192c] dark:to-[#0c1222] rounded-2xl border-2 border-amber-300/80 dark:border-amber-500/30 shadow-[0_3px_10px_rgba(180,83,9,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-lg px-2.5 py-2 w-full max-w-[420px] mx-auto transition-colors">
          <div className="flex items-center justify-between gap-2">
            {/* LEFT: Large 3D Black Calling Sphere with Bold White Number */}
            <div
              className="rounded-full flex flex-col items-center justify-center font-black relative overflow-hidden shrink-0 border-2 border-slate-700/80 shadow-[0_5px_14px_rgba(0,0,0,0.7),inset_0_2.5px_4px_rgba(255,255,255,0.5),inset_0_-3.5px_6px_rgba(0,0,0,0.95)]"
              style={{
                width: '52px',
                height: '52px',
                minWidth: '52px',
                minHeight: '52px',
                background: 'radial-gradient(circle at 30% 25%, #64748b 0%, #1e293b 25%, #0f172a 55%, #020617 85%, #000000 100%)'
              }}
            >
              {/* Specular glass highlight reflection arc */}
              <div
                className="absolute top-1 left-2 w-4 h-2.5 rounded-full pointer-events-none transform -rotate-25"
                style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 80%)' }}
              />
              <span className="text-[8.5px] leading-none font-black text-amber-300 drop-shadow-[0_1px_1px_rgba(0,0,0,1)] tracking-widest uppercase">
                {lastNum ? currentLetter : (isFinishing || celebration ? 'BINGO' : 'BINGO')}
              </span>
              <span className="text-white text-xl leading-none font-black drop-shadow-[0_2px_4px_rgba(0,0,0,1)] tracking-tight">
                {lastNum ?? (isFinishing || celebration ? '★' : '?')}
              </span>
            </div>

            {/* MIDDLE: Amharic Text ABOVE, and up to 5 Mini 3D Black Balls BELOW! */}
            <div className="flex-1 min-w-0 flex flex-col justify-center items-start gap-1">
              {/* Amharic Voice Word - Positioned ABOVE the 5 mini balls */}
              <div className="w-full">
                <span className="text-amber-950 dark:text-amber-300 font-black text-xs sm:text-sm tracking-wide drop-shadow-[0_0.5px_0_rgba(255,255,255,0.9)] dark:drop-shadow-none truncate block leading-tight">
                  {lastNum ? (AMHARIC_NUM[lastNum] || '') : (isFinishing || celebration ? (language === 'am' ? 'ቢንጎ ተጠናቋል!' : 'Bingo Finished!') : (language === 'am' ? 'ዝግጁ! ጨዋታው ሊጀምር ነው...' : 'Ready! Game Starting...'))}
                </span>
              </div>

              {/* Up to 5 Past Called Mini 3D Black Balls - directly BELOW the Amharic text! */}
              <div className="flex items-center gap-1">
                {recent.slice(1, 6).map((num, idx) => (
                  <div
                    key={`${num}-${idx}`}
                    className="rounded-full flex flex-col items-center justify-center font-black relative overflow-hidden shrink-0 border border-slate-700/80 shadow-[0_2px_5px_rgba(0,0,0,0.55),inset_0_1px_1.5px_rgba(255,255,255,0.4)]"
                    style={{
                      width: '25px',
                      height: '25px',
                      minWidth: '25px',
                      minHeight: '25px',
                      background: 'radial-gradient(circle at 30% 25%, #64748b 0%, #1e293b 30%, #0f172a 70%, #000000 100%)'
                    }}
                  >
                    <div
                      className="absolute top-0.5 left-0.5 w-1.5 h-1 rounded-full pointer-events-none transform -rotate-20"
                      style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0) 80%)' }}
                    />
                    <span className="text-[5.5px] leading-none font-black text-amber-300 drop-shadow-[0_0.5px_0.5px_rgba(0,0,0,1)]">
                      {getLetter(num)}
                    </span>
                    <span className="text-white text-[10px] leading-none font-black drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                      {num}
                    </span>
                  </div>
                ))}
                {recent.length <= 1 && (
                  <span className="text-slate-400 text-[10px] font-semibold italic">...</span>
                )}
              </div>
            </div>

            {/* RIGHT: Controls (Sound button top, Mode pill bottom) */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {/* 3D Sound Toggle Button */}
              <button
                onClick={toggleSound}
                className={`h-7 px-2.5 rounded-xl border flex items-center justify-center gap-1 active:scale-90 transition-all cursor-pointer ${
                  soundEnabled
                    ? 'bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600 text-white border-blue-300 shadow-[0_2px_4px_rgba(37,99,235,0.35),inset_0_1px_0_rgba(255,255,255,0.8)]'
                    : 'bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 text-slate-400 dark:text-slate-400 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]'
                }`}
                title={soundEnabled ? 'Mute audio' : 'Unmute audio'}
              >
                {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              </button>

              {/* 3D Manual / Auto Toggle Pill */}
              <button
                onClick={toggleAutoMark}
                className={`h-6 px-2.5 rounded-full border flex items-center gap-1 font-black text-[7.5px] tracking-wider uppercase active:scale-90 transition-all cursor-pointer ${
                  !autoMark
                    ? 'bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600 text-white border-amber-300 shadow-[0_2px_3px_rgba(234,88,12,0.35),inset_0_1px_0_rgba(255,255,255,0.8)]'
                    : 'bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 text-emerald-300 border-slate-600 shadow-[inset_0_1px_1px_rgba(0,0,0,0.3)]'
                }`}
                title={!autoMark ? 'Manual mode active (tap cards to mark)' : 'Auto mode active'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!autoMark ? 'bg-white animate-pulse' : 'bg-emerald-400'}`} />
                <span>{!autoMark ? 'MANUAL ON' : 'MANUAL OFF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Cartelas Section - Moved down, anchored right above bottom action button with zero gap */}
        {(() => {
          const activeCartelas = (myCartelas && myCartelas.length > 0)
            ? myCartelas
            : ((isFinishing || celebration) && finishedCartelasRef.current.length > 0 ? finishedCartelasRef.current : []);

          return (
            <>
              <div className={`flex-1 min-h-0 flex flex-col ${activeCartelas.length <= 2 ? 'justify-start' : 'justify-end'} overflow-hidden px-0.5 mt-0.5 mb-0.5`}>
                {activeCartelas.length > 0 ? (
                  <div className={`grid ${activeCartelas.length === 1 ? 'grid-cols-1 max-w-[240px]' : 'grid-cols-2 max-w-[400px]'} gap-1 w-full mx-auto`}>
                    {activeCartelas.map(card => (
                      <div key={card.cartela_number} className="w-full">
                        {renderCartelaCard(card, activeCartelas.length === 1)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full max-w-[250px] mx-auto relative mt-2 pointer-events-none">
                    <div className="rounded-2xl overflow-hidden border-2 border-amber-300 dark:border-amber-500/30 bg-white dark:bg-[#0c1222] shadow-md transition-colors">
                      <div className="grid grid-cols-5">
                        {BINGO_LETTERS.map(l => (
                          <div key={l} className="flex items-center justify-center py-1 font-black text-white text-xs" style={{ background: LETTER_BG[l] }}>{l}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-amber-50/60 dark:bg-[#080d19]">
                        {Array.from({ length: 5 }).flatMap((_, r) =>
                          Array.from({ length: 5 }, (_, c) => {
                            const isFree = r === 2 && c === 2;
                            const num = isFree ? '★' : (c * 15) + r + (c % 2 === 0 ? 3 : 8);
                            return (
                              <div key={`${r}-${c}`} className={`aspect-square flex items-center justify-center font-black text-xs rounded ${
                                isFree ? 'bg-amber-400 text-amber-950' : 'bg-white dark:bg-[#131b2e] text-slate-800 dark:text-slate-100 shadow-2xs border border-slate-100 dark:border-slate-700/60'
                              }`}>{num}</div>
                            );
                          })
                        )}
                      </div>
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs z-10 p-2">
                        <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center mb-2 border border-red-500/30">
                          <Clock size={18} className="animate-pulse text-amber-400" />
                        </div>
                        <h3 className="text-red-300 font-black text-sm uppercase tracking-wider mb-1">Match is active</h3>
                        <p className="text-white text-[9px] font-bold text-center leading-relaxed uppercase tracking-wider">
                          <span dangerouslySetInnerHTML={{ __html: t[language].bingo.waitNext }} />
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Action Bar: Only visible if user has bought at least 1 cartela */}
              {activeCartelas.length > 0 && (
                <div className="shrink-0 pt-0 pb-1 px-1 w-full max-w-[400px] mx-auto">
                  {autoMark ? (
                    /* MANUAL OFF / Auto-Win Active */
                    <div className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-white via-amber-50/50 to-white dark:from-[#0c1222] dark:via-[#131b2e] dark:to-[#0c1222] border-2 border-amber-300/80 dark:border-amber-500/30 shadow-[0_2px_6px_rgba(180,83,9,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-md flex items-center justify-center gap-2 text-amber-950 dark:text-amber-300 font-black text-xs tracking-wider uppercase select-none pointer-events-none transition-colors">
                      <span className="text-sm">🤖</span>
                      <span>AUTO BINGO ACTIVE</span>
                      <span className="text-amber-500 animate-pulse font-black text-xs">⚡</span>
                    </div>
                  ) : bingoLockSeconds > 0 ? (
                    <button
                      disabled
                      className="w-full py-2 px-3 rounded-xl bg-gradient-to-b from-red-800 via-red-900 to-red-950 border border-red-500 text-red-200 font-black text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-[0_2px_8px_rgba(185,28,28,0.4)] cursor-not-allowed select-none opacity-90"
                    >
                      <Lock size={14} className="text-red-400 animate-pulse" />
                      <span>🔒 {language === 'am' ? `ተቆልፏል (${bingoLockSeconds}ሰ)` : `LOCKED (${bingoLockSeconds}s)`}</span>
                    </button>
                  ) : (isFinishing || celebration) ? (
                    <div className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-white via-amber-50/50 to-white dark:from-[#0c1222] dark:via-[#131b2e] dark:to-[#0c1222] border-2 border-amber-300/80 dark:border-amber-500/30 shadow-[0_2px_6px_rgba(180,83,9,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-md flex items-center justify-center gap-2 text-amber-950 dark:text-amber-300 font-black text-xs tracking-wider uppercase select-none pointer-events-none transition-colors">
                      <span className="text-sm">🏆</span>
                      <span>{language === 'am' ? 'ጨዋታው ተጠናቋል!' : 'GAME FINISHED!'}</span>
                      <span className="text-amber-500 animate-pulse font-black text-xs">✨</span>
                    </div>
                  ) : (
                    /* MANUAL ON */
                    <button
                      onClick={handleManualBingoClaim}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-black hover:from-slate-900 hover:to-slate-900 text-amber-300 font-black text-base sm:text-lg tracking-widest uppercase flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_-1.5px_2px_rgba(0,0,0,0.8)] border-2 border-amber-400/80 ring-2 ring-amber-500/30 active:scale-95 transition-all cursor-pointer select-none animate-pulse"
                    >
                      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">BINGO!</span>
                    </button>
                  )}
                </div>
              )}
            </>
          );
        })()}

      </div>
    );
  };

  const renderCartelaPicker = () => {
    const myNums = myCartelas.map(c => c.cartela_number);
    const activeSeats = new Set<number>([
      ...myNums,
      ...Array.from(pendingPurchasesRef.current)
    ]);
    const canPickMore = activeSeats.size < maxCartelasPerUser;

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {/* Top Status & Scrollable Number Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-xs text-slate-800 dark:text-slate-100 font-black uppercase tracking-wider">
                {canPickMore ? `TAP TO PICK - ${taken.length}/${maxPlayers} TAKEN` : `ALL CARTELAS SELECTED ✓`}
              </p>
            </div>
            <span className="text-[11px] bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300/80 dark:border-amber-500/40 px-2.5 py-0.5 rounded-full font-black shadow-2xs">
              {Math.max(myCartelas.length, activeSeats.size)}/{maxCartelasPerUser} PICKED
            </span>
          </div>

          <div className="rounded-2xl border-2 border-amber-300/90 dark:border-slate-800/80 overflow-hidden bg-white/90 dark:bg-[#0c1222]/95 backdrop-blur-sm shadow-md dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)] p-1 mb-2">
            <div className="grid gap-[3px] p-[2px]" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
              {Array.from({ length: maxPlayers }, (_, i) => {
                const n = i + 1;
                const isTaken = taken.includes(n), isMine = myNums.includes(n);
                if (isMine) {
                  return (
                    <button
                      key={n}
                      disabled={pendingCancelsRef.current.has(n) || pendingPurchasesRef.current.has(n)}
                      onClick={() => handleCancelCartela(n)}
                      className="aspect-square flex flex-col items-center justify-center rounded-[7px] text-[9.5px] font-black bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 text-white shadow-[0_2.5px_6px_rgba(16,185,129,0.45),inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_-1px_1.5px_rgba(5,150,105,0.5)] ring-2 ring-emerald-300 active:scale-90 transition-all z-10 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                      title={language === 'am' ? 'ለመሰረዝ ይጫኑ' : 'Tap to cancel'}
                    >
                      <span className="leading-none text-[8.5px] font-black">{n}</span>
                      <span className="text-[7px] leading-none opacity-95">✓</span>
                    </button>
                  );
                }
                if (isTaken) {
                  return (
                    <div
                      key={n}
                      className="aspect-square flex items-center justify-center rounded-[7px] text-[10px] font-black bg-gradient-to-b from-slate-900 via-black to-slate-950 text-slate-500 border border-slate-800/90 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85)] select-none pointer-events-none cursor-not-allowed"
                      title={language === 'am' ? 'በሌላ ተጫዋች ተይዟል' : 'Taken by another player'}
                    >
                      ✕
                    </div>
                  );
                }
                return (
                  <button
                    key={n}
                    disabled={!canPickMore}
                    onClick={() => handleQuickBuy(n)}
                    className={`aspect-square flex items-center justify-center rounded-[7px] text-[10.5px] font-black transition-all duration-100 border ${
                      !canPickMore 
                        ? 'bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed' 
                        : 'bg-gradient-to-b from-white via-[#fafbfe] to-[#ebeff8] dark:from-[#131b2e] dark:via-[#17223b] dark:to-[#0f172a] text-slate-800 dark:text-slate-100 border-slate-200/90 dark:border-slate-700/70 shadow-[0_2px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_1px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-amber-400 hover:from-amber-50 hover:to-amber-100/60 hover:dark:border-amber-400/70 hover:dark:from-[#19243f] hover:dark:to-[#1e2c4d] active:translate-y-0.5 active:shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.15)] cursor-pointer select-none'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* BOTTOM FIXED PANEL: YOUR SELECTED CARTELAS (Only displayed when at least 1 cartela is selected, NO header, ZERO bottom gap, compact height so all 4 fit) */}
        {myCartelas.length > 0 && (
          <div className="bg-white/95 dark:bg-[#0b1020]/95 backdrop-blur-md border-t-2 border-amber-300/80 dark:border-slate-800/90 px-1 pt-1 pb-0 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.4)] z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* 3D Mini Cartelas Row - All 4 cartelas displayed side-by-side, compact height, zero header, zero gap */}
            <div className="flex gap-1.5 justify-center items-stretch overflow-x-auto pb-0 px-0.5 scrollbar-none">
              {myCartelas.map((c) => (
                <div
                  key={c.cartela_number}
                  className="relative w-[80px] sm:w-[88px] max-w-[94px] shrink-0 rounded-xl overflow-visible flex flex-col bg-gradient-to-b from-[#ffffff] via-[#fffdfa] to-[#f7f0e3] dark:from-[#0c1222] dark:via-[#131b2e] dark:to-[#0c1222] p-1 border-2 border-amber-400/90 dark:border-amber-500/40 shadow-[0_4px_10px_-2px_rgba(180,83,9,0.22),0_2px_4px_-1px_rgba(0,0,0,0.1),inset_0_1.5px_1px_rgba(255,255,255,1),inset_0_-1.5px_2px_rgba(217,119,6,0.12)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-amber-500/25 transition-all duration-150 hover:-translate-y-0.5"
                >
                  {/* 3D Floating Raised Cancel Button at Top-Right */}
                  <button
                    type="button"
                    disabled={pendingCancelsRef.current.has(c.cartela_number) || pendingPurchasesRef.current.has(c.cartela_number)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelCartela(c.cartela_number);
                    }}
                    className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-gradient-to-b from-red-400 via-red-500 to-red-600 text-white font-black flex items-center justify-center text-[9px] shadow-[0_2px_5px_rgba(220,38,38,0.5),inset_0_1px_1px_rgba(255,255,255,0.7)] border border-white hover:scale-110 active:scale-90 active:translate-y-0.5 transition-all cursor-pointer z-30 disabled:opacity-50 disabled:pointer-events-none"
                    title={language === 'am' ? 'ሰርዝ' : 'Cancel cartela'}
                  >
                    ✕
                  </button>

                  {/* 3D Embossed Card Header */}
                  <div className="px-1 py-0.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-md mb-0.5 flex items-center justify-between shadow-[0_1px_2px_rgba(180,83,9,0.3),inset_0_1px_0_rgba(255,255,255,0.7)] border border-amber-300">
                    <span className="text-[7.5px] font-black tracking-wider text-amber-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]">
                      HDASE
                    </span>
                    <span className="text-[7px] font-black bg-amber-950/80 text-amber-100 px-1 py-0.2 rounded shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                      #{c.cartela_number}
                    </span>
                  </div>

                  {/* 3D B-I-N-G-O Columns Bar */}
                  <div className="grid grid-cols-5 gap-[1px] mb-0.5">
                    {[
                      { l: 'B', bg: 'from-blue-500 via-blue-600 to-blue-700', bdr: 'border-blue-400' },
                      { l: 'I', bg: 'from-rose-500 via-red-600 to-red-700', bdr: 'border-rose-400' },
                      { l: 'N', bg: 'from-orange-400 via-amber-500 to-orange-600', bdr: 'border-orange-300' },
                      { l: 'G', bg: 'from-emerald-500 via-green-600 to-emerald-700', bdr: 'border-emerald-400' },
                      { l: 'O', bg: 'from-amber-400 via-yellow-500 to-amber-600', bdr: 'border-yellow-300' },
                    ].map(item => (
                      <div
                        key={item.l}
                        className={`h-3 flex items-center justify-center font-black text-white text-[7px] rounded-[2.5px] bg-gradient-to-b ${item.bg} border-t ${item.bdr} shadow-[0_1px_1.5px_rgba(0,0,0,0.2),inset_0_0.5px_0_rgba(255,255,255,0.6)] drop-shadow-[0_0.5px_0.5px_rgba(0,0,0,0.6)]`}
                      >
                        {item.l}
                      </div>
                    ))}
                  </div>

                  {/* 3D Matrix Grid & Tactile Number Tiles */}
                  <div className="bg-gradient-to-b from-amber-200/70 via-slate-200 to-amber-100/80 dark:from-slate-800/90 dark:via-slate-900 dark:to-slate-800/90 p-[1.5px] rounded-lg shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.15)] dark:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.7)] grid grid-cols-5 gap-[1px]">
                    {Array.from({ length: 5 }).flatMap((_, r) =>
                      Array.from({ length: 5 }, (_, col) => {
                        const num = c.card_matrix[r]?.[col];
                        const isFree = (r === 2 && col === 2) || num === 0;
                        return (
                          <div
                            key={`${r}-${col}`}
                            className={`aspect-square flex items-center justify-center font-black rounded-[2.5px] text-[7px] sm:text-[7.5px] leading-none transition-transform ${
                              isFree
                                ? 'bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500 text-amber-950 font-black border border-amber-300 shadow-[0_1.5px_3px_rgba(217,119,6,0.4),inset_0_0.5px_0.5px_rgba(255,255,255,0.9)] text-[8.5px]'
                                : 'bg-gradient-to-b from-white via-[#fafbfe] to-[#ebeff8] dark:from-[#141d33] dark:via-[#19243f] dark:to-[#11182c] text-slate-800 dark:text-slate-100 border-t border-white dark:border-slate-700/60 shadow-[0_1px_1.5px_rgba(0,0,0,0.1),inset_0_0.5px_0_rgba(255,255,255,0.95)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.1)]'
                            }`}
                          >
                            {isFree ? '★' : num}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-x-0 top-0 bottom-16 w-full bg-gradient-to-b from-[#fffbf0] via-[#fef3c7]/30 to-[#fffbf0] dark:from-[#070b14] dark:via-[#090e1c] dark:to-[#070b14] flex flex-col select-none overflow-hidden" onClick={initWebAudio}>
      <div className="sticky top-0 z-40 bg-white dark:bg-[#0b1020]/95 shadow-2xs border-b border-amber-100/80 dark:border-slate-800/80 flex flex-col shrink-0">
        <Header />
        {!isCallingBoardVisible && (
          <div className="bg-gradient-to-r from-amber-50/90 via-yellow-50/60 to-amber-50/90 dark:from-[#0b1020] dark:via-[#0f172a] dark:to-[#0b1020] border-b border-amber-200/70 dark:border-slate-800/80 px-3 pt-3 pb-3">
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
                  pendingPurchasesRef.current.clear();
      pendingCancelsRef.current.clear();
                  setActiveCartelaIdx(0);
                  setTaken([]);
                }} 
                className="h-9 w-9 flex items-center justify-center bg-white dark:bg-[#12192c] border border-amber-200/80 dark:border-slate-700/80 rounded-xl shrink-0 active:scale-95 transition-transform shadow-xs text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-[#1a233d]"
                title={language === 'am' ? 'ወደ ዕጣዎች ተመለስ' : 'Back to stakes'}
              >
                <ArrowLeft size={16} className="text-slate-700 dark:text-slate-200" />
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
                  className={`flex items-center gap-1 bg-amber-100/90 dark:bg-[#131b2e] border border-amber-300/80 dark:border-amber-500/30 rounded-xl px-2 h-9 text-amber-900 dark:text-amber-300 font-black text-xs shrink-0 max-w-[125px] shadow-xs ${myCartelas.length > 0 ? 'opacity-70 cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}
                  title={selectedRoom?.room_name || 'Room'}
                >
                  <DoorOpen size={13} className="text-amber-700 dark:text-amber-400 shrink-0" />
                  <span className="truncate">{selectedRoom?.room_name || 'Room'}</span>
                  <ChevronDown size={11} className={`text-amber-700 dark:text-amber-400 shrink-0 transition-transform ${showRoomDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Room Dropdown Menu */}
                {showRoomDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowRoomDropdown(false)} />
                    <div className="absolute top-[calc(100%+8px)] left-0 w-48 max-h-60 overflow-y-auto bg-white dark:bg-[#0c1222] border border-amber-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1" style={{ scrollbarWidth: 'none' }}>
                      <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          {language === 'am' ? 'ክፍል ምረጥ' : 'Select Room'}
                        </p>
                      </div>
                      {((rooms.filter(r => (!r.status || r.status === 'active') && !Boolean(r.is_private)).length > 0
                        ? rooms.filter(r => (!r.status || r.status === 'active') && !Boolean(r.is_private))
                        : rooms.filter(r => !Boolean(r.is_private))).slice().sort((a, b) => {
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
                                pendingPurchasesRef.current.clear();
      pendingCancelsRef.current.clear();
                                setActiveCartelaIdx(0);
                                setTaken([]);
                              }
                              setShowRoomDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between border-b border-slate-50 dark:border-slate-800/60 last:border-0 hover:bg-amber-50 dark:hover:bg-[#151f38] active:bg-amber-100 dark:active:bg-[#1a2645] transition-colors ${
                              isCurrent ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-black' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <DoorOpen size={13} className={isCurrent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'} />
                              <div className="truncate">
                                <div className="flex items-center space-x-1">
                                  {r.is_pinned && <span className="text-[10px]">📌</span>}
                                  <p className="font-black text-xs truncate leading-tight">{r.room_name}</p>
                                </div>
                                <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold leading-none mt-0.5 flex items-center gap-1"><Users size={10} className="inline text-slate-400 dark:text-slate-500" /> {r.total_players || 0}</p>
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
                  className={`flex items-center gap-1.5 bg-white dark:bg-[#12192c] border border-amber-200/80 dark:border-slate-700/80 rounded-xl px-2.5 h-9 text-slate-800 dark:text-slate-100 font-black text-xs transition-colors shadow-xs ${myCartelas.length > 0 ? 'opacity-50 cursor-not-allowed' : 'active:bg-amber-50 dark:active:bg-[#1a233d] cursor-pointer'}`}
                >
                  <span>{selectedStake} ETB</span>
                  <ChevronDown size={12} className={`text-slate-400 dark:text-slate-400 transition-transform ${showStakeDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {/* Dropdown Menu */}
                {showStakeDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowStakeDropdown(false)} />
                    <div className="absolute top-[calc(100%+8px)] left-0 w-36 bg-white dark:bg-[#0c1222] border border-amber-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                      {roomStakes.map(val => {
                        const hg = homeGames[val];
                        const isCall = hg?.status === 'calling';
                        const pCount = hg?.players || 0;
                        return (
                          <button
                            key={val}
                            onClick={() => {
                              setSelectedStake(val);
                              setSearchParams(params => {
                                params.set('stake', String(val));
                                if (selectedRoomId) params.set('room', selectedRoomId);
                                return params;
                              });
                              setGame(null); setMyCard(null); setMyCartelas([]); pendingPurchasesRef.current.clear(); pendingCancelsRef.current.clear(); setActiveCartelaIdx(0); setTaken([]);
                              setShowStakeDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-amber-50 dark:hover:bg-[#151f38] active:bg-amber-100 dark:active:bg-[#1a2645] transition-colors ${selectedStake === val ? 'text-amber-600 dark:text-amber-400 font-black' : 'text-slate-700 dark:text-slate-200'}`}
                          >
                            <span className="font-black text-xs">{val} ETB</span>
                            <div className="flex items-center gap-1.5">
                              {isCall ? (
                                <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-black px-1.5 py-0.5 rounded-full animate-pulse">Live</span>
                              ) : pCount > 0 ? (
                                <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-1.5 py-0.5 rounded-full">{pCount}p</span>
                              ) : null}
                              {selectedStake === val && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Game ID Box - 8 uppercase characters, no hyphen */}
              <div className="flex-1 min-w-[75px] bg-white dark:bg-[#12192c] border border-amber-200/80 dark:border-slate-700/80 rounded-xl h-9 flex flex-col items-center justify-center shadow-xs">
                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-black tracking-wider uppercase leading-none">{t[language].bingo.gameId}</span>
                <span className="text-xs font-black text-slate-800 dark:text-white leading-tight tracking-wider">{formatGameId(game.id)}</span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              <div className="bg-white/90 dark:bg-[#12192c] border border-amber-200/70 dark:border-slate-700/80 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase">{t[language].bingo.stake}</p><p className="text-xs font-black text-slate-800 dark:text-white">{game.stake} ETB</p></div>
              <div className="bg-white/90 dark:bg-[#12192c] border border-amber-200/70 dark:border-slate-700/80 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase">{t[language].bingo.players}</p><p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{Math.max(uniquePlayers, game.total_players || 0, taken.length > 0 ? 1 : 0)}</p></div>
              <div className="bg-white/90 dark:bg-[#12192c] border border-amber-200/70 dark:border-slate-700/80 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase">{t[language].bingo.cartelas}</p><p className="text-xs font-black text-blue-600 dark:text-blue-400">{taken.length}</p></div>
              <div className="bg-white/90 dark:bg-[#12192c] border border-amber-200/70 dark:border-slate-700/80 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase">{t[language].bingo.derash}</p><p className="text-xs font-black text-amber-600 dark:text-amber-400">{game.prize_pool || 0} ETB</p></div>
              <div className="bg-white/90 dark:bg-[#12192c] border border-amber-200/70 dark:border-slate-700/80 rounded-xl py-1.5 text-center shadow-2xs"><p className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase">{t[language].bingo.status}</p><p className={`text-xs font-black ${statusCls}`}>{statusTxt}</p></div>
            </div>
          </div>
        )}
      </div>

      {errMsg && (
        <div className={`mx-3 mt-2 px-3 py-2 ${isCallingBoardVisible ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-red-50 border-red-200 text-red-600'} border rounded-xl flex items-center justify-between z-10 shrink-0`}>
          <p className="text-xs font-bold">{errMsg}</p>
          <button onClick={() => setErrMsg("")} className="text-base leading-none ml-2 p-1 hover:bg-red-200/50 rounded-full transition-colors"><X size={14} /></button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isCallingBoardVisible ? renderCallingBoard() : renderCartelaPicker()}
      </div>

      {/* Winner Celebration */}
      {celebration && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 pb-20 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={dismissCelebration}>
          <div className="bg-white dark:bg-[#0c1222] border-2 border-amber-300 dark:border-amber-500/40 rounded-3xl p-3 sm:p-4 text-center max-w-[340px] sm:max-w-sm w-full max-h-[85dvh] overflow-y-auto shadow-2xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.8)] flex flex-col items-center relative my-auto scrollbar-none" onClick={e => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={dismissCelebration}
              className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs font-black active:scale-90 transition-all z-20 cursor-pointer shadow-xs" title="Close"><X size={15} className="text-slate-500 dark:text-slate-400" /></button>
            {/* -- REMATCH -- */}
            {celebration.winner_name === 'REMATCH' ? (<>
              <div className="mb-2 flex justify-center"><RotateCcw size={40} className="text-orange-500 animate-spin" /></div>
              <h2 className="text-2xl font-black text-orange-500 mb-1.5">{t[language].bingo.rematch}</h2>
              <div className="bg-amber-50/80 dark:bg-[#12192c] rounded-2xl p-2.5 mb-2 w-full border border-amber-200 dark:border-slate-700/80">
                <p className="text-orange-600 dark:text-orange-400 font-black text-xs mb-1">{t[language].bingo.tieDesc}</p>
                <p className="text-slate-600 dark:text-slate-300 text-[11px] font-semibold">{t[language].bingo.stakeRefunded}</p>
                <p className="text-slate-400 dark:text-slate-500 text-[10px] mt-1 font-semibold">{t[language].bingo.newGameStarts}</p>
              </div>
              <div className="flex flex-col items-center gap-1 mt-1 shrink-0 pb-1">
                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1">
                  <Clock size={11} className="text-amber-500 animate-spin" />
                  {t[language].bingo.returning}
                </p>
                <button
                  onClick={dismissCelebration}
                  className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 font-black underline underline-offset-2 cursor-pointer active:scale-95 transition-transform"
                >
                  {language === 'am' ? 'ወደ ጨዋታው ተመለስ' : 'Return to Game'}
                </button>
              </div>

            {/* -- 2-WAY TIE\u2b50 */}
              </>) : celebration.winner_name.includes(' & ') ? (<>
                <h2 className="text-xl font-black text-amber-700 dark:text-amber-400 mb-1">{t[language].bingo.tieTitle}</h2>
                <div className="mb-2 inline-block bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-3.5 py-1 rounded-full font-black text-sm border border-emerald-300 dark:border-emerald-500/40 shadow-2xs">
                  {celebration.winner_prize} ETB {t[language].bingo.each}
                </div>
                
                {celebration.winners_list && celebration.winners_list.length > 0 ? (
                  <div className="flex gap-2 w-full justify-center overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    {celebration.winners_list.map((w, idx) => {
                      const winCells = getWinningCells(w.card_matrix, celebration.called);
                      const winTitle = getWinningPatternTitle(w.card_matrix, celebration.called);
                      return (
                      <div key={idx} className="flex-shrink-0 w-[140px] bg-white dark:bg-[#12192c] rounded-2xl p-2 border-2 border-amber-200 dark:border-slate-700 shadow-xs flex flex-col items-center">
                        <p className="text-slate-900 dark:text-white font-black text-sm truncate w-full">{w.first_name}</p>
                        <div className="flex items-center justify-between w-full mb-1">
                          <p className="text-amber-700 dark:text-amber-400 text-[9px] font-bold flex items-center gap-1"><LayoutGrid size={10} className="text-amber-500 shrink-0" /> {t[language].bingo.cartelaNum.trim()} {w.cartela_number}</p>
                          <span className="text-emerald-700 dark:text-emerald-400 text-[7px] font-black">{winTitle.replace(' BINGO!', '')}</span>
                        </div>
                        <div className="w-full">
                          <div className="grid grid-cols-5">
                            {['B','I','N','G','O'].map(l => (
                              <div key={l} className="flex items-center justify-center py-0.5 font-black text-white text-[9px]" style={{ background: l==='B'?'#3b82f6':l==='I'?'#8b5cf6':l==='N'?'#ec4899':l==='G'?'#22c55e':'#3b82f6' }}>{l}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-5 gap-[1px] p-[1px] bg-amber-50/60 dark:bg-slate-900">
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
                                    ? 'bg-orange-100 dark:bg-orange-950/70 text-slate-800 dark:text-orange-200'
                                    : 'bg-white dark:bg-[#141d33] text-slate-800 dark:text-slate-200'
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
                  <div className="bg-amber-50/80 dark:bg-[#12192c] rounded-2xl p-3 mb-3 w-full border border-amber-200 dark:border-slate-700/80">
                    <p className="text-slate-900 dark:text-white font-black text-lg">{celebration.winner_name}</p>
                  </div>
                )}
                
                <div className="flex flex-col items-center gap-1 mt-1 shrink-0 pb-1">
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1">
                    <Clock size={11} className="text-amber-500 animate-spin" />
                    {t[language].bingo.returning}
                  </p>
                  <button
                    onClick={dismissCelebration}
                    className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 font-black underline underline-offset-2 cursor-pointer active:scale-95 transition-transform"
                  >
                    {language === 'am' ? 'ወደ ጨዋታው ተመለስ' : 'Return to Game'}
                  </button>
                </div>
  
              {/* \u2b50  -- */}
            </>) : (<>
              {/* Trophy + BINGO label - NO overlap */}
              <div className="flex flex-col items-center mb-2 mt-0.5 shrink-0">
                <div className="mb-1 flex justify-center"><Trophy size={36} className="text-amber-500 animate-bounce drop-shadow-md" /></div>
                <div className="bg-amber-400 text-amber-950 px-5 py-1 rounded-full font-black text-xl tracking-widest shadow-md">
                  BINGO!
                </div>
              </div>

              {/* Winner info */}
              <div className="w-full bg-amber-50/80 dark:bg-[#12192c] rounded-2xl p-2 sm:p-2.5 mb-2 border border-amber-200/80 dark:border-slate-700/80 shadow-2xs shrink-0">
                <p className="text-amber-800 dark:text-amber-400 text-[8.5px] uppercase tracking-widest mb-0.5 font-black">{t[language].bingo.winner}</p>
                <p className="text-slate-900 dark:text-white font-black text-xl leading-tight truncate px-1">{celebration.winner_name}</p>
                <p className="text-amber-700 dark:text-amber-400 text-[11px] font-bold mt-0.5 flex items-center justify-center gap-1"><LayoutGrid size={11} className="text-amber-500 shrink-0" /> {t[language].bingo.cartelaNum.trim()} {celebration.winner_cartela}</p>
                <div className="mt-1.5 inline-block bg-emerald-500 text-white px-5 py-1 rounded-full font-black text-base shadow-[0_3px_12px_rgba(16,185,129,0.35)]">
                  <Trophy size={15} className="text-amber-200 inline mr-1 -mt-0.5" />{celebration.winner_prize} ETB
                </div>
              </div>

              {/* Winner Card - green win cells, gold ring, pattern badge */}
              {celebration.winner_matrix ? (() => {
                const winCells = getWinningCells(celebration.winner_matrix, celebration.called);
                const winTitle = getWinningPatternTitle(celebration.winner_matrix, celebration.called);
                return (
                  <div className="w-full rounded-2xl overflow-hidden border-2 border-amber-300 dark:border-amber-500/40 mb-2 shadow-md bg-white dark:bg-[#0c1222] shrink-0">
                    {/* BINGO header */}
                    <div className="grid grid-cols-5">
                      {BINGO_LETTERS.map(l => (
                        <div key={l} className="flex items-center justify-center py-1 font-black text-white text-xs" style={{ background: LETTER_BG[l] }}>{l}</div>
                      ))}
                    </div>
                    {/* Card grid */}
                    <div className="grid grid-cols-5 gap-[1px] p-[1px] bg-amber-50/60 dark:bg-slate-900">
                      {Array.from({ length: 5 }).flatMap((_, r) => Array.from({ length: 5 }).map((_, c) => {
                        const num = celebration.winner_matrix![r][c];
                        const isFree = num === 0;
                        const isWin = winCells.has(`${r}-${c}`);
                        const isCalled = celebration.called?.map(Number).includes(Number(num));
                        return (
                          <div key={`${r}-${c}`} className={`aspect-square flex items-center justify-center font-black text-[10px] sm:text-xs rounded transition-all ${
                            isFree
                              ? 'bg-amber-400 text-amber-950 font-black'
                              : isWin
                              ? 'bg-emerald-500 text-white font-black shadow-md ring-2 ring-amber-300 scale-105 z-10'
                              : isCalled
                              ? 'bg-orange-100 dark:bg-orange-950/70 text-slate-800 dark:text-orange-200 font-bold'
                              : 'bg-white dark:bg-[#141d33] text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800'
                          }`}>
                            {isFree ? '\u2605' : num}
                          </div>
                        );
                      }))}
                    </div>
                    {/* Cartela label + Winning Rule Tag */}
                    <div className="py-1.5 px-2.5 flex items-center justify-between bg-white dark:bg-[#0c1222] border-t border-amber-200 dark:border-slate-800">
                      <p className="text-amber-800 dark:text-amber-400 font-black text-[10px] tracking-wider uppercase flex items-center gap-1"><LayoutGrid size={11} className="text-amber-500" /> {t[language].bingo.cartelaNum.trim()} {celebration.winner_cartela}</p>
                      <span className="text-emerald-700 dark:text-emerald-400 text-[9px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-500/40 shadow-2xs">
                        {winTitle}
                      </span>
                    </div>
                  </div>
                );
              })() : (
                <div className="w-full bg-amber-50/80 dark:bg-[#12192c] rounded-2xl p-3 mb-2 border border-amber-200 dark:border-slate-700/80 flex flex-col items-center shrink-0">
                  <div className="flex justify-center mb-1"><Clock size={24} className="animate-spin text-amber-500" /></div>
                  <p className="text-amber-800 dark:text-amber-400 text-xs font-bold">Loading winning cartela...</p>
                </div>
              )}

              {/* Auto-dismiss indicator & Return Action */}
              <div className="flex flex-col items-center gap-1 mt-1 shrink-0 pb-1">
                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1">
                  <Clock size={11} className="text-amber-500 animate-spin" />
                  {t[language].bingo.returning}
                </p>
                <button
                  onClick={dismissCelebration}
                  className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 font-black underline underline-offset-2 cursor-pointer active:scale-95 transition-transform"
                >
                  {language === 'am' ? 'ወደ ጨዋታው ተመለስ' : 'Return to Game'}
                </button>
              </div>
            </>)}

          </div>
        </div>
      )}

    </div>
  );
}
