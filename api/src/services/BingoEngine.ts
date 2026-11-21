import { supabase } from './supabase';
import { getSettings } from '../routes/adminSettings';
import { systemPlayerService } from './systemPlayerService';
import { invalidatePoolsCache } from '../routes/bingo';

const TICK_MS = 300; // 300ms responsive tick for exact call_interval_ms execution
export const DEFAULT_ROOM_STAKES = [5, 10, 20, 35];

// Deterministic 32-bit PRNG (Mulberry32)
function mulberry32(a: number) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 32-bit integer hash to ensure high entropy across all cartela numbers
function getCartelaSeed(num: number): number {
  let h = (Math.floor(num) * 2654435761) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h || 1;
}

/**
 * Standard fixed 300-cartela Bingo matrix generator.
 * For any given cartela number (1..300), returns the exact same fixed 5x5 card every time.
 * - Column 0 (B): 5 unique numbers from range 1-15
 * - Column 1 (I): 5 unique numbers from range 16-30
 * - Column 2 (N): 4 unique numbers from range 31-45, with center [2][2] = 0 (Free Space)
 * - Column 3 (G): 5 unique numbers from range 46-60
 * - Column 4 (O): 5 unique numbers from range 61-75
 */
export function getFixedCartelaMatrix(cartelaNumber: number): number[][] {
  const safeNum = Math.max(1, Math.floor(Number(cartelaNumber) || 1));
  const seed = getCartelaSeed(safeNum);
  const rng = mulberry32(seed);
  const zones: [number, number][] = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];
  const card: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));

  for (let col = 0; col < 5; col++) {
    const [lo, hi] = zones[col];
    const available: number[] = [];
    for (let n = lo; n <= hi; n++) available.push(n);

    // Deterministic Fisher-Yates shuffle for first 5 rows
    for (let r = 0; r < 5; r++) {
      const idx = r + Math.floor(rng() * (available.length - r));
      const temp = available[r];
      available[r] = available[idx];
      available[idx] = temp;
      card[r][col] = available[r];
    }
  }

  card[2][2] = 0; // Standard center FREE space
  return card;
}

export function generateBingoCard(seat?: number): number[][] {
  return getFixedCartelaMatrix(typeof seat === 'number' && seat > 0 ? seat : 1);
}

export function checkBingo(card: number[][], called: number[]): boolean {
  if (!card || !called) return false;
  const calledSet = new Set((called || []).map(Number));
  const m = (r: number, c: number) => {
    const val = Number(card[r]?.[c] ?? -1);
    return val === 0 || calledSet.has(val);
  };
  for (let r = 0; r < 5; r++) if ([0,1,2,3,4].every(c => m(r,c))) return true;
  for (let c = 0; c < 5; c++) if ([0,1,2,3,4].every(r => m(r,c))) return true;
  if ([0,1,2,3,4].every(i => m(i,i))) return true;
  if ([0,1,2,3,4].every(i => m(i,4-i))) return true;
  // Outer 4 corners
  if (m(0, 0) && m(0, 4) && m(4, 0) && m(4, 4)) return true;
  // Inner 4 corners (2nd frame / inner corners)
  if (m(1, 1) && m(1, 3) && m(3, 1) && m(3, 3)) return true;
  return false;
}

function formatGameId(id: string | null | undefined): string {
  if (!id) return '???';
  return id.replace(/-/g, '').substring(0, 8).toUpperCase();
}

class BingoEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private playerManualModes = new Map<string, boolean>();
  private gameLastCallTime = new Map<string, number>();
  private gamePlayersCache = new Map<string, any[]>();
  private lastWaitingSweepTime = 0;
  private lastWatchdogTime = 0;

  setPlayerMode(telegramId: string, gameId?: string, isManual?: boolean) {
    if (isManual === undefined) return;
    this.playerManualModes.set(telegramId, isManual);
    if (gameId) {
      this.playerManualModes.set(`${gameId}:${telegramId}`, isManual);
    }
  }

  isPlayerManual(telegramId: string, gameId?: string, dbIsManual?: boolean | null): boolean {
    if (gameId && this.playerManualModes.has(`${gameId}:${telegramId}`)) {
      return this.playerManualModes.get(`${gameId}:${telegramId}`)!;
    }
    if (this.playerManualModes.has(telegramId)) {
      return this.playerManualModes.get(telegramId)!;
    }
    if (dbIsManual !== null && dbIsManual !== undefined) {
      return Boolean(dbIsManual);
    }
    // Default is MANUAL OFF (auto mode: false)
    return false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    console.log('🎰 BingoEngine running — auto-game loop active');

    // Run initial startup sweep of old finished games (5 minutes retention)
    this.purgeStaleFinishedGames(300);

    // Continuous background sweep: purge finished games older than 5 minutes (300s)
    setInterval(() => {
      this.purgeStaleFinishedGames(300);
    }, 120000);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try { await this.step(); }
    catch (e) { console.error('[BingoEngine]', e); }
    finally { this.busy = false; }
  }

  private async step() {
    // 1. Fetch all active rooms with their custom stakes & system player settings
    const { data: activeRooms } = await supabase
      .from('rooms')
      .select('id, stakes, room_name, agent_id, commission_rate, promoter_id, promoter_commission_rate, system_players_enabled, system_players_pro_level, system_players_pro_expires_at, system_players_schedule_start, system_players_schedule_end, system_players_stake_configs, system_players_risk_percent, waiter_players_enabled, waiter_players_stake_configs, system_players_night_unlocked')
      .eq('status', 'active');

    const rooms = activeRooms || [];
    if (rooms.length === 0) return;
    const roomIds = rooms.map(r => r.id);

    // 2. Fetch all active non-finished games across all rooms in ONE batch query
    const { data: activeGames } = await supabase
      .from('bingo_games')
      .select('*')
      .in('room_id', roomIds)
      .neq('status', 'finished')
      .order('created_at', { ascending: false });

    const gamesMap = new Map<string, any>();
    const duplicateWaitersToClean: string[] = [];

    for (const g of activeGames || []) {
      const key = `${g.room_id}_${g.stake}`;
      if (!gamesMap.has(key)) {
        gamesMap.set(key, g);
      } else {
        const existing = gamesMap.get(key);
        // Priority: 'calling' game wins over 'waiting' game
        if (existing.status === 'waiting' && g.status === 'calling') {
          if (!existing.total_players || existing.total_players === 0) {
            duplicateWaitersToClean.push(existing.id);
          }
          gamesMap.set(key, g);
        } else if (existing.status === 'calling' && g.status === 'waiting') {
          if (!g.total_players || g.total_players === 0) {
            duplicateWaitersToClean.push(g.id);
          }
        } else if (existing.status === 'waiting' && g.status === 'waiting') {
          // If both waiting, keep the one with players or the newer one
          if ((Number(g.total_players) || 0) > (Number(existing.total_players) || 0)) {
            if (!existing.total_players || existing.total_players === 0) {
              duplicateWaitersToClean.push(existing.id);
            }
            gamesMap.set(key, g);
          } else if (!g.total_players || g.total_players === 0) {
            duplicateWaitersToClean.push(g.id);
          }
        }
      }
    }

    if (duplicateWaitersToClean.length > 0) {
      // Clean up orphaned empty duplicate games by deleting them instead of marking 'finished',
      // preventing clients from receiving false 'finished' events that shut down active countdowns!
      await supabase.from('bingo_games').delete().in('id', duplicateWaitersToClean);
    }

    // Separate games by operational state for decoupled, priority-based execution
    const callingGames: any[] = [];
    const waitingGames: { game: any; room: any }[] = [];
    const missingGames: { roomId: string; stake: number }[] = [];

    for (const room of rooms) {
      const roomStakes: number[] = (Array.isArray((room as any).stakes) && (room as any).stakes.length === 4)
        ? (room as any).stakes.map(Number)
        : DEFAULT_ROOM_STAKES;

      for (const stake of roomStakes) {
        const key = `${room.id}_${stake}`;
        const game = gamesMap.get(key);

        if (!game) {
          missingGames.push({ roomId: room.id, stake });
        } else if (game.status === 'calling') {
          callingGames.push(game);
        } else if (game.status === 'waiting') {
          waitingGames.push({ game, room });
        }
      }
    }

    // ── STEP A: PRIORITY 1 — LIVE CALLING GAMES ──────────────────────────────
    // Calling games execute concurrently and with top priority.
    // Each calling game checks its exact interval without waiting for other rooms/stakes!
    if (callingGames.length > 0) {
      await Promise.allSettled(callingGames.map(cg => this.handleCalling(cg)));
    }

    // ── STEP B: MISSING GAMES CREATION ────────────────────────────────────────
    if (missingGames.length > 0) {
      await Promise.allSettled(missingGames.map(m => this.createGame(m.roomId, m.stake)));
    }

    // ── STEP C: WAITING GAMES (READY GAMES INSTANTLY, BOT JOINS ~800ms) ──────────
    const now = Date.now();
    // If any waiting game's 30s countdown has reached 0: process IMMEDIATELY with 0ms delay!
    const dueWaitingGames = waitingGames.filter(wg => {
      const sTime = new Date(wg.game.start_at).getTime();
      return sTime <= now && sTime < now + 86400000;
    });

    if (dueWaitingGames.length > 0) {
      await Promise.allSettled(dueWaitingGames.map(wg => this.handleWaiting(wg.game, wg.room)));
    }

    if (now - this.lastWaitingSweepTime >= 800) {
      this.lastWaitingSweepTime = now;
      const otherWaiting = waitingGames.filter(wg => !dueWaitingGames.includes(wg));
      if (otherWaiting.length > 0) {
        await Promise.allSettled(otherWaiting.map(wg => this.handleWaiting(wg.game, wg.room)));
      }
    }

    // ── STEP D: ENGINE WATCHDOG (EVERY 20 SECONDS) ────────────────────────────
    if (now - this.lastWatchdogTime >= 20000) {
      this.lastWatchdogTime = now;
      await this.runEngineWatchdog(rooms);
    }
  }

  /**
   * Engine Watchdog: Automatically identifies and unsticks frozen/zombie games:
   * 1. Calling games older than 5 minutes (max 75 calls = 225s; any game calling > 5m is stuck).
   * 2. Waiting games with start_at expired > 90s ago that failed to transition.
   */
  private async runEngineWatchdog(rooms: any[]) {
    try {
      const now = Date.now();
      const cutoff5m = new Date(now - 300000).toISOString();

      // 1. Terminate stuck calling games (> 5 mins old)
      const { data: stuckCalling } = await supabase
        .from('bingo_games')
        .select('id, room_id, stake, created_at, updated_at')
        .eq('status', 'calling')
        .lt('created_at', cutoff5m);

      for (const sg of stuckCalling || []) {
        console.warn(`🚨 [Watchdog] Detected stuck calling game #${formatGameId(sg.id)} (Stake: ${sg.stake}). Force finishing.`);
        this.gameLastCallTime.delete(sg.id);
        this.gamePlayersCache.delete(sg.id);
        systemPlayerService.cleanupGame(sg.id);
        systemPlayerService.recordGameFinished(sg.room_id, Number(sg.stake));
        await supabase.from('bingo_games').update({
          status: 'finished',
          winner_first_name: 'Time Limit Expired',
          winner_prize: 0,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', sg.id);

        this.scheduleFinishedGameCleanup(sg.id);
        if (sg.room_id) {
          await this.createGame(sg.room_id, Number(sg.stake));
        }
      }

      // 2. Resolve waiting games with start_at expired > 90s ago
      const cutoff90s = new Date(now - 90000).toISOString();
      const { data: stuckWaiting } = await supabase
        .from('bingo_games')
        .select('id, room_id, stake, start_at')
        .eq('status', 'waiting')
        .lt('start_at', cutoff90s);

      for (const sw of stuckWaiting || []) {
        console.warn(`⚠️ [Watchdog] Detected stuck waiting game #${formatGameId(sw.id)} (Stake: ${sw.stake}, start_at expired). Resolving.`);
        const room = rooms.find(r => r.id === sw.room_id);
        await this.handleWaiting(sw, room);
      }
    } catch (wErr) {
      console.warn('[BingoEngine Watchdog] Error running watchdog:', wErr);
    }
  }

  public async createGame(roomId: string, stake: number) {
    // Prevent duplicate active games: check if a waiting or calling game already exists
    const { data: existing } = await supabase
      .from('bingo_games')
      .select('*')
      .eq('room_id', roomId)
      .eq('stake', stake)
      .in('status', ['waiting', 'calling'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return existing;
    }

    const start_at = new Date(Date.now() + 86400000 * 365).toISOString();

    const { data: newGame, error } = await supabase.from('bingo_games').insert({
      room_id: roomId,
      stake,
      prize_pool: 0,
      total_players: 0,
      status: 'waiting',
      called_numbers: [],
      start_at,
    }).select('*').single();

    if (error) {
      console.error(`❌ Failed to create game for room ${roomId} (Stake: ${stake}):`, error);
      return null;
    }

    const displayId = formatGameId(newGame?.id);
    console.log(`🎰 Room ${roomId} Game #${displayId} (Stake: ${stake}) created, waiting for first player`);
    return newGame;
  }

  private async handleWaiting(game: any, room?: any) {
    const cfg = await getSettings();

    // 🤖 System Player Simulation & Waiter Player:
    // If room has Pro Level 1, tick waiting game (handles auto-bustle if enabled & active, or waiter players if off/inactive)
    if (room && systemPlayerService.isRoomProActive(room)) {
      await systemPlayerService.tickWaitingGame(game, room, cfg);
    }

    const startTime = new Date(game.start_at).getTime();
    if (startTime > Date.now() + 86400000) return;
    if (Date.now() < startTime) return;

    const { data: pRows } = await supabase
      .from('bingo_players')
      .select('id, telegram_id, cartela_number, created_at, bonus_used, main_used, is_system, card_matrix, first_name, is_waiter, waiter_agent_id, system_player_id')
      .eq('game_id', game.id)
      .order('created_at', { ascending: true });
    
    const players = pRows || [];
    const uniquePlayers = new Set(players.map((r: any) => r.telegram_id)).size;
    const minPlayers = Math.max(2, Number(cfg.min_players || 2));

    if (uniquePlayers < minPlayers) {
      if (players.length === 0) {
        // No players at all — reset timer to far future
        await supabase.from('bingo_games').update({
          start_at: new Date(Date.now() + 86400000 * 365).toISOString(),
          prize_pool: 0,
          total_players: 0,
          updated_at: new Date().toISOString(),
        }).eq('id', game.id);
        return;
      }

      const realPlayers = players.filter((p: any) => !p.is_system);
      const firstJoinedTime = new Date((realPlayers.length > 0 ? realPlayers[0] : players[0]).created_at).getTime();
      const waitingDurationSec = (Date.now() - firstJoinedTime) / 1000;
      const releaseTimeoutSec = Math.max(300, Number(cfg.release_time_s || 300)); // strictly at least 5 minutes (300s)

      // Has the release time (strictly 5 minutes / 300s) expired?
      if (waitingDurationSec >= releaseTimeoutSec) {
        console.log(`⏰ Game #${formatGameId(game.id)} (Stake: ${game.stake}): Release time reached (${Math.round(waitingDurationSec)}s >= ${releaseTimeoutSec}s). Refunding cartelas and releasing player.`);
        await this.refundAndResetGame(game);
        return;
      }

      // Still within release time: extend timer smoothly by 30s
      const remainingSec = Math.min(30, Math.ceil(releaseTimeoutSec - waitingDurationSec));
      await supabase.from('bingo_games').update({
        start_at: new Date(Date.now() + remainingSec * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', game.id);
      console.log(`🎰 Game #${formatGameId(game.id)} extended by ${remainingSec}s (${Math.round(waitingDurationSec)}s elapsed / ${releaseTimeoutSec}s total release limit)`);
      return;
    }

    // 2+ unique players (real, bot, or real + bot): START GAME!
    const totalCartelas = players.length;
    const rawPot = totalCartelas * Number(game.stake);
    const prizePercent = uniquePlayers >= 3 ? Number(cfg.prize_percent || 80) : 100;
    const prizePool = Math.floor((rawPot * prizePercent) / 100);

    // Cache players in memory for instant, zero-database win checks during calling
    this.gamePlayersCache.set(game.id, players);

    // Ball #1 is called immediately (0ms delay) on the next tick!
    this.gameLastCallTime.set(game.id, 0);

    game.status = 'calling';
    const { error: startErr } = await supabase.from('bingo_games').update({
      status: 'calling',
      called_numbers: [],
      prize_pool: prizePool,
      total_players: uniquePlayers,
      updated_at: new Date().toISOString(),
    }).eq('id', game.id);

    if (startErr) {
      console.error(`❌ Error starting Game #${formatGameId(game.id)}:`, startErr);
    }
    invalidatePoolsCache();
    console.log(`🎰 Game #${formatGameId(game.id)} started with ${uniquePlayers} unique players (min: ${minPlayers})! Stake: ${game.stake} ETB | Derash: ${prizePool} ETB | First ball in ~0.6s.`);
  }

  private async refundAndResetGame(game: any) {
    const stake = Number(game.stake);
    const botToken = process.env.BOT_TOKEN;

    // 1. ATOMIC DELETE FIRST: Delete all players for this game and retrieve only those actually deleted!
    // This guarantees that concurrent cancel requests (/leave) cannot double-refund!
    const { data: deletedRows, error: delErr } = await supabase
      .from('bingo_players')
      .delete()
      .eq('game_id', game.id)
      .select('id, telegram_id, cartela_number, bonus_used, main_used, is_system, is_waiter, waiter_agent_id, waiter_stake_deducted');

    if (delErr) {
      console.error(`❌ Error deleting players during refund for game #${formatGameId(game.id)}:`, delErr);
      return;
    }

    const players = deletedRows || [];
    if (players.length === 0) {
      console.log(`ℹ️ No players left to refund for expired game #${formatGameId(game.id)} (already cancelled).`);
      await supabase.from('bingo_games').update({
        start_at: new Date(Date.now() + 86400000 * 365).toISOString(),
        prize_pool: 0,
        total_players: 0,
        real_players_count: 0,
        system_players_count: 0,
        updated_at: new Date().toISOString()
      }).eq('id', game.id);
      return;
    }

    // Filter only REAL players for refund
    const realPlayers = players.filter((p: any) => !p.is_system);

    // Group real players by telegram_id — summing bonus_used and main_used per user
    const userRefunds: Record<string, { bonusAmt: number; mainAmt: number; count: number }> = {};
    for (const p of realPlayers) {
      if (!userRefunds[p.telegram_id]) {
        userRefunds[p.telegram_id] = { bonusAmt: 0, mainAmt: 0, count: 0 };
      }
      let m = Number(p.main_used || 0);
      let b = Number(p.bonus_used || 0);
      if (m === 0 && b === 0) m = stake;
      if (m + b > stake) m = Math.max(0, stake - b);
      userRefunds[p.telegram_id].bonusAmt += b;
      userRefunds[p.telegram_id].mainAmt  += m;
      userRefunds[p.telegram_id].count    += 1;
    }

    // Refund each real user back to the SAME wallet they originally paid from
    for (const [telegramId, { bonusAmt, mainAmt, count }] of Object.entries(userRefunds)) {
      const totalRefund = bonusAmt + mainAmt;
      const { data: u } = await supabase
        .from('users')
        .select('main_balance, bonus_balance')
        .eq('telegram_id', telegramId)
        .single();

      if (u) {
        await supabase.from('users').update({
          main_balance: Number(u.main_balance || 0) + mainAmt,
          bonus_balance: Number(u.bonus_balance || 0) + bonusAmt,
        }).eq('telegram_id', telegramId);
      }

      if (botToken) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramId,
              text: `⏰ Game #${formatGameId(game.id)} expired (no second player joined). Your ${totalRefund} ETB (${count} cartela${count > 1 ? 's' : ''}) has been refunded.`,
            }),
          });
        } catch {}
      }
    }

    // Refund waiter players back to the Room Owner / Agent Balance
    const waiterPlayers = players.filter((p: any) => p.is_waiter && p.waiter_agent_id);
    for (const wp of waiterPlayers) {
      const stakeToRefund = Number(wp.waiter_stake_deducted || wp.main_used || stake || 0);
      if (stakeToRefund > 0) {
        try {
          const { data: agent } = await supabase
            .from('users')
            .select('id, main_balance')
            .eq('id', wp.waiter_agent_id)
            .maybeSingle();

          if (agent) {
            const refundedBal = Number(agent.main_balance || 0) + stakeToRefund;
            await supabase.from('users').update({ main_balance: refundedBal }).eq('id', agent.id);
            console.log(`↩️ Refunded ${stakeToRefund} ETB to Agent ${agent.id} for cancelled Waiter Player cartela #${wp.cartela_number}`);
          }
        } catch (rfErr) {
          console.error('Error refunding agent for waiter cartela:', rfErr);
        }
      }
    }

    // Reset game state
    await supabase.from('bingo_games').update({
      start_at: new Date(Date.now() + 86400000 * 365).toISOString(),
      prize_pool: 0,
      total_players: 0,
      real_players_count: 0,
      system_players_count: 0,
      status: 'waiting',
      called_numbers: [],
      updated_at: new Date().toISOString(),
    }).eq('id', game.id);

    systemPlayerService.cleanupGame(game.id);
    this.gameLastCallTime.delete(game.id);
    this.gamePlayersCache.delete(game.id);
  }

  private async handleCalling(game: any) {
    try {
      const called: number[] = (game.called_numbers || []).map(Number);
      const cfg = await getSettings();

      // Check if interval has passed since last called ball
      const callIntervalMs = Number(cfg.call_interval_ms || 3000);
      const lastCalledTime = this.gameLastCallTime.get(game.id) || 0;
      const timeSinceLastCall = Date.now() - lastCalledTime;

      // FIRST BALL FIX: If called is empty (ball #1), call immediately with 0 delay!
      if (called.length > 0 && lastCalledTime > 0 && timeSinceLastCall < callIntervalMs) {
        return;
      }

      if (called.length >= 75) {
        // All 75 numbers called — finish with no winner
        console.log(`🎰 Game #${formatGameId(game.id)} finished: all 75 numbers called with no winner.`);
        this.gameLastCallTime.delete(game.id);
    this.gamePlayersCache.delete(game.id);
        await supabase.from('bingo_games').update({
          status: 'finished',
          winner_first_name: 'No Winner',
          winner_prize: 0,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', game.id);
        systemPlayerService.cleanupGame(game.id);
        systemPlayerService.recordGameFinished(game.room_id, Number(game.stake));
        this.scheduleFinishedGameCleanup(game.id);
        await this.incrementRoomGames(game.room_id);
        if (game.room_id) {
          await this.createGame(game.room_id, game.stake);
        }
        return;
      }

      // Pick next uncalled number
      const calledSet = new Set(called);
      const uncalled: number[] = [];
      for (let i = 1; i <= 75; i++) {
        if (!calledSet.has(i)) uncalled.push(i);
      }
      const nextNumber = uncalled[Math.floor(Math.random() * uncalled.length)];
      const newCalled = [...called, nextNumber];

      const { error: updErr } = await supabase.from('bingo_games').update({
        called_numbers: newCalled,
        updated_at: new Date().toISOString(),
      }).eq('id', game.id).eq('status', 'calling');

      if (updErr) {
        console.error(`❌ Failed to update called numbers for Game #${formatGameId(game.id)}:`, updErr);
        return;
      }

      this.gameLastCallTime.set(game.id, Date.now());

      // Check winners after calling this number
      await this.checkWinners(game.id, newCalled, game.prize_pool, game.stake, game.room_id);
    } catch (err) {
      console.error(`❌ Error in handleCalling for Game #${formatGameId(game.id)}:`, err);
    }
  }

  private async checkWinners(
    gameId: string,
    called: number[],
    prizePool: number,
    stake: number,
    roomId?: string,
  ) {
    try {
      let players = this.gamePlayersCache.get(gameId);
      if (!players || players.length === 0) {
        const { data: pData, error: plErr } = await supabase
          .from('bingo_players')
          .select('id, telegram_id, cartela_number, card_matrix, first_name, is_system, is_waiter, waiter_agent_id, system_player_id')
          .eq('game_id', gameId);

        if (plErr) {
          console.error(`❌ Error fetching players for Game #${formatGameId(gameId)}:`, plErr);
          return;
        }
        players = pData || [];
        this.gamePlayersCache.set(gameId, players);
      }

      if (!players || players.length === 0) {
        // If a calling game has 0 players, don't keep calling 75 balls for ghost!
        console.warn(`⚠️ Game #${formatGameId(gameId)} has 0 players in calling status. Finishing ghost game.`);
        this.gameLastCallTime.delete(gameId);
    this.gamePlayersCache.delete(gameId);
      this.gamePlayersCache.delete(gameId);
        systemPlayerService.cleanupGame(gameId);
        systemPlayerService.recordGameFinished(roomId, Number(stake));
        await supabase.from('bingo_games').update({
          status: 'finished',
          winner_first_name: 'No Players',
          winner_prize: 0,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', gameId);
        this.scheduleFinishedGameCleanup(gameId);
        if (roomId) await this.createGame(roomId, stake);
        return;
      }

    // System bots check automatically. Real players check automatically ONLY if auto mode is on.
    const autoPlayers = players.filter(p => p.is_system || !this.isPlayerManual(p.telegram_id, gameId, (p as any).is_manual));
    const winningRows = autoPlayers.filter(p => checkBingo(p.card_matrix as number[][], called));
    if (winningRows.length === 0) return;

    // Deduplicate by telegram_id: if same user/bot wins with 2 cartelas, pick one
    const seenTelegramIds = new Set<string>();
    const winners: typeof winningRows = [];
    for (const row of winningRows) {
      if (!seenTelegramIds.has(row.telegram_id)) {
        seenTelegramIds.add(row.telegram_id);
        winners.push(row);
      }
    }

    const realPlayers = players.filter(p => !p.is_system);
    const realUniqueCount = new Set(realPlayers.map(p => p.telegram_id)).size;
    const realCartelasCount = realPlayers.length;

    const systemPlayers = players.filter(p => p.is_system);
    const systemPlayersCount = new Set(systemPlayers.map(p => p.telegram_id)).size;

    const waiterPlayers = players.filter((p: any) => p.is_waiter);
    const waiterPlayersCount = new Set(waiterPlayers.map((p: any) => p.telegram_id)).size;
    const autoBustleBotsCount = systemPlayersCount - waiterPlayersCount;

    const totalUniqueCount = realUniqueCount + systemPlayersCount;
    const totalCartelasCount = players.length;
    const rawPot = totalCartelasCount * stake;
    const cfg = await getSettings();
    // Derash is 100% (0% commission) for 2 players; 80% (or prize_percent) for 3+ players
    const prizePercent = totalUniqueCount >= 3 ? Number(cfg.prize_percent || 80) : 100;
    const prize = Math.floor((rawPot * prizePercent) / 100);

    const token = process.env.BOT_TOKEN;

    const notify = async (chatId: string, text: string) => {
      try {
        if (token && !chatId.startsWith('sys_') && !chatId.startsWith('10000000')) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
          });
        }
      } catch {}
    };

    // ── CASE 1: Single winner ──────────────────────────────────────────────────
    if (winners.length === 1) {
      const w = winners[0];
      const cfg = await getSettings();
      let finalPrize = prize;
      let isEarlyCall = false;

      // Early call bonuses
      if (cfg.early_call_8_enabled && called.length <= 8) {
        const rewards8 = cfg.early_call_8_rewards as Record<string, number>;
        const rew = rewards8[String(stake)] || rewards8[stake.toString()];
        if (rew) { finalPrize = Number(rew); isEarlyCall = true; }
      } else if (cfg.early_call_10_enabled && called.length <= 10) {
        const rewards10 = cfg.early_call_10_rewards as Record<string, number>;
        const rew = rewards10[String(stake)] || rewards10[stake.toString()];
        if (rew) { finalPrize = Number(rew); isEarlyCall = true; }
      }

      const isWinnerSystem = Boolean(w.is_system);
      let roomOwnerRiskAmount = 0;

      // Room owner 25% risk logic:
      // Applies ONLY if real player won AND at least one unbacked auto-bustle bot was in this game!
      // If only waiter players (backed by agent balance) were present, no 25% extra deduction!
      // NEVER applies to HDASE BINGO official room (never deducts admin balance)
      const isOfficialHdaseRoom = roomId === 'd7c9114a-e112-426f-8f9b-13c00050279c';
      if (!isWinnerSystem && autoBustleBotsCount >= 1 && roomId && !isOfficialHdaseRoom) {
        try {
          const { data: roomData } = await supabase
            .from('rooms')
            .select('room_name, agent_id, system_players_risk_percent')
            .eq('id', roomId)
            .maybeSingle();

          const isPlatformRoom = roomData?.agent_id === '5b3ac1f4-6a29-4929-9fc4-5043c0118572' || roomData?.room_name === 'HDASE BINGO';
          if (roomData && roomData.agent_id && !isPlatformRoom) {
            const riskPercent = Number(roomData.system_players_risk_percent ?? 25);
            roomOwnerRiskAmount = Math.round(((finalPrize * riskPercent) / 100) * 100) / 100;

            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomData.agent_id);
            const agentQuery = isUuid
              ? supabase.from('users').select('id, main_balance').eq('id', roomData.agent_id)
              : supabase.from('users').select('id, main_balance').eq('telegram_id', roomData.agent_id);

            const { data: agentUser } = await agentQuery.maybeSingle();
            if (agentUser) {
              const newBal = Math.max(0, Number(agentUser.main_balance || 0) - roomOwnerRiskAmount);
              await supabase.from('users').update({ main_balance: newBal }).eq('id', agentUser.id);
              console.log(`⚠️ Room Owner Risk: Agent ${agentUser.id} deducted -${roomOwnerRiskAmount} ETB (25% risk on ${finalPrize} ETB won by real user with ${autoBustleBotsCount} bots)`);
            }
          }
        } catch (riskErr) {
          console.error('Error applying room owner risk:', riskErr);
        }
      }

      const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
        status:             'finished',
        called_numbers:     called,
        prize_pool:         finalPrize,
        winner_telegram_id: w.telegram_id,
        winner_first_name:  isEarlyCall ? `🚀 EARLY BINGO: ${w.first_name}` : w.first_name,
        winner_cartela:     w.cartela_number,
        winner_prize:       finalPrize,
        room_owner_risk_amount: roomOwnerRiskAmount,
        real_players_count: realUniqueCount,
        system_players_count: systemPlayersCount,
        waiter_players_count: waiterPlayersCount,
        finished_at:        new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).eq('id', gameId).eq('status', 'calling').select('id');

      if (claimErr || !claim || claim.length === 0) return;

      if (isWinnerSystem) {
        // System bot won: update system_players.total_won
        if (w.system_player_id) {
          try {
            const { data: sp } = await supabase.from('system_players').select('total_won').eq('id', w.system_player_id).maybeSingle();
            if (sp) {
              await supabase.from('system_players').update({
                total_won: Number(sp.total_won || 0) + finalPrize
              }).eq('id', w.system_player_id);
            }
          } catch {}
        }

        // If winner was a Waiter Player backed by the Agent Balance:
        // Credit the entire Derash pot to the Agent's main_balance!
        if ((w as any).is_waiter && (w as any).waiter_agent_id) {
          try {
            const { data: agentUser } = await supabase
              .from('users')
              .select('id, main_balance')
              .eq('id', (w as any).waiter_agent_id)
              .maybeSingle();

            if (agentUser) {
              const creditedBal = Number(agentUser.main_balance || 0) + finalPrize;
              await supabase.from('users').update({ main_balance: creditedBal }).eq('id', agentUser.id);
              console.log(`💰 Waiter Player Won: Agent ${agentUser.id} credited +${finalPrize} ETB (Derash pot) to main_balance!`);
            }
          } catch (agentCreditErr) {
            console.error('Error crediting agent balance for waiter win:', agentCreditErr);
          }
        }

        console.log(`🤖 ${(w as any).is_waiter ? 'Waiter Player' : 'System Bot'} "${w.first_name}" won Game #${formatGameId(gameId)}: ${finalPrize} ETB on Cartela #${w.cartela_number}`);
      } else {
        // Real user won: award full derash to wallet
        const { data: u } = await supabase.from('users')
          .select('main_balance, total_wins')
          .eq('telegram_id', w.telegram_id)
          .single();
        if (u) {
          await supabase.from('users').update({
            main_balance: Number(u.main_balance) + finalPrize,
            total_wins:   Number(u.total_wins) + 1,
          }).eq('telegram_id', w.telegram_id);
        }

        const msg = isEarlyCall 
          ? `🚀 EARLY CALL BINGO (${called.length} calls)! You won ${finalPrize} ETB on Cartela #${w.cartela_number}!`
          : `🎉 BINGO! You won ${finalPrize} ETB on Cartela #${w.cartela_number}!`;
        await notify(w.telegram_id, msg);
        console.log(`🏆 Real Player "${w.first_name}" won Game #${formatGameId(gameId)}: ${finalPrize} ETB (Risk: -${roomOwnerRiskAmount} ETB)`);
      }

      // Commission: ONLY taken from real players if real unique players >= 3 (above 2 players)
      await this.awardAgentCommission(roomId, realCartelasCount, stake, gameId, realUniqueCount);
      await this.incrementRoomGames(roomId);
      systemPlayerService.cleanupGame(gameId);
      systemPlayerService.recordGameFinished(roomId, Number(stake));
      this.gameLastCallTime.delete(gameId);
    this.gamePlayersCache.delete(gameId);
      this.gamePlayersCache.delete(gameId);
      this.scheduleFinishedGameCleanup(gameId);

      if (roomId) {
        await this.createGame(roomId, stake);
      }
      return;
    }

    // ── CASE 2: 2 to 4 winners — split prize equally ─────────────────────────
    if (winners.length >= 2 && winners.length <= 4) {
      const splitPrize = Math.floor(prize / winners.length);
      const w1 = winners[0];
      const winnerNames = winners.map(w => w.first_name).join(' & ');
      const winnerTelegramIds = winners.map(w => w.telegram_id).join(',');

      let totalRoomOwnerRisk = 0;
      const isOfficialHdaseRoom2 = roomId === 'd7c9114a-e112-426f-8f9b-13c00050279c';
      for (const w of winners) {
        if (!w.is_system && systemPlayersCount >= 1 && roomId && !isOfficialHdaseRoom2) {
          try {
            const { data: roomData } = await supabase.from('rooms').select('room_name, agent_id, system_players_risk_percent').eq('id', roomId).maybeSingle();
            const isPlatformRoom = roomData?.agent_id === '5b3ac1f4-6a29-4929-9fc4-5043c0118572' || roomData?.room_name === 'HDASE BINGO';
            if (roomData?.agent_id && !isPlatformRoom) {
              const riskPercent = Number(roomData.system_players_risk_percent ?? 25);
              const riskShare = Math.round(((splitPrize * riskPercent) / 100) * 100) / 100;
              totalRoomOwnerRisk += riskShare;

              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomData.agent_id);
              const agentQuery = isUuid
                ? supabase.from('users').select('id, main_balance').eq('id', roomData.agent_id)
                : supabase.from('users').select('id, main_balance').eq('telegram_id', roomData.agent_id);

              const { data: agentUser } = await agentQuery.maybeSingle();
              if (agentUser) {
                const newBal = Math.max(0, Number(agentUser.main_balance || 0) - riskShare);
                await supabase.from('users').update({ main_balance: newBal }).eq('id', agentUser.id);
              }
            }
          } catch {}
        }
      }

      const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
        status:             'finished',
        called_numbers:     called,
        prize_pool:         prize,
        winner_telegram_id: winnerTelegramIds,
        winner_first_name:  winnerNames,
        winner_cartela:     w1.cartela_number,
        winner_prize:       splitPrize,
        room_owner_risk_amount: totalRoomOwnerRisk,
        real_players_count: realUniqueCount,
        system_players_count: systemPlayersCount,
        waiter_players_count: waiterPlayersCount,
        finished_at:        new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).eq('id', gameId).eq('status', 'calling').select('id');

      if (claimErr || !claim || claim.length === 0) return;

      for (const w of winners) {
        if (w.is_system) {
          if (w.system_player_id) {
            try {
              const { data: sp } = await supabase.from('system_players').select('total_won').eq('id', w.system_player_id).maybeSingle();
              if (sp) {
                await supabase.from('system_players').update({
                  total_won: Number(sp.total_won || 0) + splitPrize
                }).eq('id', w.system_player_id);
              }
            } catch {}
          }

          // If waiter bot tied: credit split prize to the Agent's main_balance!
          if ((w as any).is_waiter && (w as any).waiter_agent_id) {
            try {
              const { data: agentUser } = await supabase
                .from('users')
                .select('id, main_balance')
                .eq('id', (w as any).waiter_agent_id)
                .maybeSingle();

              if (agentUser) {
                const creditedBal = Number(agentUser.main_balance || 0) + splitPrize;
                await supabase.from('users').update({ main_balance: creditedBal }).eq('id', agentUser.id);
                console.log(`💰 Waiter Player Split Won: Agent ${agentUser.id} credited +${splitPrize} ETB to main_balance!`);
              }
            } catch (agentCreditErr) {
              console.error('Error crediting agent balance for waiter split win:', agentCreditErr);
            }
          }
        } else {
          const { data: u } = await supabase.from('users')
            .select('main_balance, total_wins')
            .eq('telegram_id', w.telegram_id)
            .single();
          if (u) {
            await supabase.from('users').update({
              main_balance: Number(u.main_balance) + splitPrize,
              total_wins:   Number(u.total_wins) + 1,
            }).eq('telegram_id', w.telegram_id);
          }
          await notify(
            w.telegram_id,
            `🎉 BINGO! You tied with ${winners.length - 1} other player(s)! You each won ${splitPrize} ETB on Cartela #${w.cartela_number}!`
          );
        }
      }

      console.log(`🤝 Game #${formatGameId(gameId)}: ${winners.length}-way tie — ${winnerNames} — ${splitPrize} ETB each`);
      await this.awardAgentCommission(roomId, realCartelasCount, stake, gameId, realUniqueCount);
      await this.incrementRoomGames(roomId);
      systemPlayerService.cleanupGame(gameId);
      systemPlayerService.recordGameFinished(roomId, Number(stake));
      this.gameLastCallTime.delete(gameId);
      this.gamePlayersCache.delete(gameId);
      this.scheduleFinishedGameCleanup(gameId);

      if (roomId) {
        await this.createGame(roomId, stake);
      }
      return;
    }

    // ── CASE 3: 5 or more winners — REMATCH ──────────────────────────────────
    console.log(`🔄 Game #${formatGameId(gameId)}: ${winners.length}-way tie (5+ players) — triggering REMATCH`);

    const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
      status:            'finished',
      winner_first_name: 'REMATCH',
      winner_prize:      0,
      winner_cartela:    null,
      room_owner_risk_amount: 0,
      real_players_count: realUniqueCount,
      system_players_count: systemPlayersCount,
      finished_at:       new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }).eq('id', gameId).eq('status', 'calling').select('id');

    if (claimErr || !claim || claim.length === 0) return;

    // Refund only real players
    for (const p of realPlayers) {
      const { data: u } = await supabase.from('users')
        .select('main_balance')
        .eq('telegram_id', p.telegram_id)
        .single();
      if (u) {
        await supabase.from('users').update({
          main_balance: Number(u.main_balance) + Number(stake),
        }).eq('telegram_id', p.telegram_id);
      }
      await notify(
        p.telegram_id,
        `🔄 REMATCH! ${winners.length} players hit BINGO at the same time on Game #${formatGameId(gameId)}. Your ${stake} ETB stake has been refunded.`
      );
    }

    await this.incrementRoomGames(roomId);
    systemPlayerService.cleanupGame(gameId);
    systemPlayerService.recordGameFinished(roomId, Number(stake));
    this.gameLastCallTime.delete(gameId);
    this.gamePlayersCache.delete(gameId);
    this.scheduleFinishedGameCleanup(gameId);

    if (roomId) {
      await this.createGame(roomId, stake);
    }
    } catch (err) {
      console.error(`❌ Error in checkWinners for Game #${formatGameId(gameId)}:`, err);
    }
  }

  private async incrementRoomGames(roomId?: string) {
    if (!roomId) return;
    try {
      const { data: room } = await supabase.from('rooms').select('total_games').eq('id', roomId).maybeSingle();
      if (room) {
        await supabase.from('rooms').update({
          total_games: Number(room.total_games || 0) + 1,
          updated_at: new Date().toISOString()
        }).eq('id', roomId);
      }
    } catch (e) {
      console.error('Failed to increment room total_games', e);
    }
  }

  private async awardAgentCommission(
    roomId: string | undefined | null,
    realCartelas: number,
    stake: number,
    gameId: string,
    realUniquePlayers: number
  ) {
    if (!roomId || realCartelas <= 0 || stake <= 0) return;
    // Commission ONLY applies when real unique players >= 3 (above 2 real players)!
    // If real unique players < 3 (0, 1, or 2 real players), 0% commission is taken!
    if (realUniquePlayers < 3) {
      console.log(`ℹ️ Room Commission skipped: Game #${formatGameId(gameId)} had ${realUniquePlayers} real players (< 3 real players = 0% agent commission)`);
      return;
    }

    try {
      const { data: room, error: rErr } = await supabase
        .from('rooms')
        .select('id, agent_id, commission_rate, promoter_id, promoter_commission_rate, room_name')
        .eq('id', roomId)
        .maybeSingle();

      if (rErr || !room) return;

      const realPot = realCartelas * stake;

      // 1. Award Agent Commission
      if (room.agent_id) {
        const commRate = Number(room.commission_rate ?? 10);
        if (commRate > 0) {
          const commAmount = Number(((realPot * commRate) / 100).toFixed(2));
          if (commAmount > 0) {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room.agent_id);
            const agentQuery = isUuid
              ? supabase.from('users').select('id, telegram_id, main_balance, first_name').eq('id', room.agent_id)
              : supabase.from('users').select('id, telegram_id, main_balance, first_name').eq('telegram_id', room.agent_id);

            const { data: agentUser } = await agentQuery.maybeSingle();
            if (agentUser) {
              await supabase.from('users').update({
                main_balance: Number(agentUser.main_balance || 0) + commAmount,
              }).eq('id', agentUser.id);

              console.log(`💼 Room Commission: Agent ${agentUser.first_name} credited +${commAmount} ETB (${commRate}% from real pot ${realPot} ETB) for Game #${formatGameId(gameId)} in "${room.room_name}"`);
            }
          }
        }
      }

      // 2. Award Promoter Commission
      if (room.promoter_id) {
        const promRate = Number((room as any).promoter_commission_rate ?? 3);
        if (promRate > 0) {
          const promAmount = Number(((realPot * promRate) / 100).toFixed(2));
          if (promAmount > 0) {
            const isUuidP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room.promoter_id);
            const promQuery = isUuidP
              ? supabase.from('users').select('id, telegram_id, main_balance, first_name').eq('id', room.promoter_id)
              : supabase.from('users').select('id, telegram_id, main_balance, first_name').eq('telegram_id', room.promoter_id);

            const { data: promUser } = await promQuery.maybeSingle();
            if (promUser) {
              await supabase.from('users').update({
                main_balance: Number(promUser.main_balance || 0) + promAmount,
              }).eq('id', promUser.id);

              console.log(`🚀 Promoter Commission: Promoter ${promUser.first_name} credited +${promAmount} ETB (${promRate}% from real pot ${realPot} ETB) for Game #${formatGameId(gameId)} in "${room.room_name}"`);
            }
          }
        }
      }
    } catch (e) {
      console.error('Error awarding room commissions:', e);
    }
  }

  async handleManualClaim(
    gameId: string,
    telegramId: string,
    cartelaNumber: number,
    markedNumbers?: number[],
  ): Promise<{ success: boolean; winner?: string; prize?: number; error?: string }> {
    const { data: game } = await supabase
      .from('bingo_games')
      .select('*')
      .eq('id', gameId)
      .eq('status', 'calling')
      .maybeSingle();

    if (!game) {
      return { success: false, error: 'Game is no longer active or already finished' };
    }

    const { data: player } = await supabase
      .from('bingo_players')
      .select('id, telegram_id, cartela_number, card_matrix, first_name, is_system')
      .eq('game_id', gameId)
      .eq('telegram_id', telegramId)
      .eq('cartela_number', cartelaNumber)
      .maybeSingle();

    if (!player) {
      return { success: false, error: 'Cartela not found or not owned by you' };
    }

    const matrix = player.card_matrix as number[][];
    const called = (game.called_numbers || []).map(Number);

    // 1. Verify mathematically that the card fulfills Bingo with the called balls
    const isBingo = checkBingo(matrix, called);
    if (!isBingo) {
      return { success: false, error: 'False Bingo claim! No completed winning pattern found.' };
    }

    // 2. If marked numbers provided, verify that marked numbers contain the winning pattern
    if (Array.isArray(markedNumbers)) {
      const isMarkedValid = checkBingo(matrix, markedNumbers.map(Number));
      if (!isMarkedValid) {
        return { success: false, error: 'Please mark all called winning numbers on your card first!' };
      }
    }

    // 3. Atomically claim the game as finished
    const prize = Number(game.prize_pool || 0);
    const stake = Number(game.stake || 5);
    const cfg = await getSettings();
    let finalPrize = prize;
    let isEarlyCall = false;

    if (cfg.early_call_8_enabled && called.length <= 8) {
      const rewards8 = cfg.early_call_8_rewards as Record<string, number>;
      const rew = rewards8[String(stake)] || rewards8[stake.toString()];
      if (rew) {
        finalPrize = Number(rew);
        isEarlyCall = true;
      }
    } else if (cfg.early_call_10_enabled && called.length <= 10) {
      const rewards10 = cfg.early_call_10_rewards as Record<string, number>;
      const rew = rewards10[String(stake)] || rewards10[stake.toString()];
      if (rew) {
        finalPrize = Number(rew);
        isEarlyCall = true;
      }
    }

    // Fetch all players to evaluate real vs system counts & room owner risk
    const { data: allPlayers } = await supabase
      .from('bingo_players')
      .select('telegram_id, is_system, is_waiter')
      .eq('game_id', gameId);

    const realPlayers = (allPlayers || []).filter(p => !p.is_system);
    const realUniqueCount = new Set(realPlayers.map(p => p.telegram_id)).size;
    const realCartelasCount = realPlayers.length;

    const systemPlayers = (allPlayers || []).filter(p => p.is_system);
    const systemPlayersCount = new Set(systemPlayers.map(p => p.telegram_id)).size;

    const waiterPlayers = (allPlayers || []).filter((p: any) => p.is_waiter);
    const waiterPlayersCount = new Set(waiterPlayers.map((p: any) => p.telegram_id)).size;
    const autoBustleBotsCount = systemPlayersCount - waiterPlayersCount;

    // Room owner 25% risk logic:
    // Applies ONLY if at least one unbacked auto-bustle bot was in this game!
    // If only waiter players (backed by agent balance) were present, 0 ETB extra deduction!
    // NEVER applies to HDASE BINGO official room (never deducts admin balance)
    let roomOwnerRiskAmount = 0;
    const isOfficialHdaseManual = game.room_id === 'd7c9114a-e112-426f-8f9b-13c00050279c';
    if (autoBustleBotsCount >= 1 && game.room_id && !isOfficialHdaseManual) {
      try {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('room_name, agent_id, system_players_risk_percent')
          .eq('id', game.room_id)
          .maybeSingle();

        const isPlatformRoom = roomData?.agent_id === '5b3ac1f4-6a29-4929-9fc4-5043c0118572' || roomData?.room_name === 'HDASE BINGO';
        if (roomData && roomData.agent_id && !isPlatformRoom) {
          const riskPercent = Number(roomData.system_players_risk_percent ?? 25);
          roomOwnerRiskAmount = Math.round(((finalPrize * riskPercent) / 100) * 100) / 100;

          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomData.agent_id);
          const agentQuery = isUuid
            ? supabase.from('users').select('id, main_balance').eq('id', roomData.agent_id)
            : supabase.from('users').select('id, main_balance').eq('telegram_id', roomData.agent_id);

          const { data: agentUser } = await agentQuery.maybeSingle();
          if (agentUser) {
            const newBal = Math.max(0, Number(agentUser.main_balance || 0) - roomOwnerRiskAmount);
            await supabase.from('users').update({ main_balance: newBal }).eq('id', agentUser.id);
            console.log(`⚠️ Room Owner Risk: Agent ${agentUser.id} deducted -${roomOwnerRiskAmount} ETB (25% risk on ${finalPrize} ETB won by real player via manual claim with ${autoBustleBotsCount} bots)`);
          }
        }
      } catch (riskErr) {
        console.error('Error applying room owner risk in manual claim:', riskErr);
      }
    }

    const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
      status:             'finished',
      called_numbers:     called,
      prize_pool:         finalPrize,
      winner_telegram_id: player.telegram_id,
      winner_first_name:  isEarlyCall ? `🚀 EARLY BINGO: ${player.first_name}` : player.first_name,
      winner_cartela:     player.cartela_number,
      winner_prize:       finalPrize,
      room_owner_risk_amount: roomOwnerRiskAmount,
      real_players_count: realUniqueCount,
      system_players_count: systemPlayersCount,
      waiter_players_count: waiterPlayersCount,
      finished_at:        new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }).eq('id', gameId).eq('status', 'calling').select('id');

    if (claimErr || !claim || claim.length === 0) {
      return { success: false, error: 'Another player already claimed or game ended' };
    }

    // Award prize to winner
    const { data: u } = await supabase.from('users')
      .select('main_balance, total_wins')
      .eq('telegram_id', player.telegram_id)
      .single();
    if (u) {
      await supabase.from('users').update({
        main_balance: Number(u.main_balance) + finalPrize,
        total_wins:   Number(u.total_wins) + 1,
      }).eq('telegram_id', player.telegram_id);
    }

    const token = process.env.BOT_TOKEN;

    const notify = async (chatId: string, text: string) => {
      try {
        if (token && !chatId.startsWith('sys_') && !chatId.startsWith('10000000')) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
          });
        }
      } catch {}
    };
    if (token) {
      try {
        const msg = isEarlyCall
          ? `🚀 EARLY CALL BINGO (${called.length} calls)! You won ${finalPrize} ETB on Cartela #${player.cartela_number}!`
          : `🎉 BINGO! You won ${finalPrize} ETB on Cartela #${player.cartela_number}!`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: player.telegram_id, text: msg }),
        });
      } catch {}
    }

    console.log(`🏆 Manual BINGO Claim: Game #${formatGameId(gameId)} won by ${player.first_name} — ${finalPrize} ETB (Risk: -${roomOwnerRiskAmount} ETB)`);
    await this.awardAgentCommission(game.room_id, realCartelasCount, stake, gameId, realUniqueCount);
    await this.incrementRoomGames(game.room_id);
    systemPlayerService.cleanupGame(gameId);
    systemPlayerService.recordGameFinished(game.room_id, Number(stake));
    this.gameLastCallTime.delete(gameId);
    this.gamePlayersCache.delete(gameId);
    this.scheduleFinishedGameCleanup(gameId);

    if (game.room_id) {
      await this.createGame(game.room_id, stake);
    }

    return {
      success: true,
      winner: player.first_name,
      prize: finalPrize,
    };
  }

  /**
   * Schedule automatic permanent deletion of a finished game after a 5-minute (300s) grace window.
   * Gives players time to enjoy the celebration popup & view the winning cartela,
   * then completely removes the game row and all bulky player JSON cartela matrices.
   */
  private scheduleFinishedGameCleanup(gameId: string, delayMs: number = 300000) {
    if (!gameId) return;
    setTimeout(async () => {
      try {
        // Delete players first so it never fails even if ON DELETE CASCADE is missing
        await supabase.from('bingo_players').delete().eq('game_id', gameId);
        const { error } = await supabase.from('bingo_games').delete().eq('id', gameId);
        if (!error) {
          console.log(`🧹 [Auto-Cleanup] Purged finished game #${formatGameId(gameId)} and all player cartelas from database.`);
        }
      } catch (err) {
        console.warn(`[Auto-Cleanup] Failed to delete game #${formatGameId(gameId)}:`, err);
      }
    }, delayMs);
  }

  /**
   * Periodic sweep: removes any finished games older than maxAgeSeconds (default 300s / 5 minutes).
   * Catches any games left behind after server restarts or network anomalies.
   */
  public async purgeStaleFinishedGames(maxAgeSeconds: number = 300) {
    try {
      const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
      const { data: finishedGames, error: fetchErr } = await supabase
        .from('bingo_games')
        .select('id')
        .eq('status', 'finished')
        .or(`finished_at.lt.${cutoff},finished_at.is.null,updated_at.lt.${cutoff}`)
        .limit(200);

      if (!fetchErr && finishedGames && finishedGames.length > 0) {
        const ids = finishedGames.map(g => g.id);
        // Clean up players first to guarantee zero foreign-key constraint violations
        await supabase.from('bingo_players').delete().in('game_id', ids);
        const { data: deleted } = await supabase.from('bingo_games').delete().in('id', ids).select('id');
        if (deleted && deleted.length > 0) {
          console.log(`🧹 [Database Cleaner] Purged ${deleted.length} finished game(s) and all player cartelas.`);
        }
      }
    } catch (err) {
      console.warn('[Database Cleaner] Error purging old games:', err);
    }
  }
}

export const engine = new BingoEngine();
