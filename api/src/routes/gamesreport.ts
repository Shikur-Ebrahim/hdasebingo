import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();
router.use(validateTelegramAuth);

// GET /api/games-report?page=N
router.get('/', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = 20;

  // ── Step 1: Get all game_ids this user joined from bingo_players ──────────
  // bingo_players columns: game_id, telegram_id, first_name, cartela_number, card_matrix
  const { data: playerRows, error: playerErr } = await supabase
    .from('bingo_players')
    .select('game_id, cartela_number')
    .eq('telegram_id', telegramId);

  if (playerErr) {
    console.error('[games-report] bingo_players error:', playerErr.message);
  }

  const joinedGameIds = (playerRows || []).map((r: any) => r.game_id);

  // Build a cartela map: game_id -> cartela_number
  const cartelaMap: Record<string, number> = {};
  for (const r of playerRows || []) cartelaMap[r.game_id] = r.cartela_number;

  // ── Step 2: Fetch all relevant bingo_games rows ───────────────────────────
  // Include games user joined + games user won (in case bingo_players was missing)
  let allGames: any[] = [];

  if (joinedGameIds.length > 0) {
    const { data: joinedGames } = await supabase
      .from('bingo_games')
      .select('*')
      .in('id', joinedGameIds)
      .order('created_at', { ascending: false });
    allGames = joinedGames || [];
  }

  // Also pull any wins where the user is winner but may not be in bingo_players
  const { data: wonGames } = await supabase
    .from('bingo_games')
    .select('*')
    .eq('winner_telegram_id', telegramId)
    .order('created_at', { ascending: false });

  // Merge, deduplicate by id
  const seen = new Set(allGames.map((g: any) => g.id));
  for (const g of wonGames || []) {
    if (!seen.has(g.id)) { allGames.push(g); seen.add(g.id); }
  }

  // Sort by created_at descending
  allGames.sort((a: any, b: any) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  // ── Step 3: Compute stats (all time) ─────────────────────────────────────
  const finishedGames = allGames.filter((g: any) => g.status === 'finished');
  const totalWins = finishedGames.filter((g: any) => g.winner_telegram_id === telegramId).length;
  const totalWon = finishedGames
    .filter((g: any) => g.winner_telegram_id === telegramId)
    .reduce((sum: number, g: any) => sum + (Number(g.winner_prize) || 0), 0);
  const totalWagered = allGames.reduce((sum: number, g: any) => sum + (Number(g.stake) || 0), 0);
  const winRate = finishedGames.length > 0
    ? Math.round((totalWins / finishedGames.length) * 100)
    : 0;

  // ── Step 4: Paginate ──────────────────────────────────────────────────────
  const offset = (page - 1) * limit;
  const paginated = allGames.slice(offset, offset + limit);

  const enriched = paginated.map((g: any) => ({
    game_id:       g.id,
    game_number:   g.game_id || null,       // sequential number e.g. 122
    stake:         Number(g.stake) || 0,
    status:        g.status || 'unknown',
    prize_pool:    Number(g.prize_pool) || 0,
    cartela_number: cartelaMap[g.id] || null,
    created_at:    g.created_at || null,
    finished_at:   g.finished_at || null,
    start_at:      g.start_at || null,
    is_winner:     g.winner_telegram_id === telegramId,
    winner_name:   g.winner_first_name || null,
    winner_prize:  Number(g.winner_prize) || 0,
    total_calls:   Array.isArray(g.called_numbers) ? g.called_numbers.length : 0,
  }));

  res.json({
    games: enriched,
    stats: {
      total:         allGames.length,
      wins:          totalWins,
      total_wagered: totalWagered,
      total_won:     totalWon,
      win_rate:      winRate,
    },
    has_more: offset + limit < allGames.length,
    page,
  });
});

export default router;
