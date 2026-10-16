import { supabase } from './supabase';
import { getSettings } from '../routes/adminSettings';

const TICK_MS = 300; // 300ms responsive tick for exact call_interval_ms execution
const STAKES  = [10, 20, 50, 100];

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

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    console.log('🎰 BingoEngine running — auto-game loop active');
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try { await this.step(); }
    catch (e) { console.error('[BingoEngine]', e); }
    finally { this.busy = false; }
  }

  private async step() {
    // 1. Fetch all active rooms
    const { data: activeRooms } = await supabase
      .from('rooms')
      .select('id')
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
      for (const stake of STAKES) {
        const key = `${room.id}_${stake}`;
        const game = gamesMap.get(key);

        if (!game) {
          await this.createGame(room.id, stake);
        } else if (game.status === 'waiting') {
          await this.handleWaiting(game);
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

  private async handleWaiting(game: any) {
    const cfg = await getSettings();
    const startTime = new Date(game.start_at).getTime();
    if (startTime > Date.now() + 86400000) return;
    if (Date.now() < startTime) return;

    const { data: pRows } = await supabase
      .from('bingo_players')
      .select('id, telegram_id, cartela_number, created_at, bonus_used, main_used')
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

    // 2+ unique players: START GAME!
    const intervalMs = Math.max(1000, Number(cfg.call_interval_ms) || 3000);
    await supabase.from('bingo_games').update({
      status: 'calling',
      called_numbers: [],
      // Start calling the first number in exactly 1 second
      updated_at: new Date(Date.now() - intervalMs + 1000).toISOString(),
    }).eq('id', game.id);
    console.log(`🎰 Game #${formatGameId(game.id)} started with ${uniquePlayers} unique players! First call in 1s.`);
  }

  private async refundAndResetGame(game: any, players: any[]) {
    const stake = Number(game.stake);
    const botToken = process.env.BOT_TOKEN;

    // Group players by telegram_id — summing bonus_used and main_used per user
    const userRefunds: Record<string, { bonusAmt: number; mainAmt: number; count: number }> = {};
    for (const p of players) {
      if (!userRefunds[p.telegram_id]) {
        userRefunds[p.telegram_id] = { bonusAmt: 0, mainAmt: 0, count: 0 };
      }
      userRefunds[p.telegram_id].bonusAmt += Number(p.bonus_used || 0);
      userRefunds[p.telegram_id].mainAmt  += Number(p.main_used  || 0);
      userRefunds[p.telegram_id].count    += 1;
    }

    // Refund each user back to the SAME wallet they originally paid from
    for (const [telegramId, { bonusAmt, mainAmt, count }] of Object.entries(userRefunds)) {
      const totalRefund = bonusAmt + mainAmt;
      const { data: u } = await supabase
        .from('users')
        .select('main_balance, bonus_balance')
        .eq('telegram_id', telegramId)
        .single();
      
      if (u) {
        const updates: any = {};
        if (bonusAmt > 0) updates.bonus_balance = Number(u.bonus_balance || 0) + bonusAmt;
        if (mainAmt  > 0) updates.main_balance  = Number(u.main_balance  || 0) + mainAmt;
        await supabase.from('users').update(updates).eq('telegram_id', telegramId);
      }

      // Build a refund description for the notification
      let refundDesc = '';
      if (bonusAmt > 0 && mainAmt > 0) {
        refundDesc = bonusAmt + ' ETB to Bonus, ' + mainAmt + ' ETB to Main Balance';
      } else if (bonusAmt > 0) {
        refundDesc = bonusAmt + ' ETB to Bonus Balance';
      } else {
        refundDesc = mainAmt + ' ETB to Main Balance';
      }

      // Notify user via Telegram bot if configured
      if (botToken) {
        try {
          await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramId,
              text: '⏳ *Bingo game canceled*\n\nBecause another player joined too late, your ' + count + '-card payment (*' + totalRefund + ' ETB*) has been refunded.\n\n✅ ' + refundDesc + '.',
              parse_mode: 'Markdown',
            }),
          });
        } catch (e) { console.error('Refund notify error:', e); }
      }
    }

    // Delete players from bingo_players
    await supabase.from('bingo_players').delete().eq('game_id', game.id);

    // Reset game state to fresh waiting (waiting for new players)
    await supabase.from('bingo_games').update({
      prize_pool: 0,
      total_players: 0,
      called_numbers: [],
      start_at: new Date(Date.now() + 86400000 * 365).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', game.id);

    console.log(`✅ Game #${formatGameId(game.id)} successfully reset and refunded.`);
  }

  private async handleCalling(game: any) {
    if (game.status !== 'calling') return;

    const cfg = await getSettings();
    const intervalMs = Math.max(1000, Number(cfg.call_interval_ms) || 3000);
    const lastUpdate = new Date(game.updated_at).getTime();
    if (Date.now() - lastUpdate < intervalMs) return;

    const called: number[] = (game.called_numbers || []).map(Number);
    const pool = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !called.includes(n));

    if (pool.length === 0) {
      await supabase.from('bingo_games').update({
        status: 'finished',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', game.id);
      if (game.room_id) {
        await this.incrementRoomGames(game.room_id);
        await this.createGame(game.room_id, game.stake);
      }
      return;
    }

    const num = pool[Math.floor(Math.random() * pool.length)];
    const newCalled = [...called, num];

    await supabase.from('bingo_games').update({
      called_numbers: newCalled,
      updated_at: new Date().toISOString(),
    }).eq('id', game.id);

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
      .select('id, telegram_id, cartela_number, card_matrix, first_name')
      .eq('game_id', gameId);

    if (!players || players.length === 0) return;

    // ── Find ALL winning cartelas ──────────────────────────────────────────────
    const winningRows = players.filter(p => checkBingo(p.card_matrix as number[][], called));
    if (winningRows.length === 0) return;

    // ── Deduplicate by telegram_id: if same user wins with 2 cartelas, pick ONE ─
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

    // ── Helper: send Telegram notification ────────────────────────────────────
    const notify = async (chatId: string, text: string) => {
      try {
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
          });
        }
      } catch { /* ignore */ }
    };

    // ── CASE 1: Single winner ──────────────────────────────────────────────────
    if (winners.length === 1) {
      const w = winners[0];
      const cfg = await getSettings();
      let finalPrize = prize;
      let isEarlyCall = false;

      // Check 8-call
      if (cfg.early_call_8_enabled && called.length <= 8) {
        const rewards8 = cfg.early_call_8_rewards as Record<string, number>;
        const rew = rewards8[String(stake)] || rewards8[stake.toString()];
        if (rew) {
          finalPrize = Number(rew);
          isEarlyCall = true;
          console.log(`🎰 8-CALL BINGO! Reward: ${finalPrize}`);
        }
      }
      // Check 10-call (only if not already an 8-call win)
      else if (cfg.early_call_10_enabled && called.length <= 10) {
        const rewards10 = cfg.early_call_10_rewards as Record<string, number>;
        const rew = rewards10[String(stake)] || rewards10[stake.toString()];
        if (rew) {
          finalPrize = Number(rew);
          isEarlyCall = true;
          console.log(`🎰 10-CALL BINGO! Reward: ${finalPrize}`);
        }
      }

      const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
        status:             'finished',
        winner_telegram_id: w.telegram_id,
        winner_first_name:  isEarlyCall ? `🚀 EARLY BINGO: ${w.first_name}` : w.first_name,
        winner_cartela:     w.cartela_number,
        winner_prize:       finalPrize,
        finished_at:        new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).eq('id', gameId).eq('status', 'calling').select('id');
      if (claimErr || !claim || claim.length === 0) return;

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
      console.log(`🏆 Game #${formatGameId(gameId)}: Single winner ${w.first_name} — ${finalPrize} ETB`);
      await this.awardAgentCommission(roomId, players.length, stake, gameId);
      await this.incrementRoomGames(roomId);
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

      const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
        status:             'finished',
        winner_telegram_id: w1.telegram_id,
        winner_first_name:  `${w1.first_name} & ${w2.first_name}`,
        winner_cartela:     w1.cartela_number,
        winner_prize:       splitPrize,
        finished_at:        new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).eq('id', gameId).eq('status', 'calling').select('id');
      if (claimErr || !claim || claim.length === 0) return;

      for (const w of winners) {
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
          `🎉 BINGO! You tied with another player! You each won ${splitPrize} ETB (prize split on Cartela #${w.cartela_number})!`
        );
      }
      console.log(`🤝 Game #${formatGameId(gameId)}: 2-way tie — ${w1.first_name} & ${w2.first_name} — ${splitPrize} ETB each`);
      await this.awardAgentCommission(roomId, players.length, stake, gameId);
      await this.incrementRoomGames(roomId);
      if (roomId) {
        await this.createGame(roomId, stake);
      }
      return;
    }

    // ── CASE 3: 3 or more winners — REMATCH ──────────────────────────────────
    console.log(`🔄 Game #${formatGameId(gameId)}: ${winners.length}-way tie — triggering REMATCH & stake refund`);

    const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
        status:            'finished',
        winner_first_name: 'REMATCH',
        winner_prize:      0,
        winner_cartela:    null,
        finished_at:       new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }).eq('id', gameId).eq('status', 'calling').select('id');
      if (claimErr || !claim || claim.length === 0) return;

    // Refund ALL players their stake
    for (const p of players) {
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
        `🔄 REMATCH! ${winners.length} players hit BINGO at the same time on Game #${formatGameId(gameId)}. Your ${stake} ETB stake has been refunded. A new game is starting!`
      );
    }
    await this.incrementRoomGames(roomId);
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
    totalCartelas: number,
    stake: number,
    gameId: string
  ) {
    if (!roomId || totalCartelas <= 0 || stake <= 0) return;
    try {
      const { data: room, error: rErr } = await supabase
        .from('rooms')
        .select('id, agent_id, commission_rate, room_name')
        .eq('id', roomId)
        .maybeSingle();

      if (rErr || !room || !room.agent_id) return;

      // Default commission is 8%
      const commRate = Number(room.commission_rate ?? 8);
      if (commRate <= 0) return;

      const totalPot = totalCartelas * stake;
      const commAmount = Number(((totalPot * commRate) / 100).toFixed(2));
      if (commAmount <= 0) return;

      const { data: agentUser } = await supabase
        .from('users')
        .select('main_balance')
        .eq('telegram_id', room.agent_id)
        .maybeSingle();

      if (agentUser) {
        await supabase.from('users').update({
          main_balance: Number(agentUser.main_balance || 0) + commAmount,
        }).eq('telegram_id', room.agent_id);

        console.log(`💼 Room Commission: Agent ${room.agent_id} credited +${commAmount} ETB (${commRate}%) for Game #${formatGameId(gameId)} in "${room.room_name}"`);

        const token = process.env.BOT_TOKEN;
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: room.agent_id,
              text: `💼 *Room Commission Earned!*\n\n🏠 Room: *${room.room_name}*\n💰 Amount: *+${commAmount} ETB* (${commRate}% commission)\n🎮 Game: #${formatGameId(gameId)} (${totalCartelas} cartelas @ ${stake} ETB)\n\n✅ Credited directly to your Main Balance!`,
              parse_mode: 'Markdown',
            }),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('Error awarding agent room commission:', e);
    }
  }
}

export const engine = new BingoEngine();


