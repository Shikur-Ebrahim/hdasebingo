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

    // Fetch latest pending request if any
    const { data: pendingRequest } = await supabase
      .from('pro_upgrade_requests')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const rawConfigs = room.system_players_stake_configs || {};
    const mergedStakeConfigs = {
      stake_1: { ...DEFAULT_STAKE_CONFIGS.stake_1, ...(rawConfigs.stake_1 || {}) },
      stake_2: { ...DEFAULT_STAKE_CONFIGS.stake_2, ...(rawConfigs.stake_2 || {}) },
      stake_3: { ...DEFAULT_STAKE_CONFIGS.stake_3, ...(rawConfigs.stake_3 || {}) },
      stake_4: { ...DEFAULT_STAKE_CONFIGS.stake_4, ...(rawConfigs.stake_4 || {}) },
    };

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
      stake_configs: mergedStakeConfigs,
      risk_percent: Number(room.system_players_risk_percent ?? 25),
      monthly_price: Number(room.system_players_monthly_price ?? 1000),
      total_bots_in_pool: totalBots,
      agent_balance: Number(user?.main_balance || 0),
      manager_accounts: managerAccounts || [],
      pending_request: pendingRequest || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system-players/upgrade (Balance payment) ──────────────────────
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
        await supabase.from('users').update({ main_balance: currentBal }).eq('id', user.id);
        return res.status(500).json({ error: 'Failed to update room pro level: ' + rErr.message });
      }

      // Ensure 1,000 pool is seeded in the background for this room
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

