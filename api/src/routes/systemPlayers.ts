import { Router, Response } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { systemPlayerService, DEFAULT_STAKE_CONFIGS } from '../services/systemPlayerService';

const router = Router();

// Helper: check if user is admin or the agent/owner of this room
async function verifyRoomOwnerOrAdmin(telegramId: string, roomId: string): Promise<{ authorized: boolean; room?: any; user?: any; error?: string }> {
  const { data: user } = await supabase
    .from('users')
    .select('id, telegram_id, role, main_balance, first_name')
    .eq('telegram_id', telegramId)
    .single();

  if (!user) return { authorized: false, error: 'User not found' };

  const { data: room, error: rErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle();

  if (rErr || !room) return { authorized: false, error: 'Room not found' };

  const isAdmin = user.role === 'admin';
  const isAgent = room.agent_id && (room.agent_id === user.id || room.agent_id === user.telegram_id);

  if (!isAdmin && !isAgent) {
    return { authorized: false, error: 'You are not the designated owner or agent of this room' };
  }

  return { authorized: true, room, user };
}

// ── GET /api/system-players/status ──────────────────────────────────────────
router.get('/status', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const roomId = (req.query.roomId || req.query.room_id) as string;

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const { authorized, room, user, error } = await verifyRoomOwnerOrAdmin(telegramId, roomId);
    if (!authorized || !room) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    const isPro = systemPlayerService.isRoomProActive(room);
    const expiresAt = room.system_players_pro_expires_at ? new Date(room.system_players_pro_expires_at).getTime() : null;
    const daysRemaining = expiresAt && expiresAt > Date.now() ? Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

    // Fetch pool count
    let totalBots = 0;
    const { count, error: countErr } = await supabase
      .from('system_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);

    if (!countErr) totalBots = count || 0;

    // Fetch active manager accounts for manual payment display
    const { data: managerAccounts } = await supabase
      .from('manager_accounts')
      .select('id, bank_type, account_name, account_number')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    res.json({
      room_id: room.id,
      room_name: room.room_name,
      enabled: Boolean(room.system_players_enabled),
      pro_level: Number(room.system_players_pro_level || 0),
      pro_expires_at: room.system_players_pro_expires_at,
      is_pro_active: isPro,
      days_remaining: daysRemaining,
      schedule_start: room.system_players_schedule_start || '00:00',
      schedule_end: room.system_players_schedule_end || '24:00',
      stake_configs: room.system_players_stake_configs || DEFAULT_STAKE_CONFIGS,
      risk_percent: Number(room.system_players_risk_percent ?? 25),
      monthly_price: Number(room.system_players_monthly_price ?? 1000),
      total_bots_in_pool: totalBots,
      agent_balance: Number(user?.main_balance || 0),
      manager_accounts: managerAccounts || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system-players/upgrade ─────────────────────────────────────────
router.post('/upgrade', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const { roomId, room_id, method } = req.body;
    const targetRoomId = roomId || room_id;

    if (!targetRoomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const { authorized, room, user, error } = await verifyRoomOwnerOrAdmin(telegramId, targetRoomId);
    if (!authorized || !room || !user) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    const monthlyPrice = Number(room.system_players_monthly_price ?? 1000);

    if (method === 'balance') {
      const currentBal = Number(user.main_balance || 0);
      if (currentBal < monthlyPrice) {
        return res.status(400).json({
          error: `Insufficient Agent Balance (${currentBal} ETB). You need ${monthlyPrice} ETB to upgrade to Pro Level 1.`
        });
      }

      // Deduct monthly price from agent balance
      const newBal = currentBal - monthlyPrice;
      const { error: balErr } = await supabase
        .from('users')
        .update({ main_balance: newBal })
        .eq('id', user.id);

      if (balErr) {
        return res.status(500).json({ error: 'Failed to deduct balance: ' + balErr.message });
      }

      // Calculate 30-day extension
      let baseTime = Date.now();
      if (room.system_players_pro_expires_at) {
        const existingExpires = new Date(room.system_players_pro_expires_at).getTime();
        if (existingExpires > baseTime) baseTime = existingExpires;
      }
      const newExpiresAt = new Date(baseTime + 30 * 86400000).toISOString();

      const { error: rErr } = await supabase
        .from('rooms')
        .update({
          system_players_pro_level: 1,
          system_players_pro_expires_at: newExpiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetRoomId);

      if (rErr) {
        // Rollback balance if room update fails
        await supabase.from('users').update({ main_balance: currentBal }).eq('id', user.id);
        return res.status(500).json({ error: 'Failed to update room pro level: ' + rErr.message });
      }

      // Ensure 1,000 pool is seeded in the background
      systemPlayerService.seedSystemPlayersPool(targetRoomId, 1000).catch(console.error);

      return res.json({
        success: true,
        message: `Successfully upgraded to Pro Level 1! Active for 30 days.`,
        new_balance: newBal,
        pro_expires_at: newExpiresAt,
        pro_level: 1,
      });
    }

    return res.status(400).json({ error: 'Unsupported payment method. Use "balance" to pay with Agent Balance.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system-players/settings ───────────────────────────────────────
router.post('/settings', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const {
      roomId,
      room_id,
      enabled,
      schedule_start,
      schedule_end,
      stake_configs,
      risk_percent
    } = req.body;

    const targetRoomId = roomId || room_id;
    if (!targetRoomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const { authorized, room, error } = await verifyRoomOwnerOrAdmin(telegramId, targetRoomId);
    if (!authorized || !room) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    // Pro Level check: To enable system players, room must be Pro Level 1
    const wantsToEnable = Boolean(enabled);
    if (wantsToEnable && !systemPlayerService.isRoomProActive(room)) {
      return res.status(400).json({
        error: 'Pro Level 1 upgrade required to activate System Players. Upgrade your room for 1,000 ETB/month.'
      });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (enabled !== undefined) updates.system_players_enabled = Boolean(enabled);
    if (schedule_start !== undefined) updates.system_players_schedule_start = schedule_start;
    if (schedule_end !== undefined) updates.system_players_schedule_end = schedule_end;
    if (stake_configs !== undefined) updates.system_players_stake_configs = stake_configs;
    if (risk_percent !== undefined) updates.system_players_risk_percent = Number(risk_percent);

    const { error: updErr } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', targetRoomId);

    if (updErr) {
      return res.status(500).json({ error: updErr.message });
    }

    // If enabled, ensure pool of 1,000 bots is seeded
    if (wantsToEnable) {
      systemPlayerService.seedSystemPlayersPool(targetRoomId, 1000).catch(console.error);
    }

    res.json({
      success: true,
      message: 'System player settings saved successfully',
      settings: updates,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system-players/pool ────────────────────────────────────────────
router.get('/pool', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const roomId = (req.query.roomId || req.query.room_id) as string;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const search = ((req.query.search as string) || '').trim();

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const { authorized, error } = await verifyRoomOwnerOrAdmin(telegramId, roomId);
    if (!authorized) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    const offset = (page - 1) * limit;
    let query = supabase
      .from('system_players')
      .select('id, first_name, total_won, created_at', { count: 'exact' })
      .eq('room_id', roomId)
      .order('total_won', { ascending: false })
      .order('created_at', { ascending: false });

    if (search) {
      query = query.ilike('first_name', `%${search}%`);
    }

    const { data, count, error: qErr } = await query.range(offset, offset + limit - 1);
    if (qErr && qErr.code !== 'PGRST205') {
      return res.status(500).json({ error: qErr.message });
    }

    res.json({
      players: data || [],
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system-players/init-pool ───────────────────────────────────────
router.post('/init-pool', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const { roomId, room_id } = req.body;
    const targetRoomId = roomId || room_id;

    if (!targetRoomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const { authorized, error } = await verifyRoomOwnerOrAdmin(telegramId, targetRoomId);
    if (!authorized) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    const totalBots = await systemPlayerService.seedSystemPlayersPool(targetRoomId, 1000);

    res.json({
      success: true,
      message: `System player pool verified/initialized with ${totalBots} Ethiopian bots`,
      total_bots: totalBots,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
