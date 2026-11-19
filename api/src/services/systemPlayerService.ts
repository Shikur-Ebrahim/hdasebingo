import { supabase } from './supabase';
import { generateBingoCard, getFixedCartelaMatrix } from './BingoEngine';
import { invalidatePoolsCache } from '../routes/bingo';

// Default stake target ranges: all 4 stakes ON by default when System Players are activated
export const DEFAULT_STAKE_CONFIGS = {
  stake_1: { min: 4, max: 15, enabled: true },
  stake_2: { min: 3, max: 9, enabled: true },
  stake_3: { min: 2, max: 5, enabled: true },
  stake_4: { min: 2, max: 4, enabled: true },
};

// Default Waiter Player configs: all stakes default OFF, 1-2 bots each, 1 cartela each (backed by Agent Balance)
export const DEFAULT_WAITER_STAKE_CONFIGS = {
  stake_1: { enabled: false, min: 1, max: 2 },
  stake_2: { enabled: false, min: 1, max: 2 },
  stake_3: { enabled: false, min: 1, max: 2 },
  stake_4: { enabled: false, min: 1, max: 2 },
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

export const SYSTEM_PLAYER_STARTING_TELEGRAM_ID = 10000000000n;

export class SystemPlayerService {
  private botTelegramIdCache = new Map<string, string>();

  /**
   * Determine the next available global system player telegram_id
   */
  async getNextSystemTelegramId(): Promise<bigint> {
    try {
      const { data, error } = await supabase
        .from('system_players')
        .select('telegram_id')
        .not('telegram_id', 'is', null)
        .order('telegram_id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data && data.telegram_id) {
        try {
          const num = BigInt(data.telegram_id.replace(/\D/g, ''));
          if (num >= SYSTEM_PLAYER_STARTING_TELEGRAM_ID) {
            return num + 1n;
          }
        } catch {}
      }
    } catch {}

    // Check cached in-memory IDs
    let maxCached = SYSTEM_PLAYER_STARTING_TELEGRAM_ID - 1n;
    for (const tid of this.botTelegramIdCache.values()) {
      try {
        const num = BigInt(tid.replace(/\D/g, ''));
        if (num > maxCached) maxCached = num;
      } catch {}
    }

    return maxCached >= SYSTEM_PLAYER_STARTING_TELEGRAM_ID ? maxCached + 1n : SYSTEM_PLAYER_STARTING_TELEGRAM_ID;
  }

  /**
   * Get sequential telegram_id for a bot:
   * 1. Check in-memory cache
   * 2. If missing, compute sequential fallback
   */
  getBotTelegramId(botId: string, roomId?: string): string {
    if (this.botTelegramIdCache.has(botId)) {
      return this.botTelegramIdCache.get(botId)!;
    }
    const fallbackId = String(SYSTEM_PLAYER_STARTING_TELEGRAM_ID + BigInt(this.botTelegramIdCache.size));
    this.botTelegramIdCache.set(botId, fallbackId);
    return fallbackId;
  }

  setBotTelegramId(botId: string, tid: string) {
    this.botTelegramIdCache.set(botId, tid);
  }

  /**
   * Register bots with sequential telegram_ids starting from 10000000000
   */
  registerRoomBots(roomId: string, bots: { id: string; telegram_id?: string | null }[]) {
    let maxExisting = SYSTEM_PLAYER_STARTING_TELEGRAM_ID - 1n;
    for (const b of bots) {
      if (b.telegram_id) {
        this.botTelegramIdCache.set(b.id, b.telegram_id);
        try {
          const num = BigInt(b.telegram_id.replace(/\D/g, ''));
          if (num > maxExisting) maxExisting = num;
        } catch {}
      }
    }

    let nextSeq = maxExisting >= SYSTEM_PLAYER_STARTING_TELEGRAM_ID ? maxExisting + 1n : SYSTEM_PLAYER_STARTING_TELEGRAM_ID;
    for (const b of bots) {
      if (!this.botTelegramIdCache.has(b.id)) {
        const tid = String(nextSeq);
        this.botTelegramIdCache.set(b.id, tid);
        nextSeq += 1n;
      }
    }
  }

  /**
   * Automatically backfills telegram_id on system_players table in batches if column exists
   */
  async backfillSystemPlayersTelegramId(): Promise<void> {
    try {
      const { data: allBots, error } = await supabase
        .from('system_players')
        .select('id, room_id, created_at')
        .order('created_at', { ascending: true });

      if (error || !allBots || allBots.length === 0) return;

      const roomMap = new Map<string, typeof allBots>();
      for (const b of allBots) {
        const list = roomMap.get(b.room_id) || [];
        list.push(b);
        roomMap.set(b.room_id, list);
      }

      let currentSeq = SYSTEM_PLAYER_STARTING_TELEGRAM_ID;
      for (const [, bots] of roomMap.entries()) {
        for (const b of bots) {
          const tid = String(currentSeq);
          this.botTelegramIdCache.set(b.id, tid);
          currentSeq += 1n;
        }
      }

      console.log(`🤖 Cached sequential telegram_ids (10000000000..) for ${allBots.length} system players across ${roomMap.size} room(s)`);

      // Try updating database rows if telegram_id column exists
      for (const b of allBots.slice(0, 10)) {
        const tid = this.botTelegramIdCache.get(b.id);
        const { error: testErr } = await supabase.from('system_players').update({ telegram_id: tid }).eq('id', b.id);
        if (testErr) {
          if (testErr.code === '42703') {
            // Column does not exist yet on DB schema
            return;
          }
          break;
        }
      }

      // Update in chunks
      for (let i = 0; i < allBots.length; i += 50) {
        const chunk = allBots.slice(i, i + 50);
        await Promise.all(chunk.map(b => 
          supabase.from('system_players').update({ telegram_id: this.botTelegramIdCache.get(b.id) }).eq('id', b.id)
        ));
      }
      console.log(`✅ Backfilled sequential telegram_id on ${allBots.length} system_players in database!`);
    } catch (e) {
      console.warn('System player telegram_id backfill notice:', e);
    }
  }

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

      const startTelegramId = await this.getNextSystemTelegramId();

      const batchSize = 100;
      let inserted = 0;
      for (let i = 0; i < namesToInsert.length; i += batchSize) {
        const batch = namesToInsert.slice(i, i + batchSize).map((name, idx) => ({
          room_id: roomId,
          first_name: name,
          telegram_id: String(startTelegramId + BigInt(existingCount + i + idx)),
          total_won: 0,
        }));

        let { error: insErr } = await supabase.from('system_players').insert(batch);
        if (insErr) {
          if (insErr.code === '42703') {
            // Column telegram_id does not exist yet: insert without it
            const fallback = batch.map(({ telegram_id, ...r }) => r);
            const { error: fbErr } = await supabase.from('system_players').insert(fallback);
            if (fbErr) {
              if (fbErr.code === 'PGRST205') break;
              console.error(`Batch insert error for system_players in room ${roomId}:`, fbErr);
              break;
            }
          } else if (insErr.code === 'PGRST205') {
            break; // Table not yet created
          } else {
            console.error(`Batch insert error for system_players in room ${roomId}:`, insErr);
            break;
          }
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
   * Guaranteed 100% unique names and sequential telegram_ids starting from 10000000000.
   */
  async reseedSystemPlayersPool(roomId: string, targetCount = 1000): Promise<number> {
    try {
      // Clear old bot names for this room
      await supabase.from('system_players').delete().eq('room_id', roomId);

      const allNames = generateStylizedSystemNames(targetCount);
      const startTelegramId = await this.getNextSystemTelegramId();

      const batchSize = 100;
      let inserted = 0;
      for (let i = 0; i < allNames.length; i += batchSize) {
        const batch = allNames.slice(i, i + batchSize).map((name, idx) => ({
          room_id: roomId,
          first_name: name,
          telegram_id: String(startTelegramId + BigInt(i + idx)),
          total_won: 0,
        }));

        let { error: insErr } = await supabase.from('system_players').insert(batch);
        if (insErr) {
          if (insErr.code === '42703') {
            const fallback = batch.map(({ telegram_id, ...r }) => r);
            const { error: fbErr } = await supabase.from('system_players').insert(fallback);
            if (fbErr) break;
          } else {
            console.error(`Batch insert error during reseed for room ${roomId}:`, insErr);
            break;
          }
        }
        inserted += batch.length;
      }

      console.log(`🤖 Reseeded ${inserted} fresh unique stylized system players for room ${roomId} (starting Telegram ID: ${startTelegramId})`);
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
    // HDASE BINGO official platform room (ID d7c9114a-e112-426f-8f9b-13c00050279c or agent 5b3ac1f4-6a29-4929-9fc4-5043c0118572)
    // is platform owned: always active, never needs pro upgrade or monthly renewal!
    if (
      room.id === 'd7c9114a-e112-426f-8f9b-13c00050279c' ||
      room.room_name === 'HDASE BINGO' ||
      room.agent_id === '5b3ac1f4-6a29-4929-9fc4-5043c0118572'
    ) {
      return true;
    }
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
    const rawStart = (scheduleStart || '00:00').trim();
    const rawEnd = (scheduleEnd || '24:00').trim();

    const start = rawStart || '00:00';
    const end = rawEnd || '24:00';

    // 24/7 Always Active check:
    // If start is 00:00 and end is 24:00, 23:59, 00:00, or start === end -> 24 Hours non-stop
    if (
      (start === '00:00' && (end === '24:00' || end === '23:59' || end === '00:00')) ||
      (start === '24:00' && end === '24:00') ||
      start === end ||
      !scheduleStart ||
      !scheduleEnd
    ) {
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
   * Clear cached targets so updated min/max settings take effect immediately
   */
  invalidateRoomGameTargets(roomId?: string): void {
    gameBotTargets.clear();
  }

  /**
   * Get target number of bots for this game:
   * 1st stake: 4-15 (default ON)
   * 2nd stake: 3-9  (default ON)
   * 3rd stake: 2-5  (default OFF - Waiter Mode: 2-4 bots)
   * 4th stake: 2-4  (default OFF - Waiter Mode: 2-4 bots)
   *
   * Advanced Schedule Transitions:
   * - Ramp-Up (Start Time): starts quietly at 2 players even if min is higher, ramping up smoothly to min/max
   * - Ramp-Down (End Time): gradually reduces below min, scaling down to 2 players before close
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

    // Advanced Ramp Schedule transitions (Start time ramp-up & End time ramp-down)
    if (rampInfo && !rampInfo.is24h) {
      if (rampInfo.isRampingDown) {
        // Approaching schedule end: smoothly reduce below min, scaling down to 2 players!
        if (rampInfo.remainingMinutes <= 5) {
          // Final 5 minutes before close: exactly 2 players
          target = 2;
        } else if (rampInfo.remainingMinutes <= 15) {
          // 15 to 5 mins: between 2 and 3 players (below min even if min is high)
          target = Math.min(min, Math.floor(Math.random() * 2) + 2); // 2 or 3
        } else {
          // 30 to 15 mins: scale down towards 2-3 players
          const factor = Math.max(0, (rampInfo.remainingMinutes - 15) / 15); // 0 to 1
          const rampedTarget = Math.round(2 + (min - 2) * factor * 0.7);
          target = Math.max(2, Math.min(max, rampedTarget));
        }
      } else if (rampInfo.isRampingUp) {
        // Schedule start reached: start quietly from 2 players and ramp up to min/max!
        if (rampInfo.elapsedMinutes <= 5) {
          // First 5 minutes: start with 2 players
          target = 2;
        } else if (rampInfo.elapsedMinutes <= 15) {
          // 5 to 15 minutes: start ramping from 2 towards min
          const factor = (rampInfo.elapsedMinutes - 5) / 10;
          const rampedTarget = Math.round(2 + (min - 2) * factor * 0.5);
          target = Math.max(2, Math.min(min, rampedTarget));
        } else {
          // 15 to 30 minutes: reaching min and opening up towards max
          const factor = (rampInfo.elapsedMinutes - 15) / 15;
          const rampedTarget = Math.round(min + (max - min) * factor * 0.5);
          target = Math.max(2, Math.min(max, rampedTarget));
        }
      }
    }

    gameBotTargets.set(game.id, target);
    return target;
  }

  /**
   * Distribution of cartelas:
   * Normal bots: 90% -> 1 cartela, 8% -> 2 cartelas, 2% -> 3 cartelas
   * Waiter bots (Fixed platform standard): 95% -> 1 cartela, 4% -> 2 cartelas, 1% -> 3 cartelas
   */
  decideCartelaCount(isWaiterMode = false): number {
    const r = Math.random() * 100;
    if (isWaiterMode) {
      if (r < 95) return 1;
      if (r < 99) return 2; // 95% to 99% (4%)
      return 3;             // 99% to 100% (1%)
    }
    if (r < 90) return 1;
    if (r < 98) return 2;
    return 3;
  }

  /**
   * Gradual step-by-step bot joining during the 30-second waiting period.
   * Called on every tick of BingoEngine for waiting games.
   */
  async tickWaitingGame(game: any, room: any, cfg: any): Promise<void> {
    if (!room) return;
    if (!this.isRoomProActive(room)) return;

    // Resolve schedule ramp & active window (UTC+3 East Africa Time)
    const ramp = this.getScheduleRampInfo(room.system_players_schedule_start, room.system_players_schedule_end);

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
      enabled: true,
    };

    const defaultEnabled = true;
    const isStakeEnabled = tierConfig.enabled !== undefined ? Boolean(tierConfig.enabled) : defaultEnabled;

    // Check if normal Auto-Bustle is eligible:
    // Room owner must have system_players_enabled = true, schedule must be active, and this specific stake must be enabled.
    const isAutoBustleActive = Boolean(room.system_players_enabled) && ramp.isActive && isStakeEnabled;

    // Check Waiter Player configuration for this room:
    const waiterConfigs = room.waiter_players_stake_configs || DEFAULT_WAITER_STAKE_CONFIGS;
    const waiterTierConfig = waiterConfigs[tier] || DEFAULT_WAITER_STAKE_CONFIGS[tier as keyof typeof DEFAULT_WAITER_STAKE_CONFIGS] || {
      enabled: false,
      min: 1,
      max: 2,
    };
    const isWaiterActiveForStake = Boolean(waiterTierConfig.enabled) && (room.waiter_players_enabled !== false);

    // If neither Auto-Bustle nor Waiter Player is active for this stake:
    if (!isAutoBustleActive && !isWaiterActiveForStake) {
      // Check if there are orphaned bots with 0 real players that should be cleaned immediately
      const { data: currentPlayers } = await supabase
        .from('bingo_players')
        .select('id, is_system')
        .eq('game_id', game.id);

      const players = currentPlayers || [];
      const realPlayers = players.filter(p => !p.is_system);
      const botPlayers = players.filter(p => p.is_system);

      if (realPlayers.length === 0 && botPlayers.length > 0) {
        await supabase
          .from('bingo_players')
          .delete()
          .eq('game_id', game.id)
          .eq('is_system', true);

        await supabase
          .from('bingo_games')
          .update({
            total_players: 0,
            prize_pool: 0,
            start_at: new Date(Date.now() + 365 * 86400000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id);

        invalidatePoolsCache();
      }
      return;
    }

    const startTime = new Date(game.start_at).getTime();
    const now = Date.now();

    // Fetch current players in this game
    const { data: currentPlayers, error: pErr } = await supabase
      .from('bingo_players')
      .select('id, telegram_id, is_system, is_waiter, cartela_number, system_player_id')
      .eq('game_id', game.id);

    if (pErr) return;

    const players = currentPlayers || [];
    const initialRealPlayers = players.filter(p => !p.is_system);
    const initialRealUnique = new Set(initialRealPlayers.map(p => p.telegram_id)).size;

    // If game start_at is in the far future (no player had joined yet):
    if (startTime > now + 86400000) {
      // If Auto-Bustle is NOT active: DO NOT KICKSTART!
      // (Waiter bots only join after a real human buys a cartela, they never kickstart empty far-future tables)
      if (!isAutoBustleActive) return;

      // Auto-Bustle active: kickstart 30-second waiting countdown to keep table bustling
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

    // Determine active mode for this tick:
    let isWaiterMode = false;
    if (isAutoBustleActive) {
      isWaiterMode = false;
    } else if (isWaiterActiveForStake) {
      // Waiter mode: only joins after at least 1 real player has bought a cartela!
      if (initialRealUnique === 0) return;
      // Waiter bots wait 10 seconds before joining (remainingSec <= 20s):
      if (remainingSec > 20) return;
      isWaiterMode = true;
    } else {
      return;
    }

    // Throttle joins: join at natural intervals (every 2.5 to 4 seconds)
    const lastJoin = gameLastBotJoinTime.get(game.id) || 0;
    const timeSinceLastJoin = now - lastJoin;
    if (timeSinceLastJoin < 2500) return;

    // Check how many bots should join this game
    let targetBots = 0;
    if (isWaiterMode) {
      const minW = Math.max(1, Number(waiterTierConfig.min || 1));
      const maxW = Math.max(minW, Number(waiterTierConfig.max || 2));
      const cached = gameBotTargets.get(game.id);
      if (cached) {
        targetBots = cached;
      } else {
        targetBots = Math.floor(Math.random() * (maxW - minW + 1)) + minW;
        gameBotTargets.set(game.id, targetBots);
      }
    } else {
      targetBots = this.getTargetBotsForGame(game, room, false, tierConfig, ramp);
    }

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
    let poolBots: any[] | null = null;
    const { data: botsWithTid, error: poolErr } = await supabase
      .from('system_players')
      .select('id, first_name, telegram_id')
      .eq('room_id', room.id)
      .limit(1000);

    if (poolErr && poolErr.code === '42703') {
      const { data: fallbackBots } = await supabase
        .from('system_players')
        .select('id, first_name')
        .eq('room_id', room.id)
        .limit(1000);
      poolBots = fallbackBots;
    } else {
      poolBots = botsWithTid;
    }

    if (!poolBots || poolBots.length === 0) {
      // Pool empty? Auto-seed the 1,000 pool in the background!
      this.seedSystemPlayersPool(room.id, 1000).catch(console.error);
      return;
    }

    this.registerRoomBots(room.id, poolBots);

    const availableBots = poolBots.filter(b => !existingSystemPlayerIds.has(b.id));
    if (availableBots.length === 0) return;

    const chosenBot = availableBots[Math.floor(Math.random() * availableBots.length)];

    // Waiter Player selects exactly 1 cartela by default; Auto-Bustle uses normal distribution
    const cartelaCount = isWaiterMode ? 1 : this.decideCartelaCount(false);

    // If Waiter Mode: verify Agent has sufficient main_balance to back this bot
    let agentUserId: string | null = null;
    const stakeAmt = Number(game.stake || 5);
    const totalBotCost = stakeAmt * cartelaCount;
    const isOfficialHdaseRoom =
      room.id === 'd7c9114a-e112-426f-8f9b-13c00050279c' ||
      room.room_name === 'HDASE BINGO' ||
      room.agent_id === '5b3ac1f4-6a29-4929-9fc4-5043c0118572';

    if (isWaiterMode) {
      if (!isOfficialHdaseRoom) {
        if (!room.agent_id) return;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room.agent_id);
        const agentQuery = isUuid
          ? supabase.from('users').select('id, main_balance').eq('id', room.agent_id)
          : supabase.from('users').select('id, main_balance').eq('telegram_id', room.agent_id);

        const { data: agentUser } = await agentQuery.maybeSingle();
        if (!agentUser) {
          console.warn(`[Waiter Player] Agent ${room.agent_id} not found.`);
          return;
        }

        const agentBal = Number(agentUser.main_balance || 0);
        if (agentBal < totalBotCost) {
          console.warn(`[Waiter Player] Agent ${agentUser.id} balance insufficient (${agentBal} < ${totalBotCost} ETB). Waiter bot paused.`);
          return;
        }
        agentUserId = agentUser.id;

        // Deduct stake from agent's main_balance
        const newBal = Math.max(0, agentBal - totalBotCost);
        const { error: balErr } = await supabase.from('users').update({ main_balance: newBal }).eq('id', agentUserId);
        if (balErr) {
          console.error('[Waiter Player] Failed to deduct agent balance:', balErr);
          return;
        }
        console.log(`💳 [Waiter Player Joined] Agent ${agentUserId} balance deducted -${totalBotCost} ETB (${agentBal} -> ${newBal} ETB) for bot "${chosenBot.first_name}"`);
      } else {
        // HDASE BINGO official platform room: waiter bots are platform-managed, never touch admin balance!
        agentUserId = null;
      }
    }

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
    const botTelegramId = (chosenBot as any).telegram_id || this.getBotTelegramId(chosenBot.id, room.id);

    const botRows = chosenSeats.map(seat => ({
      game_id: game.id,
      telegram_id: botTelegramId,
      first_name: chosenBot.first_name,
      cartela_number: seat,
      card_matrix: getFixedCartelaMatrix(seat),
      is_system: true,
      is_waiter: isWaiterMode,
      waiter_agent_id: isOfficialHdaseRoom ? null : agentUserId,
      waiter_stake_deducted: isOfficialHdaseRoom ? 0 : (isWaiterMode ? stakeAmt : 0),
      system_player_id: chosenBot.id,
      bonus_used: 0,
      main_used: isOfficialHdaseRoom ? 0 : (isWaiterMode ? stakeAmt : 0),
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
      .select('telegram_id, is_system, is_waiter, cartela_number')
      .eq('game_id', game.id);

    const allP = updatedPlayers || [];
    const totalCartelas = allP.length;

    const realPlayers = allP.filter(p => !p.is_system);
    const realUnique = new Set(realPlayers.map(p => p.telegram_id)).size;
    const realCartelas = realPlayers.length;

    const systemPlayers = allP.filter(p => p.is_system);
    const systemUnique = new Set(systemPlayers.map(p => p.telegram_id)).size;

    const waiterPlayers = allP.filter((p: any) => p.is_waiter);
    const waiterUnique = new Set(waiterPlayers.map((p: any) => p.telegram_id)).size;

    const totalUnique = realUnique + systemUnique;

    // Derash (Prize Pool): If 2 players, 100% (0% commission). If 3+ players, prize_percent (default 80%)
    const rawPot = totalCartelas * stakeAmt;
    const prizePercent = totalUnique >= 3 ? Number(cfg.prize_percent || 80) : 100;
    const prizePool = Math.floor((rawPot * prizePercent) / 100);

    await supabase.from('bingo_games').update({
      prize_pool: prizePool,
      total_players: totalUnique,
      real_players_count: realUnique,
      system_players_count: systemUnique,
      waiter_players_count: waiterUnique,
      updated_at: new Date().toISOString(),
    }).eq('id', game.id);

    console.log(`🤖 Bot "${chosenBot.first_name}" (${isWaiterMode ? 'WAITER [Agent Backed]' : 'AUTO-BUSTLE'}) bought ${chosenSeats.length} cartela(s) [${chosenSeats.join(',')}] on Game #${game.id.slice(0, 8)} | Stake: ${stakeAmt} | Derash: ${prizePool} ETB | Players: ${realUnique} Real + ${systemUnique} Bots (${waiterUnique} waiter)`);
  }

  /**
   * Clean up any orphaned system players in waiting games when bots are disabled
   * either globally for the room or for specific stakes.
   */
  async cleanDisabledWaitingGames(roomId: string): Promise<void> {
    try {
      const { data: room, error: rErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (rErr || !room) return;

      const scheduleStart = room.system_players_schedule_start || '00:00';
      const scheduleEnd = room.system_players_schedule_end || '24:00';
      const ramp = this.getScheduleRampInfo(scheduleStart, scheduleEnd);

      const roomStakes: number[] = Array.isArray(room.stakes) && room.stakes.length === 4
        ? room.stakes.map(Number)
        : [5, 10, 20, 35];

      const configs = room.system_players_stake_configs || DEFAULT_STAKE_CONFIGS;
      const waiterConfigs = room.waiter_players_stake_configs || DEFAULT_WAITER_STAKE_CONFIGS;

      // Fetch all waiting games for this room
      const { data: waitingGames, error: gErr } = await supabase
        .from('bingo_games')
        .select('id, stake, total_players, prize_pool')
        .eq('room_id', roomId)
        .eq('status', 'waiting');

      if (gErr || !waitingGames || waitingGames.length === 0) return;

      for (const game of waitingGames) {
        const stakeIndex = roomStakes.indexOf(Number(game.stake));
        const tier = stakeIndex >= 0 ? `stake_${stakeIndex + 1}` : 'stake_1';

        const tierConfig = configs[tier] || DEFAULT_STAKE_CONFIGS[tier as keyof typeof DEFAULT_STAKE_CONFIGS] || { enabled: true };
        const isStakeEnabled = tierConfig.enabled !== undefined ? Boolean(tierConfig.enabled) : true;
        const isAutoBustleActive = Boolean(room.system_players_enabled) && ramp.isActive && isStakeEnabled;

        const waiterTierConfig = waiterConfigs[tier] || DEFAULT_WAITER_STAKE_CONFIGS[tier as keyof typeof DEFAULT_WAITER_STAKE_CONFIGS] || { enabled: false };
        const isWaiterActiveForStake = Boolean(waiterTierConfig.enabled) && (room.waiter_players_enabled !== false);

        // If neither Auto-Bustle nor Waiter is active for this stake:
        if (!isAutoBustleActive && !isWaiterActiveForStake) {
          const { data: players } = await supabase
            .from('bingo_players')
            .select('id, is_system')
            .eq('game_id', game.id);

          const realCount = (players || []).filter(p => !p.is_system).length;
          const botCount = (players || []).filter(p => p.is_system).length;

          // If there are bots and 0 real players, purge bots and reset game immediately
          if (realCount === 0 && botCount > 0) {
            await supabase
              .from('bingo_players')
              .delete()
              .eq('game_id', game.id)
              .eq('is_system', true);

            await supabase
              .from('bingo_games')
              .update({
                total_players: 0,
                prize_pool: 0,
                start_at: new Date(Date.now() + 365 * 86400000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', game.id);
          }
        }
      }

      invalidatePoolsCache();
    } catch (e) {
      console.error('Error in cleanDisabledWaitingGames:', e);
    }
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
