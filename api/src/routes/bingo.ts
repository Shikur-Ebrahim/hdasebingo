import { Router } from 'express';
import { AuthRequest, validateTelegramAuth, optionalTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { generateBingoCard, getFixedCartelaMatrix, checkBingo, engine } from '../services/BingoEngine';
import { systemPlayerService } from '../services/systemPlayerService';
import { getSettings } from './adminSettings';

const router = Router();

// In-memory cache for fast, sub-millisecond responses to frequent polling
let poolsCache: { [key: string]: { time: number; pools: any[] } } = {};

export function invalidatePoolsCache() {
  poolsCache = {};
}

// User-level async mutex to prevent concurrent financial / cartela race conditions
const userMutexes = new Map<string, Promise<void>>();

async function runWithUserLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const currentLock = userMutexes.get(userId) || Promise.resolve();
  let releaseLock!: () => void;
  const newLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  userMutexes.set(userId, currentLock.then(() => newLock, () => newLock));

  await currentLock;
  try {
    return await task();
  } finally {
    releaseLock();
    if (userMutexes.get(userId) === newLock) {
      userMutexes.delete(userId);
    }
  }
}

// ── GET /api/bingo/pools ── server-side unique player count (public, bypasses RLS) ──
router.get('/pools', async (req, res) => {
  const roomId = (req.query.room || req.query.roomId) as string | undefined;
  const cacheKey = roomId || '__all__';
  const now = Date.now();

  // Return cached result if under 400ms old to handle high-frequency polling with ultra-low latency
  if (poolsCache[cacheKey] && (now - poolsCache[cacheKey].time) < 400) {
    res.json({ pools: poolsCache[cacheKey].pools });
    return;
  }

  let query = supabase
    .from('bingo_games')
    .select('id, stake, prize_pool, total_players, start_at, status, room_id, created_at')
    .in('status', ['waiting', 'calling'])
    .order('created_at', { ascending: false });

  if (roomId) {
    query = query.eq('room_id', roomId);
  }

  const { data: games } = await query;

  if (!games || games.length === 0) {
    poolsCache[cacheKey] = { time: now, pools: [] };
    res.json({ pools: [] });
    return;
  }

  // Deduplicate by stake: keep the primary active game per stake
  // Priority: 'calling' game wins over 'waiting' game; otherwise newer created_at wins
  const stakeMap = new Map<number, any>();
  for (const g of games) {
    const s = Number(g.stake);
    if (!stakeMap.has(s)) {
      stakeMap.set(s, g);
    } else {
      const existing = stakeMap.get(s);
      if (existing.status !== 'calling' && g.status === 'calling') {
        stakeMap.set(s, g);
      } else if (existing.status === 'waiting' && g.status === 'waiting') {
        if ((Number(g.total_players) || 0) > (Number(existing.total_players) || 0)) {
          stakeMap.set(s, g);
        }
      }
    }
  }

  const activeGames = Array.from(stakeMap.values());
  const ids = activeGames.map(g => g.id);

  const { data: rows } = await supabase
    .from('bingo_players')
    .select('game_id, telegram_id')
    .in('game_id', ids);

  // Count unique players & total cartelas per game
  const uniqueMap: Record<string, Set<string>> = {};
  const cartelaMap: Record<string, number> = {};
  (rows || []).forEach((r: any) => {
    if (!uniqueMap[r.game_id]) uniqueMap[r.game_id] = new Set();
    uniqueMap[r.game_id].add(r.telegram_id);
    cartelaMap[r.game_id] = (cartelaMap[r.game_id] || 0) + 1;
  });

  const pools = activeGames.map(g => {
    const uCount = uniqueMap[g.id]?.size || Number(g.total_players || 0);
    const cCount = cartelaMap[g.id] || uCount;
    const stakeAmt = Number(g.stake);
    const prizePercent = uCount >= 3 ? 80 : 100;
    const computedDerash = Math.floor((cCount * stakeAmt * prizePercent) / 100);
    const finalDerash = Math.max(Number(g.prize_pool || 0), computedDerash);

    return {
      stake: stakeAmt,
      prize_pool: finalDerash,
      start_at: g.start_at,
      status: g.status,
      players: uCount,
      unique_players: uCount,
      cartelas: cCount,
      room_id: g.room_id,
    };
  });

  poolsCache[cacheKey] = { time: now, pools };
  res.json({ pools });
});