// ── POST /api/system-players/submit-proof (Transfer screenshot submission) ───
router.post('/submit-proof', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const {
      roomId,
      room_id,
      manager_account_id,
      bank_type,
      account_name,
      account_number,
      amount,
      screenshot_url
    } = req.body;

    const targetRoomId = roomId || room_id;
    if (!targetRoomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    if (!screenshot_url) {
      return res.status(400).json({ error: 'Payment screenshot is required' });
    }

    const { authorized, room, user, error } = await verifyRoomOwnerOrAdmin(telegramId, targetRoomId);
    if (!authorized || !room || !user) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    const transferAmount = Number(amount) || Number(room.system_players_monthly_price ?? 1000);

    const { data: request, error: insErr } = await supabase
      .from('pro_upgrade_requests')
      .insert({
        room_id: targetRoomId,
        agent_id: user.id || telegramId,
        agent_name: user.first_name || 'Agent',
        room_name: room.room_name,
        manager_account_id: manager_account_id || null,
        bank_type: bank_type || 'cbe',
        account_name: account_name || '',
        account_number: account_number || '',
        amount: transferAmount,
        screenshot_url,
        status: 'pending',
      })
      .select('*')
      .single();

    if (insErr) {
      return res.status(500).json({ error: insErr.message });
    }

    res.json({
      success: true,
      message: 'Pro upgrade request submitted! Management will verify your transfer and activate Pro Level 1.',
      request,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system-players/my-pro-requests ─────────────────────────────────
router.get('/my-pro-requests', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const roomId = (req.query.roomId || req.query.room_id) as string;

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const { authorized, error } = await verifyRoomOwnerOrAdmin(telegramId, roomId);
    if (!authorized) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    const { data, error: qErr } = await supabase
      .from('pro_upgrade_requests')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (qErr && qErr.code !== 'PGRST205') {
      return res.status(500).json({ error: qErr.message });
    }

    res.json(data || []);
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
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const search = ((req.query.search as string) || '').trim();

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const { authorized, error } = await verifyRoomOwnerOrAdmin(telegramId, roomId);
    if (!authorized) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    // Auto-seed pool for this room if currently empty
    const { count: initialCount } = await supabase
      .from('system_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);

    if (!initialCount || initialCount === 0) {
      await systemPlayerService.seedSystemPlayersPool(roomId, 1000);
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

// ── PUT /api/system-players/bot/:id (Edit system player name) ───────────────
router.put('/bot/:id', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const botId = req.params.id;
    const { roomId, room_id, first_name } = req.body;
    const targetRoomId = roomId || room_id;

    if (!targetRoomId || !first_name || !first_name.trim()) {
      return res.status(400).json({ error: 'Room ID and valid Name are required' });
    }

    const { authorized, error } = await verifyRoomOwnerOrAdmin(telegramId, targetRoomId);
    if (!authorized) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    const cleanName = first_name.trim();
    const { data, error: updErr } = await supabase
      .from('system_players')
      .update({ first_name: cleanName })
      .eq('id', botId)
      .eq('room_id', targetRoomId)
      .select('id, first_name, total_won')
      .single();

    if (updErr) {
      return res.status(500).json({ error: updErr.message });
    }

    res.json({
      success: true,
      message: `System player name updated to "${cleanName}"`,
      bot: data,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system-players/add-bot (Add custom bot to pool) ───────────────
router.post('/add-bot', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const { roomId, room_id, first_name } = req.body;
    const targetRoomId = roomId || room_id;

    if (!targetRoomId || !first_name || !first_name.trim()) {
      return res.status(400).json({ error: 'Room ID and valid Name are required' });
    }

    const { authorized, error } = await verifyRoomOwnerOrAdmin(telegramId, targetRoomId);
    if (!authorized) {
      return res.status(403).json({ error: error || 'Unauthorized' });
    }

    const cleanName = first_name.trim();
    const { data, error: insErr } = await supabase
      .from('system_players')
      .insert({
        room_id: targetRoomId,
        first_name: cleanName,
        total_won: 0,
      })
      .select('id, first_name, total_won')
      .single();

    if (insErr) {
      return res.status(500).json({ error: insErr.message });
    }

    res.json({
      success: true,
      message: `Added system player "${cleanName}" to room pool`,
      bot: data,
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
      message: `System player pool verified/initialized with ${totalBots} stylized bots`,
      total_bots: totalBots,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system-players/reseed (Regenerate 1,000 stylized unique handles) ─
router.post('/reseed', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
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

    const totalBots = await systemPlayerService.reseedSystemPlayersPool(targetRoomId, 1000);

    res.json({
      success: true,
      message: `Pool refreshed with ${totalBots} unique stylized handles (@, $, %, ., emojis)`,
      total_bots: totalBots,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: GET /api/system-players/admin/requests ───────────────────────────
router.get('/admin/requests', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const { data: user } = await supabase.from('users').select('role').eq('telegram_id', telegramId).single();
    if (!user || (user.role !== 'admin' && user.role !== 'worker')) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const status = (req.query.status as string) || 'all';
    let query = supabase
      .from('pro_upgrade_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query.limit(100);
    if (error && error.code !== 'PGRST205') {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: POST /api/system-players/admin/requests/:id/review ───────────────
router.post('/admin/requests/:id/review', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const requestId = req.params.id;
    const { action, reason } = req.body;

    const { data: user } = await supabase.from('users').select('role, first_name').eq('telegram_id', telegramId).single();
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { data: request, error: reqErr } = await supabase
      .from('pro_upgrade_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request) {
      return res.status(404).json({ error: 'Upgrade request not found' });
    }

    if (action === 'approve') {
      // 1. Mark request as approved
      await supabase
        .from('pro_upgrade_requests')
        .update({
          status: 'approved',
          reviewed_by: user.first_name || telegramId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      // 2. Fetch room to compute 30 days extension
      const { data: room } = await supabase.from('rooms').select('system_players_pro_expires_at').eq('id', request.room_id).maybeSingle();
      let baseTime = Date.now();
      if (room?.system_players_pro_expires_at) {
        const existingExpires = new Date(room.system_players_pro_expires_at).getTime();
        if (existingExpires > baseTime) baseTime = existingExpires;
      }
      const newExpiresAt = new Date(baseTime + 30 * 86400000).toISOString();

      await supabase
        .from('rooms')
        .update({
          system_players_pro_level: 1,
          system_players_pro_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.room_id);

      // 3. Ensure 1,000 bots are seeded for this room
      systemPlayerService.seedSystemPlayersPool(request.room_id, 1000).catch(console.error);

      return res.json({
        success: true,
        message: `Pro Level 1 activated for room until ${newExpiresAt}`,
        pro_expires_at: newExpiresAt,
      });
    } else if (action === 'reject') {
      await supabase
        .from('pro_upgrade_requests')
        .update({
          status: 'rejected',
          rejection_reason: reason || 'Payment proof verification failed',
          reviewed_by: user.first_name || telegramId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      return res.json({
        success: true,
        message: 'Upgrade request rejected',
      });
    }

    return res.status(400).json({ error: 'Invalid review action. Use "approve" or "reject".' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
