import { supabase } from './supabase';
import { generateBingoCard } from './BingoEngine';

// Default stake target ranges: 1st & 2nd stakes ON, 3rd & 4th stakes default OFF (Waiter Player Mode)
export const DEFAULT_STAKE_CONFIGS = {
  stake_1: { min: 4, max: 15, enabled: true },
  stake_2: { min: 3, max: 9, enabled: true },
  stake_3: { min: 2, max: 5, enabled: false }, // Default OFF: Waiter Mode (2-4 bots join only if real player joins)
  stake_4: { min: 2, max: 4, enabled: false }, // Default OFF: Waiter Mode (2-4 bots join only if real player joins)
};

// Modern authentic player handles pool (featuring @, $, %, ., emojis, gaming tags, and non-repeated Ethiopian nicknames)
const BOT_ROOTS = [
  'miki', 'dani', 'alex', 'robel', 'natty', 'sami', 'yoni', 'teddy', 'bini', 'abdu',
  'kaleb', 'dagi', 'aman', 'fasil', 'henok', 'ermias', 'nahom', 'brook', 'dawit', 'biruk',
  'beti', 'hanna', 'sara', 'marta', 'tsion', 'liyu', 'helen', 'eden', 'ruth', 'feven',
  'blen', 'genet', 'sosina', 'kalki', 'mimi', 'tigist', 'hiwi', 'mahlet', 'saron', 'ruta',
  'hermela', 'nardos', 'meron', 'rediet', 'haset', 'lensa', 'bontu', 'hawine', 'chaltu', 'biftu',
  'zeineb', 'rahwa', 'weyni', 'selam', 'abebe', 'kebede', 'almaz', 'chala', 'yared', 'abel',
  'eyob', 'kibrom', 'bereket', 'surafel', 'tamirat', 'mikiyas', 'tewodros', 'desta', 'haile', 'girma',
  'muluken', 'tesfaye', 'getachew', 'ashenafi', 'tadesse', 'kassahun', 'fikadu', 'mulugeta', 'worku', 'dereje',
  'negash', 'endale', 'amanuel', 'fisseha', 'senay', 'bisrat', 'eskinder', 'tilahun', 'tariku', 'elias',
  'tedros', 'nebiyu', 'dagim', 'samson', 'temesgen', 'zelalem', 'zelek', 'belay', 'belete', 'yonas'
];

const BOT_TAGS = ['pro', 'win', 'king', 'queen', 'star', 'lucky', 'boss', 'gold', 'cash', 'vip', 'fast', 'top', 'tiger', 'lion', 'speed', 'addis', 'ethio', 'habesha', 'bingo', 'money'];
const BOT_EMOJIS = ['💎', '⚡', '🔥', '👑', '✨', '⭐', '🎯', '🚀', '🦁', '🏆', '💰', '🍀', '🌟', '💫', '🦅', '🎲', '💥', '🤍', '🌹', '🕊️', '💸', '🧨', '🥇', '🔮', '🎮'];
const BOT_NUMS = ['01', '07', '10', '11', '21', '24', '77', '88', '99', '100', '777', '007', '1', '2', '3', '7', '9'];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generate 1,000 completely unique stylized system player handles
 * using characters like @, $, %, ., emojis, gaming nicknames, and numbers.
 * Zero duplicate names guaranteed.
 */