// ── GET /api/bingo/current ── optional auth so visitors/unregistered users can view the table
router.get('/current', optionalTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser?.id ? req.telegramUser.id.toString() : null;
  const stake = Number(req.query.stake) || 5;
  const roomId = (req.query.room || req.query.roomId) as string | undefined;

  let baseQuery = supabase
    .from('bingo_games')
    .select('*')
    .eq('stake', stake);

  if (roomId) {
    baseQuery = baseQuery.eq('room_id', roomId);
  }

  // Find the active waiting or calling game for this room & stake
  // NOTE: Celebration is triggered by realtime UPDATE on the frontend — no need to serve finished games here.
  let { data: activeGame } = await baseQuery
    .in('status', ['waiting', 'calling'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let game: any = activeGame ?? null;

  // If no active game exists yet, auto-create the next waiting game immediately
  if (!game) {
    if (roomId) {
      game = await engine.createGame(roomId, stake);
    } else {
      const start_at = new Date(Date.now() + 86400000 * 365).toISOString();
      const { data: newGame } = await supabase.from('bingo_games').insert({
        room_id: null,
        stake,
        prize_pool: 0,
        total_players: 0,
        status: 'waiting',
        called_numbers: [],
        start_at,
      }).select('*').single();
      game = newGame;
    }
  }

  if (!game) { res.json({ game: null, taken_cartelas: [], my_card: null, my_cartelas: [], max_players: 300, max_cartelas_per_user: 4 }); return; }

  const { data: rows } = await supabase
    .from('bingo_players')
    .select('cartela_number, telegram_id, card_matrix, first_name, is_system, is_waiter')
    .eq('game_id', game.id);

  const taken_cartelas = (rows || []).map((p: any) => Number(p.cartela_number));
  const unique_players = new Set((rows || []).map((p: any) => p.telegram_id)).size;
  
  const myRows = telegramId ? (rows || []).filter((p: any) => p.telegram_id === telegramId) : [];
  const my_cartelas = myRows.map((p: any) => ({ cartela_number: p.cartela_number, card_matrix: p.card_matrix }));
  // Backward compat: my_card = first cartela
  const my_card = my_cartelas.length > 0 ? my_cartelas[0] : null;

  // Build full map of cartela matrices and player details for spectator and celebration rendering
  const cartela_matrices: Record<number, number[][]> = {};
  const cartela_players: Record<number, { first_name?: string; is_system?: boolean; is_waiter?: boolean }> = {};
  for (const r of rows || []) {
    if (r.cartela_number) {
      if (r.card_matrix) cartela_matrices[r.cartela_number] = r.card_matrix;
      cartela_players[r.cartela_number] = {
        first_name: r.first_name || undefined,
        is_system: Boolean(r.is_system),
        is_waiter: Boolean(r.is_waiter),
      };
    }
  }

  const cfg = await getSettings();

  // Instantaneous live Derash & unique players recalculation
  const totalCartelas = taken_cartelas.length;
  const rawPot = totalCartelas * Number(game.stake);
  const prizePercent = unique_players >= 3 ? Number(cfg.prize_percent || 80) : 100;
  const calculatedDerash = Math.floor((rawPot * prizePercent) / 100);
  const finalDerash = Math.max(Number(game.prize_pool || 0), calculatedDerash);
  game.prize_pool = finalDerash;
  game.total_players = Math.max(Number(game.total_players || 0), unique_players);

  // Find if a game recently finished (< 15s ago) so celebration is guaranteed to display
  let last_finished_game: any = null;
  let last_finished_game_participated = false;
  let finishedQuery = supabase
    .from('bingo_games')
    .select('*')
    .eq('stake', stake)
    .eq('status', 'finished');
  if (roomId) finishedQuery = finishedQuery.eq('room_id', roomId);

  const { data: recentFinished } = await finishedQuery
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentFinished && recentFinished.finished_at) {
    const msSince = Date.now() - new Date(recentFinished.finished_at).getTime();
    if (msSince < 15000) {
      last_finished_game = recentFinished;
      if (telegramId) {
        if (recentFinished.winner_telegram_id === telegramId) {
          last_finished_game_participated = true;
        } else {
          const { data: pCheck } = await supabase.from('bingo_players')
            .select('id')
            .eq('game_id', recentFinished.id)
            .eq('telegram_id', telegramId)
            .limit(1)
            .maybeSingle();
          last_finished_game_participated = Boolean(pCheck && pCheck.id);
        }
      }
      if (recentFinished.winner_cartela) {
        const { data: wp } = await supabase.from('bingo_players')
          .select('card_matrix')
          .eq('game_id', recentFinished.id)
          .eq('cartela_number', recentFinished.winner_cartela)
          .maybeSingle();
        if (wp?.card_matrix) {
          last_finished_game.winner_matrix = wp.card_matrix;
        }
      }
    }
  }

  // Fetch live statuses of all stakes in this room (for live monitor & spectator stake switcher)
  let room_stakes: Array<{ stake: number; status: string; prize_pool: number; total_players: number }> = [];
  if (roomId) {
    const { data: activeGames } = await supabase
      .from('bingo_games')
      .select('stake, status, prize_pool, total_players, created_at')
      .eq('room_id', roomId)
      .in('status', ['waiting', 'calling'])
      .order('created_at', { ascending: false });

    if (activeGames) {
      const stakeDedup = new Map<number, any>();
      for (const g of activeGames) {
        const s = Number(g.stake);
        if (!stakeDedup.has(s)) {
          stakeDedup.set(s, g);
        } else {
          const existing = stakeDedup.get(s);
          if (existing.status !== 'calling' && g.status === 'calling') {
            stakeDedup.set(s, g);
          } else if (existing.status === 'waiting' && g.status === 'waiting') {
            if ((Number(g.total_players) || 0) > (Number(existing.total_players) || 0)) {
              stakeDedup.set(s, g);
            }
          }
        }
      }
      room_stakes = Array.from(stakeDedup.values()).map((g: any) => ({
        stake: Number(g.stake),
        status: g.status,
        prize_pool: Number(g.prize_pool || 0),
        total_players: Number(g.total_players || 0),
      }));
    }
  }

  res.json({
    game,
    last_finished_game,
    last_finished_game_participated,
    cartela_matrices,
    cartela_players,
    taken_cartelas,
    unique_players,
    my_card,
    my_cartelas,
    room_stakes,
    max_players: cfg.max_players,
    max_cartelas_per_user: cfg.max_cartelas_per_user
  });
});

