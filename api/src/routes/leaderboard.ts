import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();
router.use(validateTelegramAuth);

// Helper to calculate fromDate based on period in Ethiopian Time (EAT = UTC+3)
function getPeriodFromDate(period: string): string | null {
  const now = new Date();
  const eatNow = new Date(now.getTime() + 3 * 3600 * 1000);

  if (period === 'daily') {
    // Start of today in East Africa Time (00:00:00 EAT -> UTC)
    const eatMidnight = new Date(Date.UTC(eatNow.getUTCFullYear(), eatNow.getUTCMonth(), eatNow.getUTCDate(), 0, 0, 0));
    return new Date(eatMidnight.getTime() - 3 * 3600 * 1000).toISOString();
  } else if (period === 'weekly') {
    // Rolling 7 days
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d.toISOString();
  } else if (period === 'monthly') {
    // Start of current month in EAT (1st day 00:00:00 EAT -> UTC)
    const eatMonthStart = new Date(Date.UTC(eatNow.getUTCFullYear(), eatNow.getUTCMonth(), 1, 0, 0, 0));
    return new Date(eatMonthStart.getTime() - 3 * 3600 * 1000).toISOString();
  } else if (period === 'yearly') {
    // Start of current year in EAT (Jan 1 00:00:00 EAT -> UTC)
    const eatYearStart = new Date(Date.UTC(eatNow.getUTCFullYear(), 0, 1, 0, 0, 0));
    return new Date(eatYearStart.getTime() - 3 * 3600 * 1000).toISOString();
  }
  return null; // 'all'
}

// GET /api/leaderboard/players?period=all|daily|weekly|monthly|yearly
router.get('/players', async (req: AuthRequest, res) => {
  const period = (req.query.period as string) || 'all';
  const telegramId = req.telegramUser!.id.toString();

  const fromDate = getPeriodFromDate(period);
  let topPlayers: any[] = [];

  // Query finished games within period
  let q = supabase
    .from('bingo_games')
    .select('winner_telegram_id, winner_first_name, winner_prize, finished_at')
    .eq('status', 'finished')
    .not('winner_telegram_id', 'is', null);

  if (fromDate) {
    q = q.gte('finished_at', fromDate);
  }

  const { data: games, error } = await q.limit(5000);
  if (error) {
    console.error('Error fetching games for leaderboard:', error);
  }

  // Aggregate wins & total prizes per player
  const map: Record<string, { first_name: string; wins: number; total_prize: number }> = {};
  for (const g of games || []) {
    if (!g.winner_telegram_id) continue;
    if (!map[g.winner_telegram_id]) {
      map[g.winner_telegram_id] = { first_name: g.winner_first_name || 'User', wins: 0, total_prize: 0 };
    }
    map[g.winner_telegram_id].wins++;
    map[g.winner_telegram_id].total_prize += Number(g.winner_prize) || 0;
  }

  // If period is 'all', also check users table so no historical total_wins are missed
  if (period === 'all') {
    const { data: usersData } = await supabase
      .from('users')
      .select('telegram_id, first_name, username, total_wins')
      .gt('total_wins', 0);

    for (const u of usersData || []) {
      if (!map[u.telegram_id]) {
        map[u.telegram_id] = { first_name: u.first_name || 'User', wins: Number(u.total_wins) || 0, total_prize: 0 };
      } else {
        map[u.telegram_id].wins = Math.max(map[u.telegram_id].wins, Number(u.total_wins) || 0);
      }
    }
  }

  // Fetch clean profile names and usernames for all candidates
  const allTgIds = Object.keys(map);
  const userProfiles: Record<string, { first_name: string; username: string }> = {};
  if (allTgIds.length > 0) {
    const { data: profiles } = await supabase
      .from('users')
      .select('telegram_id, first_name, username')
      .in('telegram_id', allTgIds);

    for (const p of profiles || []) {
      userProfiles[p.telegram_id] = {
        first_name: p.first_name || 'User',
        username: p.username || '',
      };
    }
  }

  topPlayers = Object.entries(map)
    .sort((a, b) => b[1].wins - a[1].wins)
    .slice(0, 50)
    .map(([tid, v], i) => ({
      rank: i + 1,
      telegram_id: tid,
      first_name: userProfiles[tid]?.first_name || v.first_name.replace(/^[🚀\s]*EARLY\s+BINGO:\s*/i, ''),
      username: userProfiles[tid]?.username || '',
      wins: v.wins,
      total_prize: v.total_prize,
    }));

  // Find current user's rank
  const myRank = topPlayers.findIndex(p => p.telegram_id === telegramId) + 1;

  res.json({ players: topPlayers, my_rank: myRank || null });
});

// GET /api/leaderboard/inviters?period=all|daily|weekly|monthly|yearly
router.get('/inviters', async (req: AuthRequest, res) => {
  const period = (req.query.period as string) || 'all';
  const telegramId = req.telegramUser!.id.toString();
  const fromDate = getPeriodFromDate(period);

  // Get all users with inviter_id set
  let invQuery = supabase
    .from('users')
    .select('inviter_id, created_at')
    .not('inviter_id', 'is', null);

  if (fromDate) {
    invQuery = invQuery.gte('created_at', fromDate);
  }

  const { data: invited } = await invQuery;

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
