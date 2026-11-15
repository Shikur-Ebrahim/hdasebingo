import { supabase } from './supabase';
import { generateBingoCard } from './BingoEngine';

// Default stake target ranges if not configured
export const DEFAULT_STAKE_CONFIGS = {
  stake_1: { min: 4, max: 15 },
  stake_2: { min: 3, max: 9 },
  stake_3: { min: 2, max: 5 },
  stake_4: { min: 2, max: 4 },
};

// Curated authentic Ethiopian names pool (first names + patronymic family names)
const ETHIOPIAN_FIRST_NAMES = [
  'Abebe', 'Almaz', 'Dawit', 'Tigist', 'Biruk', 'Selam', 'Chala', 'Yohannes', 'Ermias', 'Hiwot',
  'Bethlehem', 'Natnael', 'Yared', 'Meron', 'Samuel', 'Tsion', 'Nahom', 'Sara', 'Henok', 'Hana',
  'Abel', 'Eden', 'Eyob', 'Helen', 'Daniel', 'Marta', 'Fitsum', 'Rahel', 'Kibrom', 'Genet',
  'Bereket', 'Senait', 'Robel', 'Lemlem', 'Surafel', 'Mahlet', 'Tamirat', 'Eyerusalem', 'Mikiyas', 'Kalkidan',
  'Tewodros', 'Roman', 'Biniyam', 'Aster', 'Desta', 'Meseret', 'Solomon', 'Fasika', 'Haile', 'Martha',
  'Girma', 'Kidist', 'Muluken', 'Danayit', 'Tesfaye', 'Hawi', 'Getachew', 'Melat', 'Ashenafi', 'Betty',
  'Tadesse', 'Ruta', 'Kassahun', 'Sosina', 'Fikadu', 'Samrawit', 'Mulugeta', 'Saron', 'Worku', 'Feven',
  'Dereje', 'Lensa', 'Negash', 'Ruth', 'Endale', 'Hermela', 'Amanuel', 'Selamawit', 'Fisseha', 'Mekdes',
  'Yohana', 'Senay', 'Rediet', 'Beza', 'Bisrat', 'Frehiwot', 'Birhanu', 'Blen', 'Eskinder', 'Birtukan',
  'Tilahun', 'Misgana', 'Yeabsira', 'Helina', 'Tariku', 'Rahwa', 'Elias', 'Yordanos', 'Tesfalem', 'Makeda',
  'Berihun', 'Liya', 'Melaku', 'Maryam', 'Abiy', 'Nardos', 'Tedros', 'Haset', 'Nebiyu', 'Kidan',
  'Kaleb', 'Lidia', 'Dagim', 'Samra', 'Naty', 'Segen', 'Robi', 'Tsigereda', 'Yonatan', 'Weyni',
  'Samson', 'Yabsera', 'Temesgen', 'Zeineb', 'Wondwosen', 'Biftu', 'Zelalem', 'Bontu', 'Zeleke', 'Chaltu',
  'Alemayehu', 'Ayantu', 'Fanta', 'Obsi', 'Gashaw', 'Sena', 'Belay', 'Toltu', 'Belete', 'Amensisa',
  'Seyoum', 'Hawine', 'Yonas', 'Lalise', 'Brook', 'Gudina', 'Anteneh', 'Bikila', 'Fanuel', 'Derartu',
  'Minase', 'Fatuma', 'Birhane', 'Meseret', 'Hailu', 'Kenisa', 'Petros', 'Haile', 'Markos', 'Tirunesh'
];

const ETHIOPIAN_PATRONYMICS = [
  'Kebede', 'Tadesse', 'Haile', 'Girma', 'Tesfaye', 'Bekele', 'Desta', 'Solomon', 'Worku', 'Assefa',
  'Berhanu', 'Fikadu', 'Mulugeta', 'Negash', 'Abebe', 'Alemu', 'Tefera', 'Mekonnen', 'Demisse', 'Wolde',
  'Kassaye', 'Mengistu', 'Lemma', 'Araya', 'Belachew', 'Kifle', 'Tsegaye', 'Gebre', 'Admasu', 'Wondimu',
  'Ayele', 'Getachew', 'Bogale', 'Cherinet', 'Derbew', 'Engida', 'Fantaye', 'Gashaw', 'Habte', 'Jemberu'
];

export function generateEthiopianNames(count = 1000): string[] {
  const names: string[] = [];
  const set = new Set<string>();

  // 1. Single first names
  for (const fn of ETHIOPIAN_FIRST_NAMES) {
    if (!set.has(fn) && names.length < count) {
      set.add(fn);
      names.push(fn);
    }
  }

  // 2. First name + Patronymic Initial (e.g. "Abebe K.", "Tigist M.")
  for (const fn of ETHIOPIAN_FIRST_NAMES) {
    for (const ln of ETHIOPIAN_PATRONYMICS) {
      const name = `${fn} ${ln[0]}.`;
      if (!set.has(name) && names.length < count) {
        set.add(name);
        names.push(name);
      }
    }
  }

  // 3. First name + Full Patronymic (e.g. "Abebe Kebede")
  for (const fn of ETHIOPIAN_FIRST_NAMES) {
    for (const ln of ETHIOPIAN_PATRONYMICS) {
      const name = `${fn} ${ln}`;
      if (!set.has(name) && names.length < count) {
        set.add(name);
        names.push(name);
      }
    }
  }

  return names.slice(0, count);
}