// ── POST /api/bingo/join ────────────────────────────────────────────────────
router.post('/join', validateTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  return runWithUserLock(telegramId, async () => {
    const { cartela_number, room_id, roomId, room } = req.body;
    const selectedRoomId = room_id || roomId || room;
    const seat = Number(cartela_number);
    const cfg = await getSettings();

    if (!seat || seat < 1 || seat > cfg.max_players) {
      res.status(400).json({ error: `Pick a cartela between 1 and ${cfg.max_players}` }); return;
    }

    const requestedStake = req.body.stake || 5;
    const targetGameId = req.body.game_id;
    const isManual = req.body.is_manual !== undefined ? Boolean(req.body.is_manual) : true;
    engine.setPlayerMode(telegramId, targetGameId, isManual);

    let query = supabase
      .from('bingo_games')
      .select('id, stake, status, start_at, room_id')
      .eq('status', 'waiting')
      .eq('stake', Number(requestedStake));

    if (selectedRoomId) {
      query = query.eq('room_id', selectedRoomId);
    }

    // Parallel fetch: Game + User balance in ONE round trip!
    const gameQuery = targetGameId
      ? supabase.from('bingo_games').select('id, stake, status, start_at, room_id').eq('id', targetGameId).eq('status', 'waiting').maybeSingle()
      : query.order('created_at', { ascending: false }).limit(1).maybeSingle();

    const userQuery = supabase.from('users').select('main_balance, bonus_balance, first_name').eq('telegram_id', telegramId).single();

    const [gameRes, userRes] = await Promise.all([gameQuery, userQuery]);
    const game = (gameRes as any)?.data;
    const user = (userRes as any)?.data;

    if (!game) {
      res.status(400).json({ error: 'No game accepting players for this stake right now.' }); return;
    }
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // Parallel check: User cartela limit + Seat conflict in ONE round trip!
    const [existingRes, seatCheckRes] = await Promise.all([
      supabase.from('bingo_players').select('id').eq('game_id', game.id).eq('telegram_id', telegramId),
      supabase.from('bingo_players').select('id').eq('game_id', game.id).eq('cartela_number', seat).maybeSingle()
    ]);

    if (seatCheckRes.data) {
      res.status(400).json({ error: `Cartela #${seat} is already taken! Pick another.` }); return;
    }

    const existingCount = existingRes.data?.length || 0;
    if (existingCount >= cfg.max_cartelas_per_user) {
      res.status(400).json({ error: `You can only pick ${cfg.max_cartelas_per_user} cartela${cfg.max_cartelas_per_user > 1 ? 's' : ''} per game` }); return;
    }

    const stakeAmt = Number(game.stake);
    const mainBal = Number(user.main_balance || 0);
    const bonusBal = Number(user.bonus_balance || 0);
    
    if (mainBal + bonusBal < stakeAmt) {
      res.status(400).json({ error: `Insufficient balance — need ${stakeAmt} ETB` }); return;
    }

    let toDeduct = stakeAmt;
    let newBonus = bonusBal;
    let newMain = mainBal;

    // Track how much came from each wallet for accurate refund later
    let bonusUsed = 0;
    let mainUsed = 0;

    if (newBonus >= toDeduct) {
      bonusUsed = toDeduct;
      newBonus -= toDeduct;
      toDeduct = 0;
    } else {
      bonusUsed = newBonus;
      toDeduct -= newBonus;
      newBonus = 0;
      mainUsed = toDeduct;
      newMain -= toDeduct;
    }

    const { error: deductErr } = await supabase
      .from('users')
      .update({ main_balance: newMain, bonus_balance: newBonus })
      .eq('telegram_id', telegramId);

    if (deductErr) { res.status(400).json({ error: 'Payment failed — please try again' }); return; }

    // Use the canonical fixed 300-cartela matrix for this cartela number (seat)
    const card_matrix = getFixedCartelaMatrix(seat);

    const { error: insertErr } = await supabase.from('bingo_players').insert({
      game_id: game.id,
      telegram_id: telegramId,
      first_name: user.first_name || 'User',
      cartela_number: seat,
      card_matrix,
      bonus_used: bonusUsed,
      main_used: mainUsed,
    });

    if (insertErr) {
      // Safely refund only what was deducted from fresh balance (never overwrite with stale balance)
      const { data: curUser } = await supabase.from('users').select('main_balance, bonus_balance').eq('telegram_id', telegramId).single();
      if (curUser) {
        await supabase.from('users').update({
          main_balance: Number(curUser.main_balance || 0) + mainUsed,
          bonus_balance: Number(curUser.bonus_balance || 0) + bonusUsed,
        }).eq('telegram_id', telegramId);
      }
      res.status(400).json({ error: `Insert error: ${insertErr.message}` }); return;
    }

    const { data: pRows } = await supabase.from('bingo_players').select('telegram_id, is_system').eq('game_id', game.id);
    const allRows = pRows || [];
    const realRows = allRows.filter((r: any) => !r.is_system);
    const sysRows = allRows.filter((r: any) => r.is_system);

    const unique_real = new Set(realRows.map((r: any) => r.telegram_id)).size;
    const unique_sys = new Set(sysRows.map((r: any) => r.telegram_id)).size;
    const unique_players = unique_real + unique_sys;
    const total_cartelas = allRows.length;

    // Derash (Prize Pool): If 2 players, 100% (0% commission). If 3+ players, prize_percent (default 80%)
    const rawPool = total_cartelas * stakeAmt;
    const prizePercent = unique_players >= 3 ? Number(cfg.prize_percent || 80) : 100;
    const prizePool = Math.floor((rawPool * prizePercent) / 100);

    let newStartAt = game.start_at;
    // Trigger countdown from settings waiting_period_s (strictly 30s) when first player joins
    if (new Date(game.start_at).getTime() > Date.now() + 86400000) {
      newStartAt = new Date(Date.now() + Math.min(30, cfg.waiting_period_s || 30) * 1000).toISOString();
      systemPlayerService.clearFinishGrace(game.room_id, Number(game.stake));
    }

    await supabase.from('bingo_games').update({
      prize_pool: prizePool,
      total_players: unique_players,
      real_players_count: unique_real,
      system_players_count: unique_sys,
      start_at: newStartAt,
      updated_at: new Date().toISOString()
    }).eq('id', game.id);

    invalidatePoolsCache();

    res.json({
      success: true,
      cartela_number: seat,
      card_matrix,
      unique_players,
      start_at: newStartAt,
      prize_pool: prizePool,
      total_players: unique_players,
    });
  });
});