export function generateStylizedSystemNames(count = 1000): string[] {
  const set = new Set<string>();
  const list: string[] = [];

  const add = (name: string) => {
    if (!set.has(name) && list.length < count) {
      set.add(name);
      list.push(name);
    }
  };

  let cycle = 0;
  while (list.length < count && cycle < 300) {
    for (let i = 0; i < BOT_ROOTS.length && list.length < count; i++) {
      const r = BOT_ROOTS[i];
      const em = BOT_EMOJIS[(i + cycle * 3) % BOT_EMOJIS.length];
      const tag = BOT_TAGS[(i + cycle * 5) % BOT_TAGS.length];
      const num = BOT_NUMS[(i + cycle * 7) % BOT_NUMS.length];

      const pType = (i + cycle) % 25;
      let name = '';
      switch (pType) {
        case 0: name = `@${r}_${num}`; break;
        case 1: name = `${em}${cap(r)}$`; break;
        case 2: name = `${cap(r)}%${num}`; break;
        case 3: name = `@${r}.${tag}`; break;
        case 4: name = `${em}${cap(r)}${em}`; break;
        case 5: name = `${cap(r)}.x$`; break;
        case 6: name = `@${tag}_${r}`; break;
        case 7: name = `${cap(r)}.et%`; break;
        case 8: name = `${cap(r)}$$`; break;
        case 9: name = `${cap(r)}@${num}`; break;
        case 10: name = `${tag}_${cap(r)}%`; break;
        case 11: name = `${em} ${cap(r)}`; break;
        case 12: name = `${cap(r)}_${num}%`; break;
        case 13: name = `@${r}_${tag}${num}`; break;
        case 14: name = `${cap(r)}${em}$`; break;
        case 15: name = `★${cap(r)}★`; break;
        case 16: name = `${cap(r)}.pro$`; break;
        case 17: name = `🎯${cap(r)}🎯`; break;
        case 18: name = `@${r}_win${num}`; break;
        case 19: name = `${cap(r)}#${num}`; break;
        case 20: name = `${em}${r}_${num}%`; break;
        case 21: name = `@${tag}.${r}$`; break;
        case 22: name = `${cap(r)}.win%`; break;
        case 23: name = `💎${r}@${num}`; break;
        case 24: name = `${cap(r)}${num}$$`; break;
      }
      add(name);
    }
    cycle++;
  }

  return list;
}

// In-memory tracking of assigned target bot count per active game
const gameBotTargets = new Map<string, number>();

// In-memory throttle to avoid firing bot inserts faster than interval (2-3s)
const gameLastBotJoinTime = new Map<string, number>();