// In-memory tracking of assigned target bot count per active game
const gameBotTargets = new Map<string, number>();

// In-memory throttle to avoid firing bot inserts faster than interval (2-3s)
const gameLastBotJoinTime = new Map<string, number>();

export class SystemPlayerService {
  /**
   * Seed / Ensure 1,000 system players exist for a given room
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
        return existingCount;
      }

      const needed = targetCount - existingCount;
      const allNames = generateEthiopianNames(targetCount);
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

      console.log(`🤖 Seeded ${inserted} system players for room ${roomId} (total pool: ${existingCount + inserted})`);
      return existingCount + inserted;
    } catch (e) {
      console.error(`Failed to seed system players for room ${roomId}:`, e);
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
   * Check if the current time falls within the room's configured 24h schedule
   * (Uses UTC+3 East Africa Time / Ethiopia)
   */
  isScheduleActive(scheduleStart?: string, scheduleEnd?: string): boolean {
    const start = scheduleStart || '00:00';
    const end = scheduleEnd || '24:00';

    if (start === '00:00' && (end === '24:00' || end === '23:59')) {
      return true; // 24/7 active
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

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Overnight schedule (e.g. 22:00 to 06:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  /**
   * Get target number of bots for this game based on stake index:
   * 1st stake: 4-15
   * 2nd stake: 3-9
   * 3rd stake: 2-5
   * 4th stake: 2-4
   */
  getTargetBotsForGame(game: any, room: any): number {
    if (gameBotTargets.has(game.id)) {
      return gameBotTargets.get(game.id)!;
    }

    const roomStakes: number[] = Array.isArray(room.stakes) && room.stakes.length === 4
      ? room.stakes.map(Number)
      : [5, 10, 20, 35];

    const stakeIndex = roomStakes.indexOf(Number(game.stake));
    const tier = stakeIndex >= 0 ? `stake_${stakeIndex + 1}` : 'stake_1';

    const configs = room.system_players_stake_configs || DEFAULT_STAKE_CONFIGS;
    const tierConfig = configs[tier] || DEFAULT_STAKE_CONFIGS[tier as keyof typeof DEFAULT_STAKE_CONFIGS] || { min: 2, max: 5 };

    const min = Math.max(1, Number(tierConfig.min ?? 2));
    const max = Math.max(min, Number(tierConfig.max ?? 5));

    const target = Math.floor(Math.random() * (max - min + 1)) + min;
    gameBotTargets.set(game.id, target);
    return target;
  }

  /**
   * Distribution of cartelas per system player:
   * 90% -> 1 cartela
   * 8%  -> 2 cartelas
   * 2%  -> 3 cartelas
   */
  decideCartelaCount(): number {
    const r = Math.random();
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
    if (!this.isScheduleActive(room.system_players_schedule_start, room.system_players_schedule_end)) return;

    const startTime = new Date(game.start_at).getTime();
    const now = Date.now();

    // If game start_at is in the far future (no player had joined yet),
    // kickstart the 30-second waiting countdown so bots can start joining!
    if (startTime > now + 86400000) {
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

    // Throttle joins: join at natural intervals (every 2.5 to 4 seconds)
    const lastJoin = gameLastBotJoinTime.get(game.id) || 0;
    const timeSinceLastJoin = now - lastJoin;
    if (timeSinceLastJoin < 2500) return;

    // Check how many bots should join this game
    const targetBots = this.getTargetBotsForGame(game, room);

    // Fetch current players in this game
    const { data: currentPlayers, error: pErr } = await supabase
      .from('bingo_players')
      .select('id, telegram_id, is_system, cartela_number, system_player_id')
      .eq('game_id', game.id);

    if (pErr) return;

    const players = currentPlayers || [];
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

    // Check if we should join now based on remaining time and remaining bots
    const remainingBots = targetBots - currentBotCount;
    // Probability per tick: smoothly distribute remaining bots over remaining seconds
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
      .limit(200);

    if (poolErr || !poolBots || poolBots.length === 0) {
      // Pool empty? Auto-seed the 1,000 pool in the background!
      this.seedSystemPlayersPool(room.id, 1000).catch(console.error);
      return;
    }

    const availableBots = poolBots.filter(b => !existingSystemPlayerIds.has(b.id));
    if (availableBots.length === 0) return;

    const chosenBot = availableBots[Math.floor(Math.random() * availableBots.length)];
    const cartelaCount = this.decideCartelaCount();

    // Find available seats (1 to 300)
    const maxSeat = Math.min(300, cfg.max_players || 300);
    const availableSeats: number[] = [];
    for (let s = 1; s <= maxSeat; s++) {
      if (!takenSeats.has(s)) {
        availableSeats.push(s);
      }
    }

    if (availableSeats.length === 0) return;

    // Pick random seats for this bot
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