// ── POST /api/bingo/leave ────────────────────────────────────────────────────
router.post('/leave', validateTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  return runWithUserLock(telegramId, async () => {
    const { cartela_number, game_id } = req.body || {};
    const seat = Number(cartela_number);

    if (!seat || !game_id) {
      res.status(400).json({ error: 'cartela_number and game_id required' });
      return;
    }

    // Check if game is still waiting
    const { data: game } = await supabase.from('bingo_games').select('*').eq('id', game_id).maybeSingle();
    if (!game || game.status !== 'waiting') {
      res.status(400).json({ error: 'Cannot cancel cartela after game starts' });
      return;
    }

    // 1. ATOMIC DELETE FIRST: Guarantees that concurrent or spam clicks CANNOT double refund!
    const { data: deletedRows, error: delErr } = await supabase
      .from('bingo_players')
      .delete()
      .eq('game_id', game.id)
      .eq('telegram_id', telegramId)
      .eq('cartela_number', seat)
      .select('id, main_used, bonus_used, is_system');

    if (delErr) {
      res.status(500).json({ error: 'Database error cancelling cartela' });
      return;
    }

    if (!deletedRows || deletedRows.length === 0) {
      // Row was already deleted or doesn't belong to this user
      res.status(404).json({ error: 'Cartela not found or already cancelled • ካርቴላው አልተገኘም ወይም አስቀድሞ ተሰርዟል' });
      return;
    }

    const playerRow = deletedRows[0];

    // 2. Strict Capped Refund: Never refund more than the actual game stake!
    const stakeAmt = Number(game.stake || 0);
    let refundMain = Number(playerRow.main_used || 0);
    let refundBonus = Number(playerRow.bonus_used || 0);

    // Fallback for legacy records that didn't track main_used
    if (refundMain === 0 && refundBonus === 0) {
      refundMain = stakeAmt;
    }
    // Absolute ceiling cap
    if (refundMain + refundBonus > stakeAmt) {
      refundMain = Math.max(0, stakeAmt - refundBonus);
    }

    // 3. Update user balance atomically
    const { data: user } = await supabase.from('users').select('main_balance, bonus_balance').eq('telegram_id', telegramId).single();
    if (user) {
      await supabase.from('users').update({
        main_balance: Number(user.main_balance || 0) + refundMain,
        bonus_balance: Number(user.bonus_balance || 0) + refundBonus,
      }).eq('telegram_id', telegramId);
    }

    // 4. Re-calculate game pool & players
    const { data: remainingPlayers } = await supabase.from('bingo_players').select('telegram_id, is_system').eq('game_id', game.id);
    const allRem = remainingPlayers || [];
    const realRem = allRem.filter((r: any) => !r.is_system);
    const sysRem = allRem.filter((r: any) => r.is_system);

    const unique_real = new Set(realRem.map((r: any) => r.telegram_id)).size;
    const unique_sys = new Set(sysRem.map((r: any) => r.telegram_id)).size;
    const unique_players = unique_real + unique_sys;
    const total_cartelas = allRem.length;

    const cfg = await getSettings();

    const rawPool = total_cartelas * Number(game.stake);
    const prizePercent = unique_players >= 3 ? Number(cfg.prize_percent || 80) : 100;
    const prizePool = Math.floor((rawPool * prizePercent) / 100);

    // If no cartelas remaining, reset countdown
    let newStartAt = game.start_at;
    if (total_cartelas === 0) {
      newStartAt = new Date(Date.now() + 86400000 * 365).toISOString();
    }

    await supabase.from('bingo_games').update({
      prize_pool: prizePool,
      total_players: unique_players,
      real_players_count: unique_real,
      system_players_count: unique_sys,
      start_at: newStartAt,
      updated_at: new Date().toISOString()
    }).eq('id', game.id);

    invalidatePoolsCache();

    res.json({
      success: true,
      cartela_number: seat,
      unique_players,
      prize_pool: prizePool,
      start_at: newStartAt,
    });
  });
});

