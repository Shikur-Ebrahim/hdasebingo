/**
 * AgentLiveGameViewer — Dedicated Live Bingo Game Spectator / Monitor for Agents
 * Shows the exact live game board:
 * 1. Top stats bar (ID, Prize Pool, Players, Called Numbers 1/75, LIVE badge)
 * 2. 1-75 Master Called Numbers Board (color-coded BINGO rows)
 * 3. Current Called Ball banner with Letter, Number, Amharic pronunciation & audio
 * 4. Active Cartelas in play (exact 5x5 grids with marked balls & star center)
 * 5. Quick Stake Switcher (10 ETB, 20 ETB, 50 ETB, 100 ETB)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import {
  ArrowLeft,
  Trophy,
  LayoutGrid,
  Clock,
  Volume2,
  VolumeX,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Users,
  Sparkles,
  Gamepad2,
  RotateCcw,
  X,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

interface Props {
  roomId: string;
  roomName: string;
  initialStake?: number;
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

const STAKE_PRESETS = [10, 20, 50, 100];

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
  initialStake = 10,
  onClose,
}: Props) {
  const [selectedStake, setSelectedStake] = useState<number>(initialStake);
  const [game, setGame] = useState<BGame | null>(null);
  const [takenCartelas, setTakenCartelas] = useState<number[]>([]);
  const [cartelaMatrices, setCartelaMatrices] = useState<Record<number, number[][]>>({});
  const [stakeStatuses, setStakeStatuses] = useState<Record<number, { status: string; players: number; pool: number }>>({});

  // Default sound is ON (matching BingoGame.tsx and persisted to localStorage)
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
      }, 8000);
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
          setTakenCartelas(Array.isArray(data.taken_cartelas) ? data.taken_cartelas : []);
          const matrices: Record<number, number[][]> = data.cartela_matrices || {};
          setCartelaMatrices(matrices);

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
              fg.winner_matrix ?? matrices[fg.winner_cartela] ?? null;
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
              matrices[g.winner_cartela] ?? null;
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

  // ── Start Audio Trigger (game_start.mp3) ───────────────────────────────────
  // Plays when countdown reaches 0s or when game enters 'calling' before balls are called
  useEffect(() => {
    if (!game) return;
    if (!soundEnabled) return;

    const gid = String(game.id || '');
    if (introPlayedRef.current === gid) return;

    const calledCount = (game.called_numbers || []).length;
    const isCountingDownToZero =
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
  }, [game?.status, game?.id, game?.called_numbers, countdown, soundEnabled, playSpecial]);

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
  const recentCalls = [...called].reverse().slice(0, 4);

  // Active cartelas to render
  const activeCartelaList = Object.entries(cartelaMatrices).map(([num, matrix]) => ({
    cartela_number: Number(num),
    card_matrix: matrix,
  }));

  const formatGameId = (id: string) => {
    if (!id) return '';
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-50 flex flex-col overflow-hidden select-none animate-in slide-in-from-bottom duration-300">
      {/* ── Top Bar Header ── */}
      <div className="bg-white/95 backdrop-blur-md border-b border-amber-200/80 px-4 py-2.5 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
            title="Back to Agent Panel"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center space-x-1.5">
              <h2 className="font-black text-sm text-slate-900 tracking-tight">
                {roomName || "Agent's Room"}
              </h2>
              <span className="flex items-center space-x-1 bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Monitor</span>
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold">
              Real-time Spectator • {selectedStake} ETB Table
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all active:scale-95 ${
              soundEnabled
                ? 'bg-amber-100 border-amber-300 text-amber-700 shadow-2xs'
                : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}
            title={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Share Room Button */}
          <button
            type="button"
            onClick={handleShare}
            className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center active:scale-95 transition-all"
            title="Copy Game Invite Link"
          >
            {copiedLink ? <Check size={14} className="text-emerald-600" /> : <Share2 size={14} />}
          </button>
        </div>
      </div>

      {/* ── Quick Stake Preset Switcher Bar ── */}
      <div className="bg-amber-50/70 border-b border-amber-200/60 px-3 py-1.5 flex items-center justify-between gap-1.5 shrink-0">
        <span className="text-[10px] font-black text-amber-900/80 uppercase tracking-wider pl-1 shrink-0">
          Stakes:
        </span>
        <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {STAKE_PRESETS.map((stk) => {
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
                    introPlayedRef.current = null;
                  }
                }}
                className={`relative px-3 py-1 rounded-full text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-500/40'
                    : isCalling
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30 border border-emerald-400'
                    : hasWaitingPlayers
                    ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-400 shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                {/* Pulsing dot for live calling game */}
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

      {/* ── Full-Screen Celebration Overlay ── */}
      {celebration && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={() => setCelebration(null)}
        >
          <div
            className="bg-white border-2 border-amber-300 rounded-3xl p-4 text-center max-w-sm w-full shadow-2xl flex flex-col items-center relative my-auto"
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

            {/* REMATCH */}
            {celebration.winner_name === 'REMATCH' ? (
              <>
                <div className="mb-2 flex justify-center">
                  <RotateCcw size={48} className="text-orange-500 animate-spin" />
                </div>
                <h2 className="text-3xl font-black text-orange-500 mb-2">REMATCH!</h2>
                <div className="bg-amber-50/80 rounded-2xl p-3 mb-3 w-full border border-amber-200">
                  <p className="text-orange-600 font-black text-sm mb-1">
                    Game ended with no single winner!
                  </p>
                  <p className="text-slate-600 text-xs font-semibold">
                    Stakes have been refunded.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Trophy + BINGO! badge */}
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

                {/* Winner info card */}
                <div className="w-full bg-amber-50/80 rounded-2xl p-3 mb-3 border border-amber-200/80 shadow-2xs">
                  <p className="text-amber-800 text-[9px] uppercase tracking-widest mb-1 font-black">
                    WINNER
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

                {/* Winner 5×5 cartela grid */}
                {celebration.winner_matrix ? (() => {
                  const winCells = getWinningCells(celebration.winner_matrix, celebration.called);
                  const winTitle = getWinningPatternTitle(celebration.winner_matrix, celebration.called);
                  return (
                    <div className="w-full rounded-2xl overflow-hidden border-2 border-amber-300 mb-3 shadow-md bg-white">
                      {/* B-I-N-G-O header */}
                      <div className="grid grid-cols-5">
                        {BINGO_LETTERS.map(l => (
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
                            const isFree = num === 0;
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

      {/* ── Scrollable Game Area ── */}
      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-6 space-y-2.5" style={{ scrollbarWidth: 'none' }}>
        {loading && !game ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <RefreshCw size={28} className="animate-spin text-amber-500" />
            <p className="text-xs font-black text-slate-500">Connecting to {selectedStake} ETB table...</p>
          </div>
        ) : (
          <>
            {/* ── Top Game Stats Bar (Exact Match from Screenshot 1) ── */}
            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-2xl border border-amber-200/90 shadow-2xs">
              <div className="text-slate-700 text-[10px] font-black tracking-wide">
                ID: {game ? formatGameId(game.id) : '----'}
              </div>
              <div className="flex items-center gap-1 text-amber-700 text-[10px] font-black">
                <Trophy size={11} className="text-amber-500" />
                <span>{game?.prize_pool ?? 0} ETB</span>
              </div>
              <div className="flex items-center gap-1 text-blue-700 text-[10px] font-black">
                <LayoutGrid size={11} className="text-blue-500" />
                <span>{takenCartelas.length}</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-700 text-[10px] font-black">
                <Clock size={11} className="text-emerald-500" />
                <span>{called.length}/75</span>
              </div>
              <div>
                {game?.status === 'calling' ? (
                  <span className="text-[9px] bg-red-500/10 text-red-600 px-2 py-0.5 rounded-full font-black animate-pulse border border-red-200">
                    LIVE
                  </span>
                ) : game?.status === 'waiting' ? (
                  <span className="text-[9px] bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-black border border-amber-200">
                    WAITING
                  </span>
                ) : (
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-black border border-slate-200">
                    FINISHED
                  </span>
                )}
              </div>
            </div>

            {/* ── 1-75 Master Tracker Board (Exact Match from Screenshot 1) ── */}
            <div className="bg-white rounded-2xl px-2 py-2 border-2 border-amber-200/90 shadow-sm">
              <div className="flex flex-col gap-[3px]">
                {BINGO_LETTERS.map((letter, rowIdx) => (
                  <div key={letter} className="flex items-center gap-1.5">
                    {/* BINGO Letter Header Pill */}
                    <div
                      className="w-4 shrink-0 flex items-center justify-center font-black text-[11px]"
                      style={{ color: LETTER_COLOR[letter] }}
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
                            className={`h-[20px] rounded-[3px] flex items-center justify-center text-[8px] font-black transition-all ${
                              isLatest
                                ? 'bg-amber-400 text-amber-950 shadow-md ring-2 ring-orange-500 font-black scale-105 z-10'
                                : isCalled
                                ? 'bg-orange-500 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-400'
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

            {/* ── Caller Row (Exact Match from Screenshot 1) ── */}
            <div className="bg-white rounded-2xl border-2 border-amber-200/90 shadow-sm px-3.5 py-2.5 w-full max-w-[340px] mx-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {recentCalls.length === 0 ? (
                    <span className="text-amber-700 text-xs font-black animate-pulse py-2">
                      {countdown !== null
                        ? `Game starting in ${countdown}s...`
                        : 'Waiting for call...'}
                    </span>
                  ) : (
                    recentCalls.map((num, idx) => {
                      const l = getLetter(num);
                      const isFirst = idx === 0;
                      if (isFirst) {
                        return (
                          <div key={`${num}-${idx}`} className="flex items-center gap-2.5">
                            <div className="w-12 h-12 flex flex-col items-center justify-center rounded-full font-black border-2 border-amber-400 bg-amber-100/90 shadow-md animate-in zoom-in-90">
                              <span
                                style={{ color: LETTER_COLOR[l] }}
                                className="text-[10px] leading-none font-black"
                              >
                                {l}
                              </span>
                              <span className="text-slate-900 text-xl leading-none font-black">
                                {num}
                              </span>
                            </div>
                            <span className="text-amber-800 font-black text-sm">
                              {AMHARIC_NUM[num]}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={`${num}-${idx}`}
                          className="w-7 h-7 flex flex-col items-center justify-center rounded-full border border-amber-200 bg-amber-50/70"
                        >
                          <span
                            style={{ color: LETTER_COLOR[l] }}
                            className="text-[7px] leading-none font-black"
                          >
                            {l}
                          </span>
                          <span className="text-slate-700 text-[10px] leading-none font-black">
                            {num}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleSound}
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center active:scale-90 transition-all ${
                      soundEnabled
                        ? 'bg-amber-100 border-amber-400 text-amber-700 shadow-2xs'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Active Cartelas Section (Exact Match from Screenshot 1) ── */}
            <div className="w-full flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-amber-900 text-[11px] font-black tracking-wider uppercase">
                  CARTELAS ({activeCartelaList.length})
                </span>
                <span className="text-emerald-700 text-[9px] font-black uppercase tracking-wider bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  ALL ACTIVE
                </span>
              </div>

              {activeCartelaList.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 border-2 border-dashed border-amber-200 text-center space-y-3">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl mx-auto flex items-center justify-center text-amber-600">
                    <Gamepad2 size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">
                      No Cartelas Purchased Yet at {selectedStake} ETB
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Players will appear here as soon as they select their cartelas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs shadow-xs active:scale-95 transition-all"
                  >
                    <Share2 size={13} />
                    <span>Invite Players to Room</span>
                  </button>
                </div>
              ) : (
                <div
                  className={`grid gap-2.5 w-full ${
                    activeCartelaList.length === 1
                      ? 'grid-cols-1 max-w-[280px] mx-auto'
                      : 'grid-cols-2'
                  }`}
                >
                  {activeCartelaList.map((card) => (
                    <div key={card.cartela_number} className="w-full">
                      <div className="rounded-2xl overflow-hidden border-2 border-amber-300 shadow-md bg-white">
                        {/* B-I-N-G-O Colorful Header */}
                        <div className="grid grid-cols-5">
                          {BINGO_LETTERS.map((l) => (
                            <div
                              key={l}
                              className="flex items-center justify-center py-0.5 font-black text-white text-[10px]"
                              style={{ background: LETTER_BG[l] }}
                            >
                              {l}
                            </div>
                          ))}
                        </div>

                        {/* 5x5 Number Grid with Star in Center */}
                        <div className="grid grid-cols-5 gap-[2px] p-[3px] bg-amber-50/60">
                          {Array.from({ length: 5 }).flatMap((_, r) =>
                            Array.from({ length: 5 }, (_, c) => {
                              const num = card.card_matrix[r]?.[c] ?? 0;
                              const isFree = num === 0;
                              const isCalled = called.includes(num);
                              const marked = isFree || isCalled;
                              const isLast = num === lastNum;

                              return (
                                <div
                                  key={`${r}-${c}`}
                                  className={`aspect-square flex items-center justify-center font-black text-[11px] rounded transition-all select-none ${
                                    isFree
                                      ? 'bg-amber-400 text-amber-950 font-black'
                                      : isLast
                                      ? 'bg-orange-500 text-white shadow-md ring-2 ring-amber-300 scale-105 z-10'
                                      : marked
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-white text-slate-800 border border-slate-100 shadow-2xs'
                                  }`}
                                >
                                  {isFree ? '★' : num}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Cartela Number Footer */}
                        <div className="py-1 px-2 flex items-center justify-center bg-white border-t border-amber-200">
                          <p className="text-amber-800 font-black text-[9px] tracking-wider uppercase flex items-center gap-1.5">
                            <LayoutGrid size={11} className="text-amber-500 shrink-0" />
                            <span>CARTELA {card.cartela_number}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
