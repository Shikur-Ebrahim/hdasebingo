import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();
router.use(validateTelegramAuth);

// GET /api/leaderboard/players?period=all|daily|weekly|monthly
router.get('/players', async (req: AuthRequest, res) => {
  const period = (req.query.period as string) || 'all';
  const telegramId = req.telegramUser!.id.toString();

  // Build date filter
  let fromDate: string | null = null;
  const now = new Date();
  if (period === 'daily') {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    fromDate = d.toISOString();
  } else if (period === 'weekly') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    fromDate = d.toISOString();
  } else if (period === 'monthly') {
    const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0);
    fromDate = d.toISOString();
  }

  let topPlayers: any[] = [];

  if (period === 'all') {
    // Use aggregated columns on users table
    const { data } = await supabase
      .from('users')
      .select('telegram_id, first_name, username, total_wins')
      .gt('total_wins', 0)
      .order('total_wins', { ascending: false })
      .limit(50);
    topPlayers = (data || []).map((u, i) => ({
      rank: i + 1,
      telegram_id: u.telegram_id,
      first_name: u.first_name || 'User',
      username: u.username || '',
      wins: u.total_wins || 0,
      games: 0,
    }));
  } else {
    // Query bingo_games for wins in the period
    let q = supabase
      .from('bingo_games')
      .select('winner_telegram_id, winner_first_name, winner_prize')
      .eq('status', 'finished')
      .not('winner_telegram_id', 'is', null);
    if (fromDate) q = q.gte('finished_at', fromDate);
    const { data: games } = await q;

    // Aggregate wins per player
    const map: Record<string, { first_name: string; wins: number; total_prize: number }> = {};
    for (const g of games || []) {
      if (!g.winner_telegram_id) continue;
      if (!map[g.winner_telegram_id]) {
        map[g.winner_telegram_id] = { first_name: g.winner_first_name || 'User', wins: 0, total_prize: 0 };
      }
      map[g.winner_telegram_id].wins++;
      map[g.winner_telegram_id].total_prize += g.winner_prize || 0;
    }
    topPlayers = Object.entries(map)
      .sort((a, b) => b[1].wins - a[1].wins)
      .slice(0, 50)
      .map(([tid, v], i) => ({
        rank: i + 1,
        telegram_id: tid,
        first_name: v.first_name,
        username: '',
        wins: v.wins,
        total_prize: v.total_prize,
      }));
  }

  // Find current user's rank
  const myRank = topPlayers.findIndex(p => p.telegram_id === telegramId) + 1;

  res.json({ players: topPlayers, my_rank: myRank || null });
});

// GET /api/leaderboard/inviters — top users by number of invited users who deposited
router.get('/inviters', async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();

  // Get all users with inviter_id set
  const { data: invited } = await supabase
    .from('users')
    .select('inviter_id')
    .not('inviter_id', 'is', null);

  // Count invites per inviter
  const countMap: Record<string, number> = {};
  for (const row of invited || []) {
    if (!row.inviter_id) continue;
    countMap[row.inviter_id] = (countMap[row.inviter_id] || 0) + 1;
  }

  if (Object.keys(countMap).length === 0) {
    res.json({ inviters: [], my_rank: null });
    return;
  }

  // Fetch names for top inviters (supporting both UUID and telegram_id)
  const topIds = Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([id]) => id);

  const topUuids = topIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const topTgIds = topIds.filter(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

  let users: any[] = [];
  if (topUuids.length > 0) {
    const { data: u1 } = await supabase.from('users').select('id, telegram_id, first_name, username').in('id', topUuids);
    if (u1) users = users.concat(u1);
  }
  if (topTgIds.length > 0) {
    const { data: u2 } = await supabase.from('users').select('id, telegram_id, first_name, username').in('telegram_id', topTgIds);
    if (u2) users = users.concat(u2);
  }

  const nameMap: Record<string, { first_name: string; username: string; telegram_id: string }> = {};
  for (const u of users || []) {
    const info = { first_name: u.first_name || 'User', username: u.username || '', telegram_id: u.telegram_id };
    if (u.id) nameMap[u.id] = info;
    if (u.telegram_id) nameMap[u.telegram_id] = info;
  }

  const inviters = topIds.map((id, i) => ({
    rank: i + 1,
    id,
    telegram_id: nameMap[id]?.telegram_id || id,
    first_name: nameMap[id]?.first_name || 'User',
    username: nameMap[id]?.username || '',
    invites: countMap[id] || 0,
  }));

  const { data: curU } = await supabase.from('users').select('id').eq('telegram_id', telegramId).maybeSingle();
  const myRank = inviters.findIndex(p => p.telegram_id === telegramId || (curU?.id && p.id === curU.id)) + 1;

  res.json({ inviters, my_rank: myRank || null });
});

export default router;