router.get('/card', async (req, res) => {
  const { game_id, cartela } = req.query;
  if (!game_id || !cartela) { res.json({ matrix: null }); return; }
  const cNum = Number(cartela);
  const { data } = await supabase.from('bingo_players')
    .select('card_matrix')
    .eq('game_id', String(game_id))
    .eq('cartela_number', isNaN(cNum) ? cartela : cNum)
    .maybeSingle();
  res.json({ matrix: data?.card_matrix || null });
});

router.get('/winners', async (req, res) => {
  const { game_id } = req.query;
  if (!game_id) { res.status(400).json({ error: 'game_id required' }); return; }
  const { data: game } = await supabase.from('bingo_games').select('called_numbers').eq('id', String(game_id)).maybeSingle();
  if (!game) { res.json({ winners: [] }); return; }
  
  const { data: players } = await supabase.from('bingo_players').select('first_name, cartela_number, card_matrix').eq('game_id', String(game_id));
  
  const winners = (players || []).filter(p => checkBingo(p.card_matrix as number[][], game.called_numbers));
  res.json({ winners });
});

router.get('/tts', async (req, res) => {
  try {
    const text = req.query.text;
    if (!text) { res.status(400).send('No text'); return; }
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=am&client=tw-ob&q=' + encodeURIComponent(String(text));
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!r.ok) throw new Error('TTS failed');
    const buffer = await r.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=864000');
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('[TTS Proxy Error]', e);
    res.status(500).send('Error');
  }
});
// ── POST /api/bingo/mode ── Toggle between Manual and Auto mode ───────────
router.post('/mode', validateTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const { game_id, is_manual } = req.body || {};
  const isMan = Boolean(is_manual);
  engine.setPlayerMode(telegramId, game_id, isMan);
  if (game_id) {
    try {
      await supabase
        .from('bingo_players')
        .update({ is_manual: isMan })
        .eq('game_id', game_id)
        .eq('telegram_id', telegramId);
    } catch {}
  }
  res.json({ success: true, is_manual: isMan });
});

// ── POST /api/bingo/claim ── Manual BINGO Claim ───────────────────────────
router.post('/claim', validateTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const { game_id, cartela_number, marked_numbers } = req.body || {};
  if (!game_id || !cartela_number) {
    res.status(400).json({ error: 'game_id and cartela_number are required' });
    return;
  }
  const result = await engine.handleManualClaim(
    String(game_id),
    telegramId,
    Number(cartela_number),
    Array.isArray(marked_numbers) ? marked_numbers : undefined
  );
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json({ error: result.error || 'Claim rejected' });
  }
});

export default router;
