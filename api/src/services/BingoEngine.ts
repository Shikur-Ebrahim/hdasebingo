import { supabase } from './supabase';
import { getSettings } from '../routes/adminSettings';
import { systemPlayerService } from './systemPlayerService';

const TICK_MS = 300; // 300ms responsive tick for exact call_interval_ms execution
export const DEFAULT_ROOM_STAKES = [5, 10, 20, 35];

export function generateBingoCard(): number[][] {
  const zones: [number, number][] = [[1,15],[16,30],[31,45],[46,60],[61,75]];
  const card: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (let col = 0; col < 5; col++) {
    const [lo, hi] = zones[col];
    const chosen = new Set<number>();
    while (chosen.size < 5) chosen.add(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    const nums = Array.from(chosen);
    for (let row = 0; row < 5; row++) card[row][col] = nums[row];
  }
  card[2][2] = 0; // FREE center
  return card;
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
    // Default is manual mode (true)
    return true;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    console.log('🎰 BingoEngine running — auto-game loop active');

    // Run initial startup sweep of old finished games
    this.purgeStaleFinishedGames(60);

    // Continuous background sweep: purge any finished games older than 60s
    setInterval(() => {
      this.purgeStaleFinishedGames(60);
    }, 60000);
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
      .select('id, stakes, room_name, agent_id, commission_rate, promoter_id, promoter_commission_rate, system_players_enabled, system_players_pro_level, system_players_pro_expires_at, system_players_schedule_start, system_players_schedule_end, system_players_stake_configs, system_players_risk_percent, waiter_players_enabled, waiter_players_stake_configs')
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
    for (const g of activeGames || []) {
      const key = `${g.room_id}_${g.stake}`;
      if (!gamesMap.has(key)) {
        gamesMap.set(key, g);
      }
    }

    for (const room of rooms) {
      const roomStakes: number[] = (Array.isArray((room as any).stakes) && (room as any).stakes.length === 4)
        ? (room as any).stakes.map(Number)
        : DEFAULT_ROOM_STAKES;

      for (const stake of roomStakes) {
        const key = `${room.id}_${stake}`;
        const game = gamesMap.get(key);

        if (!game) {
          await this.createGame(room.id, stake);
        } else if (game.status === 'waiting') {
          await this.handleWaiting(game, room);
        } else if (game.status === 'calling') {
          await this.handleCalling(game);
        }
      }
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
      .select('id, telegram_id, cartela_number, created_at, bonus_used, main_used, is_system')
      .eq('game_id', game.id)
      .order('created_at', { ascending: true });
    
    const players = pRows || [];
    const uniquePlayers = new Set(players.map((r: any) => r.telegram_id)).size;

    if (uniquePlayers < cfg.min_players) {
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

      const firstJoinedTime = new Date(players[0].created_at).getTime();
      const waitingDurationSec = (Date.now() - firstJoinedTime) / 1000;
      const releaseTimeoutSec = cfg.release_time_s || 60;

      // Has the release time (default 60s) expired?
      if (waitingDurationSec >= releaseTimeoutSec) {
        console.log(`⏰ Game #${formatGameId(game.id)} (Stake: ${game.stake}): Release time reached (${Math.round(waitingDurationSec)}s >= ${releaseTimeoutSec}s). Refunding ${players.length} cartelas and releasing player.`);
        await this.refundAndResetGame(game, players);
        return;
      }

      // Still within release time: extend timer by 15s (or remaining time until releaseTimeoutSec)
      const remainingSec = Math.max(5, Math.min(15, Math.ceil(releaseTimeoutSec - waitingDurationSec)));
      await supabase.from('bingo_games').update({
        start_at: new Date(Date.now() + remainingSec * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', game.id);
      console.log(`🎰 Game #${formatGameId(game.id)} extended by ${remainingSec}s (${Math.round(waitingDurationSec)}s elapsed / ${releaseTimeoutSec}s total release limit)`);
      return;
    }

    // 2+ unique players (real or system): START GAME!
    await supabase.from('bingo_games').update({
      status: 'calling',
      called_numbers: [],
      updated_at: new Date().toISOString(),
    }).eq('id', game.id);
    console.log(`🎰 Game #${formatGameId(game.id)} started with ${uniquePlayers} unique players! First call in ~3.5s.`);
  }

  private async refundAndResetGame(game: any, players: any[]) {
    const stake = Number(game.stake);
    const botToken = process.env.BOT_TOKEN;

    // Filter only REAL players for refund
    const realPlayers = (players || []).filter(p => !p.is_system);

    // Group real players by telegram_id — summing bonus_used and main_used per user
    const userRefunds: Record<string, { bonusAmt: number; mainAmt: number; count: number }> = {};
    for (const p of realPlayers) {
      if (!userRefunds[p.telegram_id]) {
        userRefunds[p.telegram_id] = { bonusAmt: 0, mainAmt: 0, count: 0 };
      }
      userRefunds[p.telegram_id].bonusAmt += Number(p.bonus_used || 0);
      userRefunds[p.telegram_id].mainAmt  += Number(p.main_used  || 0);
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
    const waiterPlayers = (players || []).filter((p: any) => p.is_waiter && p.waiter_agent_id);
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

    // Clean up players for this game and reset status
    await supabase.from('bingo_players').delete().eq('game_id', game.id);
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
  }

  private async handleCalling(game: any) {
    const called: number[] = (game.called_numbers || []).map(Number);
    const cfg = await getSettings();

    // Check if interval has passed since last called ball
    const callIntervalMs = cfg.call_interval_ms || 3500;
    const lastCalledTime = game.last_called_at ? new Date(game.last_called_at).getTime() : 0;
    const timeSinceLastCall = Date.now() - lastCalledTime;

    if (lastCalledTime > 0 && timeSinceLastCall < callIntervalMs) {
      return;
    }

    if (called.length >= 75) {
      // All 75 numbers called — finish with no winner
      console.log(`🎰 Game #${formatGameId(game.id)} finished: all 75 numbers called with no winner.`);
      await supabase.from('bingo_games').update({
        status: 'finished',
        winner_first_name: 'No Winner',
        winner_prize: 0,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', game.id);
      systemPlayerService.cleanupGame(game.id);
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
      last_called_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', game.id).eq('status', 'calling');

    if (updErr) return;

    // Check winners after calling this number
    await this.checkWinners(game.id, newCalled, game.prize_pool, game.stake, game.room_id);
  }

  private async checkWinners(
    gameId: string,
    called: number[],
    prizePool: number,
    stake: number,
    roomId?: string,
  ) {
    const { data: players } = await supabase
      .from('bingo_players')
      .select('id, telegram_id, cartela_number, card_matrix, first_name, is_system, is_waiter, waiter_agent_id, system_player_id')
      .eq('game_id', gameId);

    if (!players || players.length === 0) return;

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

    const prize = Number(prizePool);
    const token = process.env.BOT_TOKEN;

    const notify = async (chatId: string, text: string) => {
      try {
        if (token && !chatId.startsWith('sys_')) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
          });
        }
      } catch {}
    };

    const realPlayers = players.filter(p => !p.is_system);
    const realUniqueCount = new Set(realPlayers.map(p => p.telegram_id)).size;
    const realCartelasCount = realPlayers.length;

    const systemPlayers = players.filter(p => p.is_system);
    const systemPlayersCount = new Set(systemPlayers.map(p => p.telegram_id)).size;

    const waiterPlayers = players.filter((p: any) => p.is_waiter);
    const waiterPlayersCount = new Set(waiterPlayers.map((p: any) => p.telegram_id)).size;
    const autoBustleBotsCount = systemPlayersCount - waiterPlayersCount;

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
      if (!isWinnerSystem && autoBustleBotsCount >= 1 && roomId) {
        try {
          const { data: roomData } = await supabase
            .from('rooms')
            .select('agent_id, system_players_risk_percent')
            .eq('id', roomId)
            .maybeSingle();

          if (roomData && roomData.agent_id) {
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

      // Commission: ONLY taken from real players if real unique >= 3
      await this.awardAgentCommission(roomId, realCartelasCount, stake, gameId, realUniqueCount);
      await this.incrementRoomGames(roomId);
      systemPlayerService.cleanupGame(gameId);
      this.scheduleFinishedGameCleanup(gameId);

      if (roomId) {
        await this.createGame(roomId, stake);
      }
      return;
    }

    // ── CASE 2: Exactly 2 winners — split prize ───────────────────────────────
    if (winners.length === 2) {
      const splitPrize = Math.floor(prize / 2);
      const w1 = winners[0];
      const w2 = winners[1];

      let totalRoomOwnerRisk = 0;
      for (const w of winners) {
        if (!w.is_system && systemPlayersCount >= 1 && roomId) {
          try {
            const { data: roomData } = await supabase.from('rooms').select('agent_id, system_players_risk_percent').eq('id', roomId).maybeSingle();
            if (roomData?.agent_id) {
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
        winner_telegram_id: w1.telegram_id,
        winner_first_name:  `${w1.first_name} & ${w2.first_name}`,
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
            `🎉 BINGO! You tied with another player! You each won ${splitPrize} ETB on Cartela #${w.cartela_number}!`
          );
        }
      }

      console.log(`🤝 Game #${formatGameId(gameId)}: 2-way tie — ${w1.first_name} & ${w2.first_name} — ${splitPrize} ETB each`);
      await this.awardAgentCommission(roomId, realCartelasCount, stake, gameId, realUniqueCount);
      await this.incrementRoomGames(roomId);
      systemPlayerService.cleanupGame(gameId);
      this.scheduleFinishedGameCleanup(gameId);

      if (roomId) {
        await this.createGame(roomId, stake);
      }
      return;
    }

    // ── CASE 3: 3 or more winners — REMATCH ──────────────────────────────────
    console.log(`🔄 Game #${formatGameId(gameId)}: ${winners.length}-way tie — triggering REMATCH`);

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
    this.scheduleFinishedGameCleanup(gameId);

    if (roomId) {
      await this.createGame(roomId, stake);
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
    // Commission ONLY applies to real players when real unique players >= 3!
    if (realUniquePlayers < 3) {
      console.log(`ℹ️ Room Commission skipped: Game #${formatGameId(gameId)} had ${realUniquePlayers} real players (< 3 real users = 0% platform & room commission)`);
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
        const commRate = Number(room.commission_rate ?? 7);
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
    let roomOwnerRiskAmount = 0;
    if (autoBustleBotsCount >= 1 && game.room_id) {
      try {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('agent_id, system_players_risk_percent')
          .eq('id', game.room_id)
          .maybeSingle();

        if (roomData && roomData.agent_id) {
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
   * Schedule automatic permanent deletion of a finished game after a 60-second grace window.
   * Gives players time to enjoy the celebration popup & view the winning cartela,
   * then completely removes the game row and all bulky player JSON cartela matrices via ON DELETE CASCADE.
   */
  private scheduleFinishedGameCleanup(gameId: string, delayMs: number = 60000) {
    if (!gameId) return;
    setTimeout(async () => {
      try {
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
   * Periodic sweep: removes any finished games older than maxAgeSeconds (default 60s).
   * Catches any games left behind after server restarts or network anomalies.
   */
  public async purgeStaleFinishedGames(maxAgeSeconds: number = 60) {
    try {
      const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
      const { data: deleted, error } = await supabase
        .from('bingo_games')
        .delete()
        .eq('status', 'finished')
        .lt('finished_at', cutoff)
        .select('id');

      if (deleted && deleted.length > 0) {
        console.log(`🧹 [Database Cleaner] Purged ${deleted.length} finished game(s) older than ${maxAgeSeconds}s.`);
      }
    } catch (err) {
      console.warn('[Database Cleaner] Error purging old games:', err);
    }
  }
}

export const engine = new BingoEngine();
