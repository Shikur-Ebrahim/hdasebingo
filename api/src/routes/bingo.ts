import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { generateBingoCard, checkBingo, engine } from '../services/BingoEngine';
import { getSettings } from './adminSettings';

const router = Router();

// ── GET /api/bingo/pools ── server-side unique player count (bypasses RLS) ──
router.get('/pools', validateTelegramAuth, async (req, res) => {
  const roomId = (req.query.room || req.query.roomId) as string | undefined;

  let query = supabase
    .from('bingo_games')
    .select('id, stake, prize_pool, total_players, start_at, status, room_id')
    .in('status', ['waiting', 'calling']);

  if (roomId) {
    query = query.eq('room_id', roomId);
  }

  const { data: games } = await query;

  if (!games || games.length === 0) { res.json({ pools: [] }); return; }

  const ids = games.map(g => g.id);
  const { data: rows } = await supabase
    .from('bingo_players')
    .select('game_id, telegram_id')
    .in('game_id', ids);

  // Count unique players per game
  const uniqueMap: Record<string, Set<string>> = {};
  (rows || []).forEach((r: any) => {
    if (!uniqueMap[r.game_id]) uniqueMap[r.game_id] = new Set();
    uniqueMap[r.game_id].add(r.telegram_id);
  });

  const pools = games.map(g => ({
    stake: g.stake,
    prize_pool: g.prize_pool,
    start_at: g.start_at,
    status: g.status,
    unique_players: uniqueMap[g.id]?.size || g.total_players || 0,
    room_id: g.room_id,
  }));

  res.json({ pools });
});

// ── GET /api/bingo/current ──────────────────────────────────────────────────
router.get('/current', validateTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const stake = Number(req.query.stake) || 10;
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

  if (!game) { res.json({ game: null, taken_cartelas: [], my_card: null, my_cartelas: [], max_players: 150, max_cartelas_per_user: 2 }); return; }

  const { data: rows } = await supabase
    .from('bingo_players')
    .select('cartela_number, telegram_id, card_matrix')
    .eq('game_id', game.id);

  const taken_cartelas = (rows || []).map((p: any) => Number(p.cartela_number));
  const unique_players = new Set((rows || []).map((p: any) => p.telegram_id)).size;
  
  const myRows = (rows || []).filter((p: any) => p.telegram_id === telegramId);
  const my_cartelas = myRows.map((p: any) => ({ cartela_number: p.cartela_number, card_matrix: p.card_matrix }));
  // Backward compat: my_card = first cartela
  const my_card = my_cartelas.length > 0 ? my_cartelas[0] : null;

  const cfg = await getSettings();

  // Find if a game recently finished (< 6s ago) so celebration is guaranteed to display
  let last_finished_game: any = null;
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
    if (msSince < 6000) {
      last_finished_game = recentFinished;
    }
  }

  res.json({
    game,
    last_finished_game,
    taken_cartelas,
    unique_players,
    my_card,
    my_cartelas,
    max_players: cfg.max_players,
    max_cartelas_per_user: cfg.max_cartelas_per_user
  });
});

// ── POST /api/bingo/join ────────────────────────────────────────────────────
router.post('/join', validateTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const { cartela_number, room_id, roomId, room } = req.body;
  const selectedRoomId = room_id || roomId || room;
  const seat = Number(cartela_number);
  const cfg = await getSettings();

  if (!seat || seat < 1 || seat > cfg.max_players) {
    res.status(400).json({ error: `Pick a cartela between 1 and ${cfg.max_players}` }); return;
  }

  const requestedStake = req.body.stake || 10;

  let query = supabase
    .from('bingo_games')
    .select('id, stake, status, start_at, room_id')
    .eq('status', 'waiting')
    .eq('stake', Number(requestedStake));

  if (selectedRoomId) {
    query = query.eq('room_id', selectedRoomId);
  }

  const { data: gamesData } = await query.order('created_at', { ascending: false }).limit(1);
  const game = gamesData?.[0];

  if (!game) {
    res.status(400).json({ error: 'No game accepting players for this stake right now.' }); return;
  }

  const { data: existing } = await supabase
    .from('bingo_players')
    .select('id')
    .eq('game_id', game.id)
    .eq('telegram_id', telegramId);
  const existingCount = existing?.length || 0;
  if (existingCount >= cfg.max_cartelas_per_user) {
    res.status(400).json({ error: `You can only pick ${cfg.max_cartelas_per_user} cartela${cfg.max_cartelas_per_user > 1 ? 's' : ''} per game` }); return;
  }

  const { data: user } = await supabase.from('users').select('main_balance, bonus_balance, first_name').eq('telegram_id', telegramId).single();
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  
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

  // Validate or generate card_matrix
  let card_matrix = req.body.card_matrix;
  if (!card_matrix || !Array.isArray(card_matrix) || card_matrix.length !== 5) {
    card_matrix = generateBingoCard();
  } else {
    // Basic validation to prevent obvious cheating
    let valid = true;
    const zones = [[1,15],[16,30],[31,45],[46,60],[61,75]];
    for (let c=0; c<5; c++) {
      const [lo, hi] = zones[c];
      const seen = new Set();
      for (let r=0; r<5; r++) {
        if (c===2 && r===2) continue; // Free space
        const val = card_matrix[r][c];
        if (typeof val !== 'number' || val < lo || val > hi || seen.has(val)) valid = false;
        seen.add(val);
      }
    }
    if (!valid) card_matrix = generateBingoCard();
    card_matrix[2][2] = 0; // Ensure free space
  }

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
    await supabase.from('users').update({ main_balance: mainBal, bonus_balance: bonusBal }).eq('telegram_id', telegramId);
    res.status(400).json({ error: `Insert error: ${insertErr.message}` }); return;
  }

  const { data: pRows } = await supabase.from('bingo_players').select('telegram_id').eq('game_id', game.id);
  const unique_players = new Set((pRows || []).map((r: any) => r.telegram_id)).size;
  const total_cartelas = pRows?.length ?? 1;

  // Derash = total cartelas × stake (pot grows per cartela bought)
  // Commission only applies when unique players >= 3
  const rawPool = total_cartelas * stakeAmt;
  const prizePool = unique_players < 3
    ? rawPool
    : Math.floor(rawPool * cfg.prize_percent / 100);

  let newStartAt = game.start_at;
  // Trigger countdown from settings waiting_period_s when first player joins
  if (new Date(game.start_at).getTime() > Date.now() + 86400000) {
    newStartAt = new Date(Date.now() + Math.min(30, cfg.waiting_period_s || 30) * 1000).toISOString();
  }

  await supabase.from('bingo_games').update({
    prize_pool: prizePool,
    total_players: unique_players,
    start_at: newStartAt,
    updated_at: new Date().toISOString()
  }).eq('id', game.id);

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
export default router;
