/**
 * AgentLiveGameViewer — 3D Advanced Live Bingo Game Spectator / Monitor for Agents
 * Mirrors the exact 3D advanced user bingo experience:
 * 1. Top stats bar (ID, Prize Pool, Players, Called Numbers 1/75, LIVE badge)
 * 2. 1-75 Master Called Numbers Board (3D gradient tiles, glowing pulse on latest)
 * 3. 3D Calling Sphere Row (52px 3D Black Sphere with specular reflection, Amharic word, 5 mini 3D spheres)
 * 4. Crisp Sound Calling (WebAudio + HTML5 Audio with 1-75 Amharic voices & celebration audio)
 * 5. Cartelas in Play (3D cartela cards with B-I-N-G-O header, star center, live marked numbers & pattern detection)
 * 6. Quick Stake Switcher (5 ETB, 10 ETB, 20 ETB, 35 ETB or custom room stakes with live indicators)
 * 7. Full-screen Winner Celebration Modal with 3D Trophy, BINGO badge & winning 5x5 card
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import WebApp from '@twa-dev/sdk';
import { getFixedCartelaMatrix } from '../lib/cartela';
import {
  ArrowLeft,
  Trophy,
  LayoutGrid,
  Clock,
  Volume2,
  VolumeX,
  Share2,
  Check,
  RefreshCw,
  Users,
  Sparkles,
  Gamepad2,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

interface Props {
  roomId: string;
  roomName: string;
  initialStake?: number;
  stakes?: number[];
  onClose: () => void;
}

interface BGame {
  id: string;
  stake: number;
  prize_pool: number;
  total_players?: number;
  status: 'waiting' | 'calling' | 'finished';
  called_numbers: number[];
  winner_cartela: number | null;
  winner_first_name: string | null;
  winner_prize: number | null;
  start_at: string;
  finished_at: string | null;
}

const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];

const LETTER_COLOR: Record<string, string> = {
  B: '#f59e0b',
  I: '#3b82f6',
  N: '#ec4899',
  G: '#22c55e',
  O: '#a855f7',
};

const LETTER_BG: Record<string, string> = {
  B: '#3b82f6',
  I: '#8b5cf6',
  N: '#ec4899',
  G: '#22c55e',
  O: '#3b82f6',
};

const getLetter = (num: number) => BINGO_LETTERS[Math.floor((num - 1) / 15)] || 'B';

const AMHARIC_NUM: Record<number, string> = {
  1: 'አንድ', 2: 'ሁለት', 3: 'ሶስት', 4: 'አራት', 5: 'አምስት',
  6: 'ስድስት', 7: 'ሰባት', 8: 'ስምንት', 9: 'ዘጠኝ', 10: 'አስር',
  11: 'አስራ አንድ', 12: 'አስራ ሁለት', 13: 'አስራ ሶስት', 14: 'አስራ አራት', 15: 'አስራ አምስት',
  16: 'አስራ ስድስት', 17: 'አስራ ሰባት', 18: 'አስራ ስምንት', 19: 'አስራ ዘጠኝ', 20: 'ሃያ',
  21: 'ሃያ አንድ', 22: 'ሃያ ሁለት', 23: 'ሃያ ሶስት', 24: 'ሃያ አራት', 25: 'ሃያ አምስት',
  26: 'ሃያ ስድስት', 27: 'ሃያ ሰባት', 28: 'ሃያ ስምንት', 29: 'ሃያ ዘጠኝ', 30: 'ሠላሳ',
  31: 'ሠላሳ አንድ', 32: 'ሠላሳ ሁለት', 33: 'ሠላሳ ሶስት', 34: 'ሠላሳ አራት', 35: 'ሠላሳ አምስት',
  36: 'ሠላሳ ስድስት', 37: 'ሠላሳ ሰባት', 38: 'ሠላሳ ስምንት', 39: 'ሠላሳ ዘጠኝ', 40: 'አርባ',
  41: 'አርባ አንድ', 42: 'አርባ ሁለት', 43: 'አርባ ሶስት', 44: 'አርባ አራት', 45: 'አርባ አምስት',
  46: 'አርባ ስድስት', 47: 'አርባ ሰባት', 48: 'አርባ ስምንት', 49: 'አርባ ዘጠኝ', 50: 'ሃምሳ',
  51: 'ሃምሳ አንድ', 52: 'ሃምሳ ሁለት', 53: 'ሃምሳ ሶስት', 54: 'ሃምሳ አራት', 55: 'ሃምሳ አምስት',
  56: 'ሃምሳ ስድስት', 57: 'ሃምሳ ሰባት', 58: 'ሃምሳ ስምንት', 59: 'ሃምሳ ዘጠኝ', 60: 'ስልሳ',
  61: 'ስልሳ አንድ', 62: 'ስልሳ ሁለት', 63: 'ስልሳ ሶስት', 64: 'ስልሳ አራት', 65: 'ስልሳ አምስት',
  66: 'ስልሳ ስድስት', 67: 'ስልሳ ሰባት', 68: 'ስልሳ ስምንት', 69: 'ስልሳ ዘጠኝ', 70: 'ሰባ',
  71: 'ሰባ አንድ', 72: 'ሰባ ሁለት', 73: 'ሰባ ሶስት', 74: 'ሰባ አራት', 75: 'ሰባ አምስት',
};

const DEFAULT_STAKES = [5, 10, 20, 35];

// ── Winning-cell helpers (mirrored from BingoGame.tsx) ──────────────────────
const getWinningCells = (matrix: number[][], called: number[]) => {
  const winCells = new Set<string>();
  if (!matrix || !called) return winCells;
  const calledSet = new Set((called || []).map(Number));
  const m = (r: number, c: number) => {
    const val = Number(matrix[r]?.[c] ?? -1);
    return val === 0 || calledSet.has(val);
  };
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every(c => m(r, c)))
      for (let c = 0; c < 5; c++) winCells.add(`${r}-${c}`);
  }
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every(r => m(r, c)))
      for (let r = 0; r < 5; r++) winCells.add(`${r}-${c}`);
  }
  if ([0, 1, 2, 3, 4].every(i => m(i, i)))
    for (let i = 0; i < 5; i++) winCells.add(`${i}-${i}`);
  if ([0, 1, 2, 3, 4].every(i => m(i, 4 - i)))
    for (let i = 0; i < 5; i++) winCells.add(`${i}-${4 - i}`);
  if (m(0, 0) && m(0, 4) && m(4, 0) && m(4, 4)) {
    ['0-0', '0-4', '4-0', '4-4'].forEach(k => winCells.add(k));
  }
  if (m(1, 1) && m(1, 3) && m(3, 1) && m(3, 3)) {
    ['1-1', '1-3', '3-1', '3-3'].forEach(k => winCells.add(k));
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
  const isDiag =
    [0, 1, 2, 3, 4].every(i => m(i, i)) || [0, 1, 2, 3, 4].every(i => m(i, 4 - i));
  if (isInnerCorners && !isRow && !isCol && !isDiag) return '🎯 2ND CORNER BINGO!';
  if (isOuterCorners && !isRow && !isCol && !isDiag) return '🎯 4 CORNERS BINGO!';
  if (isInnerCorners || isOuterCorners) return '🎯 CORNER BINGO!';
  return 'BINGO!';
};

interface CelebrationState {
  winner_name: string;
  winner_cartela: number;
  winner_prize: number;
  winner_matrix: number[][] | null;
  called: number[];
  winners_list?: any[];
}

export default function AgentLiveGameViewer({
  roomId,
  roomName,
  initialStake = 5,
  stakes = DEFAULT_STAKES,
  onClose,
}: Props) {
  const effectiveStakes = (Array.isArray(stakes) && stakes.length === 4) ? stakes : DEFAULT_STAKES;
  const [selectedStake, setSelectedStake] = useState<number>(() => {
    return effectiveStakes.includes(initialStake) ? initialStake : effectiveStakes[0];
  });
  const [game, setGame] = useState<BGame | null>(null);
  const [takenCartelas, setTakenCartelas] = useState<number[]>([]);
  const [uniquePlayers, setUniquePlayers] = useState<number>(0);
  const [cartelaMatrices, setCartelaMatrices] = useState<Record<number, number[][]>>({});
  const [cartelaPlayers, setCartelaPlayers] = useState<Record<number, { first_name?: string; is_system?: boolean; is_waiter?: boolean }>>({});
  const [stakeStatuses, setStakeStatuses] = useState<Record<number, { status: string; players: number; pool: number }>>({});

  // Active view: 'all' to see 2-col grid, or specific cartela number for zoomed view
  const [focusedCartela, setFocusedCartela] = useState<number | 'all'>('all');

  // Sound toggle (persisted to localStorage)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bingo_sound') !== 'false';
    } catch {
      return true;
    }
  });

  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [celebration, setCelebration] = useState<CelebrationState | null>(null);

  const prevCalledCountRef = useRef(0);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebratedGamesRef = useRef<Set<string>>(new Set());
  const introPlayedRef = useRef<string | null>(null);
  const prevCountdownRef = useRef<number | null>(null);
  const prevGameStatusRef = useRef<string | null>(null);

  // ── Web Audio + HTML5 Audio Pipeline (mirrored from BingoGame.tsx) ─────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferCache = useRef<Map<string, AudioBuffer>>(new Map());
  const rawBufferCache = useRef<Map<string, ArrayBuffer>>(new Map());
  const activeCallSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeSpecialSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);

  const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (typeof WebApp !== 'undefined' && WebApp.HapticFeedback) {
      WebApp.HapticFeedback.impactOccurred(style);
    }
  };

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
        if (ctx.state === 'running') {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
        }
      }
    } catch {}
  }, []);

  // Unlock on user interactions
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

  // Preload audio files
  useEffect(() => {
    let cancel = false;
    const preload = async () => {
      const allSrcs = [
        ...Array.from({ length: 75 }, (_, i) => `/audio/bingo/bingo_${String(i + 1).padStart(2, '0')}.mp3`),
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

  const playViaWebAudio = useCallback(async (src: string, isSpecial = false): Promise<boolean> => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();

      if (activeCallSourceRef.current) {
        try {
          activeCallSourceRef.current.stop();
          activeCallSourceRef.current.disconnect();
        } catch {}
        activeCallSourceRef.current = null;
      }
      if (isSpecial && activeSpecialSourceRef.current) {
        try {
          activeSpecialSourceRef.current.stop();
          activeSpecialSourceRef.current.disconnect();
        } catch {}
        activeSpecialSourceRef.current = null;
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
      source.buffer = audioBuf;
      source.connect(ctx.destination);

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
    } catch {
      return false;
    }
  }, [decodeAudio]);

  const playSpecial = useCallback((name: string = 'bingo_win') => {
    if (!soundEnabled) return;
    const src = `/audio/bingo/${name}.mp3`;
    unlockAudio();

    if (activeCallSourceRef.current) {
      try {
        activeCallSourceRef.current.stop();
        activeCallSourceRef.current.disconnect();
      } catch {}
      activeCallSourceRef.current = null;
    }
    if (htmlAudioRef.current) {
      try {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.currentTime = 0;
      } catch {}
    }

    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      playViaWebAudio(src, true);
      return;
    }

    try {
      const audio = new Audio(src);
      htmlAudioRef.current = audio;
      audio.play().catch(() => {
        playViaWebAudio(src, true);
      });
    } catch {
      playViaWebAudio(src, true);
    }
  }, [soundEnabled, unlockAudio, playViaWebAudio]);

  const playCallAudio = useCallback((num: number) => {
    if (!soundEnabled) return;
    const cleanNum = Number(num);
    if (!cleanNum || isNaN(cleanNum) || cleanNum < 1 || cleanNum > 75) return;

    const src = `/audio/bingo/bingo_${String(cleanNum).padStart(2, '0')}.mp3`;
    unlockAudio();

    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      playViaWebAudio(src, false);
      return;
    }

    try {
      if (htmlAudioRef.current) {
        htmlAudioRef.current.pause();
      }
      const audio = new Audio(src);
      htmlAudioRef.current = audio;
      audio.play().catch(() => {
        playViaWebAudio(src, false);
      });
    } catch {
      playViaWebAudio(src, false);
    }
  }, [soundEnabled, unlockAudio, playViaWebAudio]);

  const toggleSound = useCallback(() => {
    haptic('light');
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('bingo_sound', String(next));
      } catch {}
      if (next) unlockAudio();
      return next;
    });
  }, [unlockAudio]);

  const triggerCelebration = useCallback(
    (data: {
      winner_name: string;
      winner_cartela: number;
      winner_prize: number;
      winner_matrix: number[][] | null;
      called: number[];
      winners_list?: any[];
    }) => {
      setCelebration(data);
      playSpecial('bingo_win');
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = setTimeout(() => {
        setCelebration(null);
      }, 10000);
    },
    [playSpecial]
  );

  const getHeaders = () => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    return { 'x-telegram-init-data': initData };
  };

  // Fetch current live game for the selected stake & room
  const fetchLiveGame = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) setLoading(true);
        const res = await fetch(`${API}/bingo/current?stake=${selectedStake}&room=${roomId}`, {
          headers: getHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const g: BGame | null = data.game || null;
          setGame(g);
          if (data.unique_players !== undefined) setUniquePlayers(Number(data.unique_players));
          setTakenCartelas(Array.isArray(data.taken_cartelas) ? data.taken_cartelas : []);
          const matrices: Record<number, number[][]> = data.cartela_matrices || {};
          setCartelaMatrices(matrices);
          if (data.cartela_players) {
            setCartelaPlayers(data.cartela_players);
          }

          // Update live statuses across all stakes in this room
          if (Array.isArray(data.room_stakes)) {
            const map: Record<number, { status: string; players: number; pool: number }> = {};
            data.room_stakes.forEach((s: any) => {
              map[Number(s.stake)] = {
                status: s.status,
                players: Number(s.total_players || 0),
                pool: Number(s.prize_pool || 0),
              };
            });
            setStakeStatuses((prev) => ({ ...prev, ...map }));
          }

          // ── Trigger celebration from last_finished_game ──
          const fg = data.last_finished_game;
          if (
            fg?.id &&
            fg.winner_cartela != null &&
            !celebratedGamesRef.current.has(fg.id)
          ) {
            celebratedGamesRef.current.add(fg.id);
            const winnerMatrix: number[][] | null =
              fg.winner_matrix ?? matrices[fg.winner_cartela] ?? (fg.winner_cartela ? getFixedCartelaMatrix(fg.winner_cartela) : null);
            triggerCelebration({
              winner_name: fg.winner_first_name || 'Winner',
              winner_cartela: fg.winner_cartela,
              winner_prize: fg.winner_prize || 0,
              winner_matrix: winnerMatrix,
              called: fg.called_numbers || [],
              winners_list: fg.winners_list,
            });
          } else if (
            g?.status === 'finished' &&
            g.id &&
            g.winner_cartela != null &&
            !celebratedGamesRef.current.has(g.id)
          ) {
            celebratedGamesRef.current.add(g.id);
            const winnerMatrix: number[][] | null =
              matrices[g.winner_cartela] ?? (g.winner_cartela ? getFixedCartelaMatrix(g.winner_cartela) : null);
            triggerCelebration({
              winner_name: g.winner_first_name || 'Winner',
              winner_cartela: g.winner_cartela,
              winner_prize: g.winner_prize || 0,
              winner_matrix: winnerMatrix,
              called: g.called_numbers || [],
              winners_list: (g as any).winners_list,
            });
          }

          // Check for newly called balls to play sound
          const newCalledLen = g?.called_numbers?.length || 0;
          if (!isInitial && newCalledLen > prevCalledCountRef.current && g?.called_numbers) {
            const latestBall = g.called_numbers[g.called_numbers.length - 1];
            if (latestBall) {
              playCallAudio(latestBall);
              haptic('light');
            }
          }
          prevCalledCountRef.current = newCalledLen;
        }
      } catch (err) {
        console.error('Error fetching live game:', err);
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [selectedStake, roomId, playCallAudio, triggerCelebration]
  );

  // Fetch all pools for this room to detect live/active games on other stakes
  const fetchAllPools = useCallback(async () => {
    try {
      const res = await fetch(`${API}/bingo/pools?room=${roomId}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.pools)) {
          const map: Record<number, { status: string; players: number; pool: number }> = {};
          data.pools.forEach((p: any) => {
            map[Number(p.stake)] = {
              status: p.status,
              players: Number(p.unique_players || 0),
              pool: Number(p.prize_pool || 0),
            };
          });
          setStakeStatuses((prev) => ({ ...prev, ...map }));
        }
      }
    } catch {}
  }, [roomId]);

  // Initial fetch and poll every 1 second for live game updates
  useEffect(() => {
    prevCalledCountRef.current = 0;
    fetchLiveGame(true);
    fetchAllPools();

    const interval = setInterval(() => {
      fetchLiveGame(false);
      fetchAllPools();
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchLiveGame, fetchAllPools]);

  // Countdown timer calculation if game is waiting with a start_at
  useEffect(() => {
    if (!game || game.status !== 'waiting' || !game.start_at) {
      setCountdown(null);
      return;
    }

    const updateTimer = () => {
      const diff = Math.max(0, Math.ceil((new Date(game.start_at).getTime() - Date.now()) / 1000));
      // If start_at is very far in the future (> 1 hour), treat as waiting for min players
      if (diff > 3600) {
        setCountdown(null);
      } else {
        setCountdown(diff);
      }
    };

    updateTimer();
    const t = setInterval(updateTimer, 500);
    return () => clearInterval(t);
  }, [game]);

  const playerCount = Math.max(
    uniquePlayers,
    game?.total_players || 0,
    takenCartelas.length
  );
  const hasMinPlayers = playerCount >= 2;

  // Start Audio Trigger (game_start.mp3)
  useEffect(() => {
    if (!game) return;
    if (!soundEnabled) return;

    const gid = String(game.id || '');
    if (introPlayedRef.current === gid) return;

    const calledCount = (game.called_numbers || []).length;

    const isCountingDownToZero =
      hasMinPlayers &&
      game.status === 'waiting' &&
      countdown === 0 &&
      prevCountdownRef.current !== null &&
      prevCountdownRef.current > 0 &&
      prevCountdownRef.current <= 10;

    const isTransitionToCalling =
      game.status === 'calling' &&
      calledCount === 0 &&
      prevGameStatusRef.current === 'waiting';

    if (isCountingDownToZero || isTransitionToCalling) {
      introPlayedRef.current = gid;
      playSpecial('game_start');
    }

    prevCountdownRef.current = countdown;
    prevGameStatusRef.current = game.status;
  }, [game?.status, game?.id, game?.called_numbers, countdown, soundEnabled, playSpecial, hasMinPlayers]);

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  const shareLink = `https://t.me/${botUsername}?start=room_${roomId}`;

  const handleShare = () => {
    haptic('medium');
    navigator.clipboard.writeText(shareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const called = game?.called_numbers || [];
  const lastNum = called.length > 0 ? called[called.length - 1] : null;
  const recentCalls = [...called].reverse().slice(0, 6);

  // Active cartelas to render
  const activeCartelaList = useMemo(() => {
    return Object.entries(cartelaMatrices).map(([numStr, matrix]) => {
      const num = Number(numStr);
      return {
        cartela_number: num,
        card_matrix: matrix || getFixedCartelaMatrix(num),
        player: cartelaPlayers[num] || null,
      };
    });
  }, [cartelaMatrices, cartelaPlayers]);

  const formatGameId = (id: string) => {
    if (!id) return '';
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  };

  // Render a single 3D Cartela Card matching the user's bingo page
  const renderCartelaCard = (card: { cartela_number: number; card_matrix: number[][]; player?: { first_name?: string; is_system?: boolean; is_waiter?: boolean } | null }, isSingle = false) => {
    const winCells = getWinningCells(card.card_matrix, called);
    const winTitle = getWinningPatternTitle(card.card_matrix, called);
    const hasPattern = winCells.size > 0;

    return (
      <div className="rounded-2xl overflow-hidden border-2 border-amber-300 shadow-md bg-white transition-all">
        {/* Colorful B-I-N-G-O Header */}
        <div className="grid grid-cols-5">
          {BINGO_LETTERS.map((l) => (
            <div
              key={l}
              className={`flex items-center justify-center font-black text-white ${
                isSingle ? 'py-1.5 text-xs' : 'py-1 text-[10px]'
              }`}
              style={{ background: LETTER_BG[l] }}
            >
              {l}
            </div>
          ))}
        </div>

        {/* 5x5 Number Grid */}
        <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-amber-50/60">
          {Array.from({ length: 5 }).flatMap((_, r) =>
            Array.from({ length: 5 }, (_, c) => {
              const num = card.card_matrix[r]?.[c] ?? 0;
              const isFree = num === 0 || (r === 2 && c === 2);
              const isCalled = called.includes(num);
              const marked = isFree || isCalled;
              const isWinCell = winCells.has(`${r}-${c}`);
              const isLast = num === lastNum;

              return (
                <div
                  key={`${r}-${c}`}
                  className={`aspect-square flex items-center justify-center font-black rounded transition-all select-none ${
                    isSingle ? 'text-xs' : 'text-[10px]'
                  } ${
                    isFree
                      ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                      : isWinCell
                      ? 'bg-emerald-500 text-white font-black shadow-md ring-2 ring-amber-300 scale-105 z-10 animate-pulse'
                      : isLast
                      ? 'bg-gradient-to-b from-yellow-300 via-amber-400 to-yellow-500 text-amber-950 font-black shadow-md ring-2 ring-orange-500 scale-105 z-10'
                      : marked
                      ? 'bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600 text-white font-black shadow-[0_1px_2px_rgba(234,88,12,0.4),inset_0_0.5px_0.5px_rgba(255,255,255,0.8)]'
                      : 'bg-white text-slate-800 border border-slate-100 shadow-2xs'
                  }`}
                >
                  {isFree ? '★' : num}
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Cartela Number + Player Name + Pattern Status */}
        <div className="py-1 px-2 flex items-center justify-between bg-white border-t border-amber-200 text-[9px] font-black">
          <div className="flex items-center gap-1 text-amber-800 uppercase truncate">
            <LayoutGrid size={10} className="text-amber-500 shrink-0" />
            <span>#{card.cartela_number}</span>
            {card.player?.first_name && (
              <span className="text-slate-500 font-bold truncate max-w-[80px]">
                • {card.player.first_name}
              </span>
            )}
          </div>
          {hasPattern ? (
            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              {winTitle}
            </span>
          ) : (
            <span className="text-slate-400">
              {card.player?.is_waiter ? 'WAITER' : card.player?.is_system ? 'BOT' : 'IN PLAY'}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-50 flex flex-col overflow-hidden select-none animate-in slide-in-from-bottom duration-300 font-sans">
      {/* ── Top Bar Header (Matches User's Bingo Header) ── */}
      <div className="bg-white/95 backdrop-blur-md border-b border-amber-200/80 px-3 py-2 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95 transition-all cursor-pointer"
            title="Back to Agent Panel"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center space-x-1.5">
              <h2 className="font-black text-sm text-slate-900 tracking-tight truncate max-w-[150px]">
                {roomName || "Agent Room"}
              </h2>
              <span className="flex items-center space-x-1 bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Spectator 3D</span>
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold">
              Live Monitor • {selectedStake} ETB Table
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* 3D Sound Toggle Button */}
          <button
            type="button"
            onClick={toggleSound}
            className={`h-7 px-2.5 rounded-xl border flex items-center justify-center gap-1 active:scale-90 transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600 text-white border-blue-300 shadow-[0_2px_4px_rgba(37,99,235,0.35),inset_0_1px_0_rgba(255,255,255,0.8)]'
                : 'bg-gradient-to-b from-slate-100 to-slate-200 text-slate-400 border-slate-300 shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]'
            }`}
            title={soundEnabled ? 'Mute audio' : 'Unmute audio'}
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            className="w-7 h-7 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center active:scale-95 transition-all"
            title="Share Room Link"
          >
            {copiedLink ? <Check size={13} className="text-emerald-600" /> : <Share2 size={13} />}
          </button>

          {/* Close X Button */}
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onClose();
            }}
            className="w-7 h-7 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center active:scale-95 transition-all hover:bg-slate-200"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Quick Stake Switcher Bar (5, 10, 20, 35 ETB) ── */}
      <div className="bg-gradient-to-r from-amber-50 via-white to-amber-50 border-b border-amber-200/60 px-2.5 py-1.5 flex items-center justify-between gap-1 shrink-0">
        <span className="text-[9px] font-black text-amber-900/80 uppercase tracking-wider pl-1 shrink-0">
          STAKES:
        </span>
        <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {effectiveStakes.map((stk) => {
            const isActive = stk === selectedStake;
            const stakeInfo = stakeStatuses[stk];
            const isCalling = stakeInfo?.status === 'calling';
            const hasWaitingPlayers = !isCalling && ((stakeInfo?.players || 0) > 0 || (stakeInfo?.pool || 0) > 0);

            return (
              <button
                key={stk}
                type="button"
                onClick={() => {
                  if (stk !== selectedStake) {
                    haptic('light');
                    setSelectedStake(stk);
                    setGame(null);
                    setTakenCartelas([]);
                    setCartelaMatrices({});
                    setFocusedCartela('all');
                    introPlayedRef.current = null;
                  }
                }}
                className={`relative px-3 py-1 rounded-full text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-500/40'
                    : isCalling
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30 border border-emerald-400'
                    : hasWaitingPlayers
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-400 shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                {!isActive && isCalling && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                )}
                <span>{stk} ETB</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Spectator Content Container ── */}
      <div className="flex-1 flex flex-col overflow-y-auto px-2 py-1.5 space-y-1.5" style={{ scrollbarWidth: 'none' }}>
        {loading && !game ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <RefreshCw size={28} className="animate-spin text-amber-500" />
            <p className="text-xs font-black text-slate-500">Connecting to {selectedStake} ETB table...</p>
          </div>
        ) : (
          <>
            {/* ── Top Game Stats Bar (3D Card) ── */}
            <div className="shrink-0 flex items-center justify-between bg-white px-3 py-1.5 rounded-2xl border-2 border-amber-300/80 shadow-[0_2px_6px_rgba(180,83,9,0.08)]">
              <div className="text-slate-700 text-[10px] font-black tracking-wide">
                ID: {game ? formatGameId(game.id) : '----'}
              </div>
              <div className="flex items-center gap-1 text-amber-700 text-[10px] font-black">
                <Trophy size={11} className="text-amber-500" />
                <span>{game?.prize_pool ?? (selectedStake * takenCartelas.length)} ETB</span>
              </div>
              <div className="flex items-center gap-1 text-blue-700 text-[10px] font-black">
                <LayoutGrid size={11} className="text-blue-500" />
                <span>{takenCartelas.length} Cards</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-700 text-[10px] font-black">
                <Clock size={11} className="text-emerald-500" />
                <span>{called.length}/75</span>
              </div>
              <div>
                {game?.status === 'calling' ? (
                  <span className="text-[8.5px] bg-red-500 text-white px-2 py-0.5 rounded-full font-black animate-pulse shadow-xs">
                    LIVE
                  </span>
                ) : game?.status === 'waiting' ? (
                  <span className="text-[8.5px] bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full font-black shadow-xs">
                    {countdown !== null && countdown > 0 ? `${countdown}s` : 'WAITING'}
                  </span>
                ) : (
                  <span className="text-[8.5px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-black">
                    FINISHED
                  </span>
                )}
              </div>
            </div>

            {/* ── 1-75 Master Tracker Board (Exact 3D Grid from BingoGame.tsx) ── */}
            <div className="shrink-0 bg-white/95 rounded-2xl border-2 border-amber-300/80 shadow-[0_2px_8px_rgba(180,83,9,0.08)] px-2 py-1.5 w-full max-w-[420px] mx-auto">
              <div className="flex flex-col gap-[2px]">
                {BINGO_LETTERS.map((letter, rowIdx) => (
                  <div key={letter} className="flex items-center gap-1">
                    {/* BINGO Letter Header Pill */}
                    <div
                      className="w-4 h-[15.5px] rounded-[3px] flex items-center justify-center font-black text-[9px] text-white shrink-0 shadow-2xs"
                      style={{ background: LETTER_BG[letter] }}
                    >
                      {letter}
                    </div>

                    {/* 15 Numbers in this Row */}
                    <div
                      className="flex-1 grid gap-[2px]"
                      style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
                    >
                      {Array.from({ length: 15 }, (_, i) => {
                        const num = rowIdx * 15 + i + 1;
                        const isCalled = called.includes(num);
                        const isLatest = lastNum === num;

                        return (
                          <div
                            key={num}
                            className={`h-[15.5px] rounded-[2px] flex items-center justify-center text-[8px] font-black transition-all select-none ${
                              isLatest
                                ? 'bg-gradient-to-b from-yellow-300 via-amber-400 to-yellow-500 text-amber-950 font-black shadow-[0_0_8px_rgba(245,158,11,0.9),0_1.5px_2px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.95)] border border-amber-200 ring-2 ring-orange-500 animate-pulse scale-110 z-20'
                                : isCalled
                                ? 'bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600 text-white font-black shadow-[0_1px_2px_rgba(234,88,12,0.4),inset_0_0.5px_0.5px_rgba(255,255,255,0.8),inset_0_-0.5px_0.5px_rgba(180,83,9,0.4)] border border-amber-300'
                                : 'bg-gradient-to-b from-white via-[#fafbfe] to-[#ebeff8] text-slate-500 font-bold border border-slate-200/80 shadow-[0_0.5px_1px_rgba(0,0,0,0.05),inset_0_0.5px_0_rgba(255,255,255,0.95)]'
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

            {/* ── 3D Calling Sphere Row (Exact Match from BingoGame.tsx) ── */}
            <div className="shrink-0 bg-gradient-to-b from-white via-amber-50/20 to-white rounded-2xl border-2 border-amber-300/80 shadow-[0_3px_10px_rgba(180,83,9,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] px-2.5 py-1.5 w-full max-w-[420px] mx-auto">
              <div className="flex items-center justify-between gap-2">
                {/* LEFT: 52px 3D Black Calling Sphere with Specular Reflection Arc */}
                <div
                  className="rounded-full flex flex-col items-center justify-center font-black relative overflow-hidden shrink-0 border-2 border-slate-700/80 shadow-[0_5px_14px_rgba(0,0,0,0.7),inset_0_2.5px_4px_rgba(255,255,255,0.5),inset_0_-3.5px_6px_rgba(0,0,0,0.95)]"
                  style={{
                    width: '52px',
                    height: '52px',
                    minWidth: '52px',
                    minHeight: '52px',
                    background: 'radial-gradient(circle at 30% 25%, #64748b 0%, #1e293b 25%, #0f172a 55%, #020617 85%, #000000 100%)',
                  }}
                >
                  <div
                    className="absolute top-1 left-2 w-4 h-2.5 rounded-full pointer-events-none transform -rotate-25"
                    style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 80%)' }}
                  />
                  <span className="text-[8.5px] leading-none font-black text-amber-300 drop-shadow-[0_1px_1px_rgba(0,0,0,1)] tracking-widest uppercase">
                    {lastNum ? getLetter(lastNum) : 'BINGO'}
                  </span>
                  <span className="text-white text-xl leading-none font-black drop-shadow-[0_2px_4px_rgba(0,0,0,1)] tracking-tight">
                    {lastNum ?? '?'}
                  </span>
                </div>

                {/* MIDDLE: Amharic Word ABOVE + Up to 5 Mini 3D Black Spheres BELOW */}
                <div className="flex-1 min-w-0 flex flex-col justify-center items-start gap-1">
                  <div className="w-full">
                    <span className="text-amber-950 font-black text-xs sm:text-sm tracking-wide drop-shadow-[0_0.5px_0_rgba(255,255,255,0.9)] truncate block leading-tight">
                      {lastNum ? (AMHARIC_NUM[lastNum] || '') : (
                        game?.status === 'waiting'
                          ? (countdown !== null && countdown > 0 ? `Game starting in ${countdown}s...` : 'Waiting for players...')
                          : 'Waiting for calls...'
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {recentCalls.slice(1, 6).map((num, idx) => (
                      <div
                        key={`${num}-${idx}`}
                        className="rounded-full flex flex-col items-center justify-center font-black relative overflow-hidden shrink-0 border border-slate-700/80 shadow-[0_2px_5px_rgba(0,0,0,0.55),inset_0_1px_1.5px_rgba(255,255,255,0.4)]"
                        style={{
                          width: '25px',
                          height: '25px',
                          minWidth: '25px',
                          minHeight: '25px',
                          background: 'radial-gradient(circle at 30% 25%, #64748b 0%, #1e293b 30%, #0f172a 70%, #000000 100%)',
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
                    {recentCalls.length <= 1 && (
                      <span className="text-slate-400 text-[10px] font-semibold italic">Waiting for calls...</span>
                    )}
                  </div>
                </div>

                {/* RIGHT: Live Indicator Badge */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg border border-amber-300 text-[9px] font-black uppercase flex items-center gap-1">
                    <Sparkles size={10} className="text-amber-600" />
                    <span>AUDIO ON</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Cartela Selector & View Switcher Bar ── */}
            <div className="shrink-0 flex items-center justify-between px-1 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    setFocusedCartela('all');
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all active:scale-95 ${
                    focusedCartela === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  All ({activeCartelaList.length})
                </button>
                {activeCartelaList.map((card) => {
                  const isFocused = focusedCartela === card.cartela_number;
                  return (
                    <button
                      key={card.cartela_number}
                      type="button"
                      onClick={() => {
                        haptic('light');
                        setFocusedCartela(card.cartela_number);
                      }}
                      className={`px-2 py-1 rounded-xl text-[10px] font-black transition-all active:scale-95 shrink-0 ${
                        isFocused
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      #{card.cartela_number}
                    </button>
                  );
                })}
              </div>

              <span className="text-[9px] font-black text-amber-900 uppercase bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 shrink-0 ml-1">
                CARTELAS
              </span>
            </div>

            {/* ── Active Cartelas Section (3D Grid) ── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-0.5 pb-2" style={{ scrollbarWidth: 'none' }}>
              {activeCartelaList.length === 0 ? (
                /* Empty / Waiting Preview Card */
                <div className="w-full max-w-[280px] mx-auto relative mt-2 pointer-events-none">
                  <div className="rounded-2xl overflow-hidden border-2 border-amber-300 bg-white shadow-md">
                    <div className="grid grid-cols-5">
                      {BINGO_LETTERS.map((l) => (
                        <div
                          key={l}
                          className="flex items-center justify-center py-1 font-black text-white text-xs"
                          style={{ background: LETTER_BG[l] }}
                        >
                          {l}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-amber-50/60">
                      {Array.from({ length: 5 }).flatMap((_, r) =>
                        Array.from({ length: 5 }, (_, c) => {
                          const isFree = r === 2 && c === 2;
                          const num = isFree ? '★' : c * 15 + r + (c % 2 === 0 ? 3 : 8);
                          return (
                            <div
                              key={`${r}-${c}`}
                              className={`aspect-square flex items-center justify-center font-black text-xs rounded ${
                                isFree
                                  ? 'bg-amber-400 text-amber-950'
                                  : 'bg-white text-slate-800 shadow-2xs border border-slate-100'
                              }`}
                            >
                              {num}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs z-10 p-3 text-center">
                      <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center mb-1.5 border border-amber-500/30">
                        <Clock size={18} className="animate-pulse text-amber-400" />
                      </div>
                      <h3 className="text-amber-300 font-black text-sm uppercase tracking-wider mb-0.5">
                        {game?.status === 'calling' ? 'Game Active' : 'Waiting for Players'}
                      </h3>
                      <p className="text-white text-[9px] font-bold uppercase tracking-wider">
                        {countdown !== null && countdown > 0
                          ? `Starting in ${countdown} seconds`
                          : 'Cartelas will appear here when purchased'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : focusedCartela !== 'all' ? (
                /* Focused Single Cartela (Large View) */
                <div className="w-full max-w-[340px] mx-auto pt-1">
                  {(() => {
                    const card = activeCartelaList.find((c) => c.cartela_number === focusedCartela) || activeCartelaList[0];
                    return renderCartelaCard(card, true);
                  })()}
                </div>
              ) : (
                /* All Cartelas in 2-Column Responsive Grid */
                <div
                  className={`grid gap-2 w-full max-w-[420px] mx-auto pt-1 ${
                    activeCartelaList.length === 1 ? 'grid-cols-1 max-w-[280px]' : 'grid-cols-2'
                  }`}
                >
                  {activeCartelaList.map((card) => (
                    <div key={card.cartela_number} className="w-full">
                      {renderCartelaCard(card, activeCartelaList.length === 1)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Full-Screen Winner Celebration Modal (Matches BingoGame.tsx) ── */}
      {celebration && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-3 bg-black/65 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setCelebration(null)}
        >
          <div
            className="bg-white border-2 border-amber-300 rounded-3xl p-4 text-center max-w-sm w-full shadow-2xl flex flex-col items-center relative my-auto animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dismiss button */}
            <button
              type="button"
              onClick={() => setCelebration(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-black active:scale-90 transition-all z-20 cursor-pointer shadow-xs"
              title="Close"
            >
              <X size={16} className="text-slate-500" />
            </button>

            {/* REMATCH State */}
            {celebration.winner_name === 'REMATCH' ? (
              <>
                <div className="mb-2 flex justify-center">
                  <RotateCcw size={48} className="text-orange-500 animate-spin" />
                </div>
                <h2 className="text-3xl font-black text-orange-500 mb-2">REMATCH!</h2>
                <div className="bg-amber-50/80 rounded-2xl p-3 mb-3 w-full border border-amber-200">
                  <p className="text-orange-600 font-black text-sm mb-1">
                    Multiple players hit Bingo at the same time!
                  </p>
                  <p className="text-slate-600 text-xs font-semibold">
                    Stakes have been refunded to all players.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* 3D Trophy + BINGO! Badge */}
                <div className="flex flex-col items-center mb-3">
                  <div className="mb-1 flex justify-center">
                    <Trophy
                      size={52}
                      className="text-amber-500 animate-bounce drop-shadow-md"
                    />
                  </div>
                  <div className="bg-amber-400 text-amber-950 px-7 py-1.5 rounded-full font-black text-2xl tracking-widest shadow-md">
                    BINGO!
                  </div>
                </div>

                {/* Winner Info Card */}
                <div className="w-full bg-amber-50/80 rounded-2xl p-3 mb-3 border border-amber-200/80 shadow-2xs">
                  <p className="text-amber-800 text-[9px] uppercase tracking-widest mb-1 font-black">
                    WINNER CLAIM
                  </p>
                  <p className="text-slate-900 font-black text-2xl leading-tight">
                    {celebration.winner_name}
                  </p>
                  <p className="text-amber-700 text-xs font-bold mt-0.5 flex items-center justify-center gap-1.5">
                    <LayoutGrid size={12} className="text-amber-500 shrink-0" />
                    CARTELA {celebration.winner_cartela}
                  </p>
                  <div className="mt-2 inline-block bg-emerald-500 text-white px-6 py-1.5 rounded-full font-black text-lg shadow-[0_4px_16px_rgba(16,185,129,0.4)]">
                    <Trophy size={18} className="text-amber-200 inline mr-1.5 -mt-0.5" />
                    {celebration.winner_prize} ETB
                  </div>
                </div>

                {/* Winner 5x5 Cartela Grid */}
                {celebration.winner_matrix ? (() => {
                  const winCells = getWinningCells(celebration.winner_matrix, celebration.called);
                  const winTitle = getWinningPatternTitle(celebration.winner_matrix, celebration.called);
                  return (
                    <div className="w-full rounded-2xl overflow-hidden border-2 border-amber-300 mb-3 shadow-md bg-white">
                      {/* B-I-N-G-O header */}
                      <div className="grid grid-cols-5">
                        {BINGO_LETTERS.map((l) => (
                          <div
                            key={l}
                            className="flex items-center justify-center py-1.5 font-black text-white text-sm"
                            style={{ background: LETTER_BG[l] }}
                          >
                            {l}
                          </div>
                        ))}
                      </div>
                      {/* Grid cells */}
                      <div className="grid grid-cols-5 gap-[2px] p-[2px] bg-amber-50/60">
                        {Array.from({ length: 5 }).flatMap((_, r) =>
                          Array.from({ length: 5 }).map((_, c) => {
                            const num = celebration.winner_matrix![r][c];
                            const isFree = num === 0 || (r === 2 && c === 2);
                            const isWin = winCells.has(`${r}-${c}`);
                            const isCalled = celebration.called?.map(Number).includes(Number(num));
                            return (
                              <div
                                key={`${r}-${c}`}
                                className={`aspect-square flex items-center justify-center font-black text-xs rounded transition-all ${
                                  isFree
                                    ? 'bg-amber-400 text-amber-950 font-black'
                                    : isWin
                                    ? 'bg-emerald-500 text-white font-black shadow-md ring-2 ring-amber-300 scale-105 z-10'
                                    : isCalled
                                    ? 'bg-orange-100 text-slate-800 font-bold'
                                    : 'bg-white text-slate-800 border border-slate-100'
                                }`}
                              >
                                {isFree ? '★' : num}
                              </div>
                            );
                          })
                        )}
                      </div>
                      {/* Footer: winning pattern banner */}
                      <div className="bg-amber-100/90 py-1.5 px-3 flex items-center justify-center border-t border-amber-200">
                        <span className="text-amber-900 font-black text-xs tracking-wide">
                          {winTitle}
                        </span>
                      </div>
                    </div>
                  );
                })() : null}

                <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider animate-pulse">
                  Next game starting soon...
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