export class SystemPlayerService {
  /**
   * Seed / Ensure 1,000 stylized system players exist for a given room
   */
  async seedSystemPlayersPool(roomId: string, targetCount = 1000): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('system_players')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId);

      if (error && error.code !== 'PGRST205') {
        console.error(`Error checking system players count for room ${roomId}:`, error);
        return 0;
      }

      const existingCount = count || 0;
      if (existingCount >= targetCount) {
        // Check if existing pool contains old non-stylized names (e.g. "Haile L.")
        const { data: sample } = await supabase
          .from('system_players')
          .select('first_name')
          .eq('room_id', roomId)
          .limit(10);

        const hasOldStyle = sample?.some(b => /\b[A-Z]\.$/.test(b.first_name || ''));
        if (hasOldStyle) {
          console.log(`🤖 Detected old non-stylized names in room ${roomId}. Auto-refreshing to stylized handles...`);
          return await this.reseedSystemPlayersPool(roomId, targetCount);
        }
        return existingCount;
      }

      const needed = targetCount - existingCount;
      const allNames = generateStylizedSystemNames(targetCount);
      const namesToInsert = allNames.slice(existingCount, existingCount + needed);

      const batchSize = 100;
      let inserted = 0;
      for (let i = 0; i < namesToInsert.length; i += batchSize) {
        const batch = namesToInsert.slice(i, i + batchSize).map(name => ({
          room_id: roomId,
          first_name: name,
          total_won: 0,
        }));

        const { error: insErr } = await supabase.from('system_players').insert(batch);
        if (insErr) {
          if (insErr.code === 'PGRST205') break; // Table not yet created
          console.error(`Batch insert error for system_players in room ${roomId}:`, insErr);
          break;
        }
        inserted += batch.length;
      }

      console.log(`🤖 Seeded ${inserted} stylized system players for room ${roomId} (total pool: ${existingCount + inserted})`);
      return existingCount + inserted;
    } catch (e) {
      console.error(`Failed to seed system players for room ${roomId}:`, e);
      return 0;
    }
  }

  /**
   * Reseed 1,000 fresh stylized system players with creative symbols (@, $, %, emojis)
   * Guaranteed 100% unique names.
   */
  async reseedSystemPlayersPool(roomId: string, targetCount = 1000): Promise<number> {
    try {
      // Clear old bot names for this room
      await supabase.from('system_players').delete().eq('room_id', roomId);

      const allNames = generateStylizedSystemNames(targetCount);
      const batchSize = 100;
      let inserted = 0;
      for (let i = 0; i < allNames.length; i += batchSize) {
        const batch = allNames.slice(i, i + batchSize).map(name => ({
          room_id: roomId,
          first_name: name,
          total_won: 0,
        }));

        const { error: insErr } = await supabase.from('system_players').insert(batch);
        if (insErr) {
          console.error(`Batch insert error during reseed for room ${roomId}:`, insErr);
          break;
        }
        inserted += batch.length;
      }

      console.log(`🤖 Reseeded ${inserted} fresh unique stylized system players for room ${roomId}`);
      return inserted;
    } catch (e) {
      console.error(`Failed to reseed system players for room ${roomId}:`, e);
      return 0;
    }
  }

  /**
   * Check if a room has Pro Level 1 active (not expired)
   */
  isRoomProActive(room: any): boolean {
    if (!room) return false;
    const proLevel = Number(room.system_players_pro_level || 0);
    if (proLevel < 1) return false;

    if (!room.system_players_pro_expires_at) return true;
    const expiresAt = new Date(room.system_players_pro_expires_at).getTime();
    return expiresAt > Date.now();
  }

  /**
   * Get schedule ramp info for smooth realistic transition:
   * - Ramp-up (first 30m of schedule): starts at min player amount and scales up
   * - Ramp-down (last 30m of schedule): tapers down gradually to 1 and becomes 0 at end time
   * (Uses UTC+3 East Africa Time / Ethiopia)
   */
  getScheduleRampInfo(scheduleStart?: string, scheduleEnd?: string): {
    isActive: boolean;
    is24h: boolean;
    isRampingUp: boolean;
    isRampingDown: boolean;
    remainingMinutes: number;
    elapsedMinutes: number;
  } {
    const start = scheduleStart || '00:00';
    const end = scheduleEnd || '24:00';

    if (start === '00:00' && (end === '24:00' || end === '23:59')) {
      return {
        isActive: true,
        is24h: true,
        isRampingUp: false,
        isRampingDown: false,
        remainingMinutes: 1440,
        elapsedMinutes: 1440,
      };
    }

    const now = new Date();
    // UTC+3 for Ethiopian local time
    const etHour = (now.getUTCHours() + 3) % 24;
    const etMinute = now.getUTCMinutes();
    const currentMinutes = etHour * 60 + etMinute;

    const [sH, sM] = start.split(':').map(Number);
    const startMinutes = (sH || 0) * 60 + (sM || 0);

    let endMinutes = 24 * 60;
    if (end !== '24:00') {
      const [eH, eM] = end.split(':').map(Number);
      endMinutes = (eH || 0) * 60 + (eM || 0);
    }

    let isActive = false;
    let elapsedMinutes = 0;
    let remainingMinutes = 0;

    if (startMinutes <= endMinutes) {
      // Normal day window e.g. 08:00 to 22:00
      isActive = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      if (isActive) {
        elapsedMinutes = currentMinutes - startMinutes;
        remainingMinutes = endMinutes - currentMinutes;
      }
    } else {
      // Overnight window e.g. 20:00 to 04:00
      isActive = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      if (isActive) {
        if (currentMinutes >= startMinutes) {
          elapsedMinutes = currentMinutes - startMinutes;
          remainingMinutes = (24 * 60 - currentMinutes) + endMinutes;
        } else {
          elapsedMinutes = (24 * 60 - startMinutes) + currentMinutes;
          remainingMinutes = endMinutes - currentMinutes;
        }
      }
    }

    return {
      isActive,
      is24h: false,
      isRampingUp: isActive && elapsedMinutes <= 30, // First 30 mins after start
      isRampingDown: isActive && remainingMinutes <= 30, // Last 30 mins before end
      remainingMinutes,
      elapsedMinutes,
    };
  }

  /**
   * Check if the current time falls within the room's configured 24h schedule
   */
  isScheduleActive(scheduleStart?: string, scheduleEnd?: string): boolean {
    return this.getScheduleRampInfo(scheduleStart, scheduleEnd).isActive;
  }

  /**
   * Get target number of bots for this game:
   * 1st stake: 4-15 (default ON)
   * 2nd stake: 3-9  (default ON)
   * 3rd stake: 2-5  (default OFF - Waiter Mode: 2-4 bots)
   * 4th stake: 2-4  (default OFF - Waiter Mode: 2-4 bots)
   *
   * Advanced Schedule Transitions:
   * - Ramp-Up: starts from minimum player count and ramps up
   * - Ramp-Down: gradually decreases towards 1 and becomes 0 at end time
   */
  getTargetBotsForGame(
    game: any,
    room: any,
    isWaiterMode = false,
    tierConfig?: { min: number; max: number; enabled?: boolean },
    rampInfo?: { is24h: boolean; isRampingUp: boolean; isRampingDown: boolean; remainingMinutes: number; elapsedMinutes: number }
  ): number {
    if (gameBotTargets.has(game.id)) {
      return gameBotTargets.get(game.id)!;
    }

    // Waiter Mode: 2 to 4 waiter bots join
    if (isWaiterMode) {
      const target = Math.floor(Math.random() * 3) + 2; // 2, 3, or 4
      gameBotTargets.set(game.id, target);
      return target;
    }

    const min = Math.max(1, Number(tierConfig?.min ?? 2));
    const max = Math.max(min, Number(tierConfig?.max ?? 5));

    let target = Math.floor(Math.random() * (max - min + 1)) + min;

    // Advanced Ramp Schedule transitions
    if (rampInfo && !rampInfo.is24h) {
      if (rampInfo.isRampingDown) {
        // Approaching schedule end: gradually decrease up to 1 and become 0
        if (rampInfo.remainingMinutes <= 5) {
          target = 1; // Last 5 mins: 1 bot
        } else if (rampInfo.remainingMinutes <= 15) {
          target = Math.min(2, min); // 15 to 5 mins: max 2 bots
        } else {
          // 30 to 15 mins: scale down to min
          const factor = Math.max(0, rampInfo.remainingMinutes / 30);
          target = Math.max(min, Math.round(min + (max - min) * factor * 0.4));
        }
      } else if (rampInfo.isRampingUp) {
        // Start time reached: start from min player amount and ramp up
        const factor = Math.min(1, rampInfo.elapsedMinutes / 30);
        target = Math.min(max, Math.round(min + (max - min) * factor * 0.5));
      }
    }

    gameBotTargets.set(game.id, target);
    return target;
  }

  /**
   * Distribution of cartelas:
   * Normal bots: 90% -> 1 cartela, 8% -> 2 cartelas, 2% -> 3 cartelas
   * Waiter bots: 95% -> 1 cartela, 5% -> 2 cartelas
   */
  decideCartelaCount(isWaiterMode = false): number {
    const r = Math.random();
    if (isWaiterMode) {
      return r < 0.95 ? 1 : 2;
    }
    if (r < 0.90) return 1;
    if (r < 0.98) return 2;
    return 3;
  }

  /**
   * Gradual step-by-step bot joining during the 30-second waiting period.
   * Called on every tick of BingoEngine for waiting games.
   */
  async tickWaitingGame(game: any, room: any, cfg: any): Promise<void> {
    if (!room || !room.system_players_enabled) return;
    if (!this.isRoomProActive(room)) return;

    const ramp = this.getScheduleRampInfo(room.system_players_schedule_start, room.system_players_schedule_end);
    if (!ramp.isActive) return;

    // Resolve stake tier and whether it is enabled (3rd & 4th stakes are default OFF)
    const roomStakes: number[] = Array.isArray(room.stakes) && room.stakes.length === 4
      ? room.stakes.map(Number)
      : [5, 10, 20, 35];

    const stakeIndex = roomStakes.indexOf(Number(game.stake));
    const tier = stakeIndex >= 0 ? `stake_${stakeIndex + 1}` : 'stake_1';

    const configs = room.system_players_stake_configs || DEFAULT_STAKE_CONFIGS;
    const tierConfig = configs[tier] || DEFAULT_STAKE_CONFIGS[tier as keyof typeof DEFAULT_STAKE_CONFIGS] || {
      min: 2,
      max: 5,
      enabled: tier === 'stake_1' || tier === 'stake_2',
    };

    const defaultEnabled = (tier === 'stake_1' || tier === 'stake_2');
    const isStakeEnabled = tierConfig.enabled !== undefined ? Boolean(tierConfig.enabled) : defaultEnabled;

    const startTime = new Date(game.start_at).getTime();
    const now = Date.now();

    // Fetch current players in this game
    const { data: currentPlayers, error: pErr } = await supabase
      .from('bingo_players')
      .select('id, telegram_id, is_system, cartela_number, system_player_id')
      .eq('game_id', game.id);

    if (pErr) return;

    const players = currentPlayers || [];
    const initialRealPlayers = players.filter(p => !p.is_system);
    const initialRealUnique = new Set(initialRealPlayers.map(p => p.telegram_id)).size;

    // If game start_at is in the far future (no player had joined yet):
    if (startTime > now + 86400000) {
      // If this stake is OFF and no real players have joined: DO NOT KICKSTART!
      if (!isStakeEnabled) return;

      // Enabled stake: kickstart 30-second waiting countdown to keep table bustling
      const waitingSec = Math.min(30, cfg.waiting_period_s || 30);
      const newStartAt = new Date(now + waitingSec * 1000).toISOString();
      await supabase.from('bingo_games').update({
        start_at: newStartAt,
        updated_at: new Date().toISOString(),
      }).eq('id', game.id);
      game.start_at = newStartAt;
      console.log(`🤖 Room ${room.room_name || room.id} (Stake: ${game.stake}): System Player kickstarted 30s waiting countdown`);
      return;
    }

    const remainingSec = (startTime - now) / 1000;
    // Don't join in the final 2.5 seconds to lock the board before calling
    if (remainingSec <= 2.5 || remainingSec > 35) return;

    // Check Waiter Player logic if stake is OFF:
    let isWaiterMode = false;
    if (!isStakeEnabled) {
      // If no real players bought tickets on this disabled stake, no bots join!
      if (initialRealUnique === 0) return;

      // Real player bought ticket on disabled stake -> WAITER PLAYER MODE ACTIVATES!
      // Waiter bots wait 10 seconds before joining (remainingSec <= 20s):
      if (remainingSec > 20) return;
      isWaiterMode = true;
    }

    // Throttle joins: join at natural intervals (every 2.5 to 4 seconds)
    const lastJoin = gameLastBotJoinTime.get(game.id) || 0;
    const timeSinceLastJoin = now - lastJoin;
    if (timeSinceLastJoin < 2500) return;

    // Check how many bots should join this game
    const targetBots = this.getTargetBotsForGame(game, room, isWaiterMode, tierConfig, ramp);

    const existingSystemPlayerIds = new Set<string>();
    const takenSeats = new Set<number>();

    for (const p of players) {
      takenSeats.add(Number(p.cartela_number));
      if (p.is_system && p.system_player_id) {
        existingSystemPlayerIds.add(p.system_player_id);
      }
    }

    const currentBotCount = existingSystemPlayerIds.size;
    if (currentBotCount >= targetBots) return;

    // Smoothly distribute remaining bots over remaining seconds
    const remainingBots = targetBots - currentBotCount;
    const intervalSec = Math.max(1, remainingSec - 2.5);
    const joinProbability = Math.min(1, (remainingBots * 2.5) / intervalSec);

    if (Math.random() > joinProbability && timeSinceLastJoin < 5000) {
      return; // Wait for next tick to look natural
    }

    // Pick a random system player from the room pool who hasn't joined this game yet
    const { data: poolBots, error: poolErr } = await supabase
      .from('system_players')
      .select('id, first_name')
      .eq('room_id', room.id)
      .limit(1000);

    if (poolErr || !poolBots || poolBots.length === 0) {
      // Pool empty? Auto-seed the 1,000 pool in the background!
      this.seedSystemPlayersPool(room.id, 1000).catch(console.error);
      return;
    }

    const availableBots = poolBots.filter(b => !existingSystemPlayerIds.has(b.id));
    if (availableBots.length === 0) return;

    const chosenBot = availableBots[Math.floor(Math.random() * availableBots.length)];
    const cartelaCount = this.decideCartelaCount(isWaiterMode);

    // Find available seats (1 to 300)
    const maxSeat = Math.min(300, cfg.max_players || 300);
    const availableSeats: number[] = [];
    for (let s = 1; s <= maxSeat; s++) {
      if (!takenSeats.has(s)) {
        availableSeats.push(s);
      }
    }

    if (availableSeats.length === 0) return;

    // Pick random seats for this bot uniformly across the 1-300 board
    const chosenSeats: number[] = [];
    for (let i = 0; i < cartelaCount && availableSeats.length > 0; i++) {
      const idx = Math.floor(Math.random() * availableSeats.length);
      chosenSeats.push(availableSeats[idx]);
      availableSeats.splice(idx, 1);
    }

    // Insert cartelas for this bot
    const botRows = chosenSeats.map(seat => ({
      game_id: game.id,
      telegram_id: `sys_${chosenBot.id.replace(/-/g, '').slice(0, 10)}`,
      first_name: chosenBot.first_name,
      cartela_number: seat,
      card_matrix: generateBingoCard(),
      is_system: true,
      system_player_id: chosenBot.id,
      bonus_used: 0,
      main_used: 0,
    }));

    const { error: insErr } = await supabase.from('bingo_players').insert(botRows);
    if (insErr) {
      console.error(`Failed to insert bot cartelas:`, insErr);
      return;
    }

    gameLastBotJoinTime.set(game.id, now);

    // Recalculate game pot and player counts
    const { data: updatedPlayers } = await supabase
      .from('bingo_players')
      .select('telegram_id, is_system, cartela_number')
      .eq('game_id', game.id);

    const allP = updatedPlayers || [];
    const totalCartelas = allP.length;

    const realPlayers = allP.filter(p => !p.is_system);
    const realUnique = new Set(realPlayers.map(p => p.telegram_id)).size;
    const realCartelas = realPlayers.length;

    const systemPlayers = allP.filter(p => p.is_system);
    const systemUnique = new Set(systemPlayers.map(p => p.telegram_id)).size;

    const totalUnique = realUnique + systemUnique;
    const stakeAmt = Number(game.stake || 5);

    // Commission logic:
    // ONLY taken from REAL players if real unique >= 3
    // If real unique < 3: 0% commission!
    // Total Derash grows with every cartela (real + system)
    const rawPot = totalCartelas * stakeAmt;
    let realCommission = 0;
    if (realUnique >= 3) {
      const houseCutPercent = 100 - Number(cfg.prize_percent || 80);
      realCommission = Math.floor((realCartelas * stakeAmt * houseCutPercent) / 100);
    }

    const prizePool = Math.max(0, rawPot - realCommission);

    await supabase.from('bingo_games').update({
      prize_pool: prizePool,
      total_players: totalUnique,
      real_players_count: realUnique,
      system_players_count: systemUnique,
      updated_at: new Date().toISOString(),
    }).eq('id', game.id);

    console.log(`🤖 Bot "${chosenBot.first_name}" bought ${chosenSeats.length} cartela(s) [${chosenSeats.join(',')}] on Game #${game.id.slice(0, 8)} | Stake: ${stakeAmt} | Derash: ${prizePool} ETB | Players: ${realUnique} Real + ${systemUnique} Bots`);
  }

  /**
   * Cleanup targets when game finishes
   */
  cleanupGame(gameId: string) {
    gameBotTargets.delete(gameId);
    gameLastBotJoinTime.delete(gameId);
  }
}

export const systemPlayerService = new SystemPlayerService();
