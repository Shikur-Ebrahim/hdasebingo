import { Router } from 'express';
import { AuthRequest, optionalTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();
router.use(optionalTelegramAuth);

// In-memory cache for ultra-fast pagination and minimal DB load (TTL: 15s)
let playersCache: { data: any[]; timestamp: number } | null = null;
let invitersCache: { data: any[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 15000;

// GET /api/leaderboard/players?page=1&limit=50
router.get('/players', async (req: AuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id ? req.telegramUser.id.toString() : null;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    if (!playersCache || Date.now() - playersCache.timestamp > CACHE_TTL_MS) {
      // Fetch real users (role='user', total_wins >= 1) and system players (total_won >= 1)
      const [usersRes, systemRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, telegram_id, first_name, username, total_wins, role, created_at')
          .eq('role', 'user')
          .gte('total_wins', 1),
        supabase
          .from('system_players')
          .select('id, first_name, total_won, created_at')
          .gte('total_won', 1)
      ]);

      const unified: any[] = [];

      // 1. Real Users: only role='user' and at least 1 win
      for (const u of usersRes.data || []) {
        const wins = Number(u.total_wins || 0);
        if (wins >= 1 && u.role === 'user') {
          unified.push({
            id: u.id,
            telegram_id: u.telegram_id,
            first_name: u.first_name || 'User',
            username: u.username || '',
            wins,
            is_system: false,
            created_at: u.created_at,
          });
        }
      }

      // 2. System Players: at least 1 won history
      for (const sp of systemRes.data || []) {
        const wins = Number(sp.total_won || 0);
        if (wins >= 1) {
          unified.push({
            id: sp.id,
            telegram_id: `bot_${sp.id}`,
            first_name: sp.first_name || 'System Player',
            username: '',
            wins,
            is_system: true,
            created_at: sp.created_at,
          });
        }
      }

      // 3. Sort descending by wins; tie-break by created_at ascending
      unified.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });

      // 4. Assign overall global ranks
      unified.forEach((p, idx) => {
        p.rank = idx + 1;
      });

      playersCache = { data: unified, timestamp: Date.now() };
    }

    const list = playersCache.data;
    const total = list.length;
    const total_pages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const paginated = list.slice(offset, offset + limit);

    const myRank = telegramId ? (list.findIndex(p => p.telegram_id === telegramId) + 1) : null;

    res.json({
      players: paginated,
      my_rank: myRank || null,
      total,
      page,
      limit,
      total_pages,
    });
  } catch (err: any) {
    console.error('Leaderboard players error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaderboard/inviters?page=1&limit=50
router.get('/inviters', async (req: AuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id ? req.telegramUser.id.toString() : null;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    if (!invitersCache || Date.now() - invitersCache.timestamp > CACHE_TTL_MS) {
      // Get all users with inviter_id set
      const { data: invited } = await supabase
        .from('users')
        .select('inviter_id')
        .not('inviter_id', 'is', null);

      const countMap: Record<string, number> = {};
      for (const row of invited || []) {
        if (!row.inviter_id) continue;
        countMap[row.inviter_id] = (countMap[row.inviter_id] || 0) + 1;
      }

      const sortedIds = Object.entries(countMap)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

      const topUuids = sortedIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
      const topTgIds = sortedIds.filter(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

      let users: any[] = [];
      if (topUuids.length > 0) {
        const { data: u1 } = await supabase.from('users').select('id, telegram_id, first_name, username, role').in('id', topUuids);
        if (u1) users = users.concat(u1);
      }
      if (topTgIds.length > 0) {
        const { data: u2 } = await supabase.from('users').select('id, telegram_id, first_name, username, role').in('telegram_id', topTgIds);
        if (u2) users = users.concat(u2);
      }

      const nameMap: Record<string, { first_name: string; username: string; telegram_id: string; role: string }> = {};
      for (const u of users || []) {
        const info = { first_name: u.first_name || 'User', username: u.username || '', telegram_id: u.telegram_id, role: u.role };
        if (u.id) nameMap[u.id] = info;
        if (u.telegram_id) nameMap[u.telegram_id] = info;
      }

      const invList = sortedIds
        .filter(id => !nameMap[id] || nameMap[id].role === 'user')
        .map((id, i) => ({
          rank: i + 1,
          id,
          telegram_id: nameMap[id]?.telegram_id || id,
          first_name: nameMap[id]?.first_name || 'User',
          username: nameMap[id]?.username || '',
          invites: countMap[id] || 0,
        }));

      invitersCache = { data: invList, timestamp: Date.now() };
    }

    const list = invitersCache.data;
    const total = list.length;
    const total_pages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const paginated = list.slice(offset, offset + limit);

    let myRank: number | null = null;
    if (telegramId) {
      const { data: curU } = await supabase.from('users').select('id').eq('telegram_id', telegramId).maybeSingle();
      const rankIdx = list.findIndex(p => p.telegram_id === telegramId || (curU?.id && p.id === curU.id));
      myRank = rankIdx >= 0 ? rankIdx + 1 : null;
    }

    res.json({
      inviters: paginated,
      my_rank: myRank || null,
      total,
      page,
      limit,
      total_pages,
    });
  } catch (err: any) {
    console.error('Leaderboard inviters error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
