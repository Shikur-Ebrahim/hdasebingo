import { Router, Response } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { systemPlayerService, DEFAULT_STAKE_CONFIGS, DEFAULT_WAITER_STAKE_CONFIGS } from '../services/systemPlayerService';

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

    const rawWaiterConfigs = room.waiter_players_stake_configs || {};
    const mergedWaiterConfigs = {
      stake_1: { ...DEFAULT_WAITER_STAKE_CONFIGS.stake_1, ...(rawWaiterConfigs.stake_1 || {}) },
      stake_2: { ...DEFAULT_WAITER_STAKE_CONFIGS.stake_2, ...(rawWaiterConfigs.stake_2 || {}) },
      stake_3: { ...DEFAULT_WAITER_STAKE_CONFIGS.stake_3, ...(rawWaiterConfigs.stake_3 || {}) },
      stake_4: { ...DEFAULT_WAITER_STAKE_CONFIGS.stake_4, ...(rawWaiterConfigs.stake_4 || {}) },
    };

    res.json({
      room_id: room.id,
      room_name: room.room_name,
      enabled: Boolean(room.system_players_enabled),
      waiter_enabled: room.waiter_players_enabled !== undefined ? Boolean(room.waiter_players_enabled) : false,
      pro_level: Number(room.system_players_pro_level || 0),
      pro_expires_at: room.system_players_pro_expires_at,
      is_pro_active: isPro,
      days_remaining: daysRemaining,
      schedule_start: room.system_players_schedule_start || '00:00',
      schedule_end: room.system_players_schedule_end || '24:00',
      stake_configs: mergedStakeConfigs,
      waiter_stake_configs: mergedWaiterConfigs,
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

// ── POST /api/system-players/submit-proof & /pro-request (Transfer screenshot submission) ───
const handleProProofSubmit = async (req: AuthRequest, res: Response) => {
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

    // 1. Check if there is already an unverified pending request for this room
    const { data: existingPending } = await supabase
      .from('pro_upgrade_requests')
      .select('id, created_at, amount, status')
      .eq('room_id', targetRoomId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPending) {
      return res.status(400).json({
        error: 'You already have an upgrade receipt under review by management. Please wait until it is verified before submitting again.',
        pending_request: existingPending,
      });
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

    // 2. Send instant Telegram notification to Admins (just like agent withdrawals)
    try {
      const { data: admins } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('role', 'admin');

      const botToken = process.env.BOT_TOKEN;
      if (botToken && admins && admins.length > 0) {
        const safeAgentName = (user.username ? `@${user.username}` : user.first_name || 'Agent').replace(/[_*[\]]/g, '\\$&');
        const safeRoomName = (room.room_name || 'Room').replace(/[_*[\]]/g, '\\$&');
        const safeBank = (bank_type || 'CBE').toUpperCase().replace(/[_*[\]]/g, '\\$&');
        const safeAccName = (account_name || '').replace(/[_*[\]]/g, '\\$&');
        const safeAccNum = (account_number || '').replace(/[_*[\]]/g, '\\$&');
        const safeReqId = (request?.id || '').slice(0, 8).toUpperCase().replace(/[_*[\]]/g, '\\$&');

        const caption =
          `🤖 *New System Pro Upgrade Request!*\n\n` +
          `👤 *Agent:* ${safeAgentName}\n` +
          `🚪 *Room:* ${safeRoomName}\n` +
          `💰 *Amount:* *${transferAmount.toLocaleString()} ETB*\n` +
          `🏦 *Bank:* ${safeBank}\n` +
          (safeAccNum ? `🔢 *Account:* \`${safeAccNum}\` (${safeAccName})\n` : '') +
          `📋 *Ref:* \`${safeReqId}\`\n\n` +
          `👉 Check *Admin Dashboard → System Pro Requests*`;

        for (const a of admins) {
          if (!a.telegram_id) continue;
          let sent = false;
          if (screenshot_url && screenshot_url.startsWith('http')) {
            try {
              const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: a.telegram_id,
                  photo: screenshot_url,
                  caption,
                  parse_mode: 'Markdown',
                }),
              });
              if (photoRes.ok) sent = true;
            } catch {}
          }
          if (!sent) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: a.telegram_id,
                text: caption,
                parse_mode: 'Markdown',
              }),
            }).catch(() => {});
          }
        }
      }
    } catch (notifyErr) {
      console.error('[SystemPlayers] Admin Telegram notification error:', notifyErr);
    }

    res.json({
      success: true,
      message: 'Pro upgrade request submitted! Management will verify your transfer and activate Pro Level 1.',
      request,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

router.post('/submit-proof', validateTelegramAuth, handleProProofSubmit);
router.post('/pro-request', validateTelegramAuth, handleProProofSubmit);

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
      risk_percent,
      waiter_enabled,
      waiter_stake_configs,
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
    const wantsToEnableWaiter = Boolean(waiter_enabled);
    const anyStakeEnabled = stake_configs && Object.values(stake_configs).some((c: any) => c?.enabled);
    const anyWaiterStakeEnabled = waiter_stake_configs && Object.values(waiter_stake_configs).some((c: any) => c?.enabled);
    if ((wantsToEnable || wantsToEnableWaiter || anyStakeEnabled || anyWaiterStakeEnabled) && !systemPlayerService.isRoomProActive(room)) {
      return res.status(400).json({
        error: 'Pro Level 1 upgrade required to activate System Players or Waiter Players.'
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
    if (waiter_enabled !== undefined) updates.waiter_players_enabled = Boolean(waiter_enabled);
    if (waiter_stake_configs !== undefined) updates.waiter_players_stake_configs = waiter_stake_configs;

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
    const telegramId = req.telegramUser?.id?.toString() || '';
    let userRole = req.pwaUser?.role;
    if (!userRole && telegramId) {
      const { data: dbUser } = await supabase
        .from('users')
        .select('role')
        .eq('telegram_id', telegramId)
        .maybeSingle();
      if (dbUser) userRole = dbUser.role;
    }

    if (!userRole || (userRole !== 'admin' && userRole !== 'worker')) {
      return res.status(403).json({ error: 'Admin or worker only' });
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

// ── ADMIN: GET /api/system-players/admin/pending-count ──────────────────────
router.get('/admin/pending-count', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { count, error } = await supabase
      .from('pro_upgrade_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error && error.code !== 'PGRST205') {
      return res.status(500).json({ error: error.message });
    }

    res.json({ pending: count || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message, pending: 0 });
  }
});

// ── ADMIN: POST /api/system-players/admin/requests/:id/review ───────────────
router.post('/admin/requests/:id/review', validateTelegramAuth, async (req: AuthRequest, res: Response) => {
  try {
    const requestId = req.params.id ? req.params.id.trim() : '';
    const { action, reason } = req.body;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!requestId || !isUuid.test(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID format' });
    }

    const telegramId = req.telegramUser?.id?.toString() || '';
    let userRole = req.pwaUser?.role;
    let reviewerUuid: string | null = null;

    if (req.pwaUser?.id && isUuid.test(req.pwaUser.id)) {
      reviewerUuid = req.pwaUser.id;
    }

    if (!userRole && telegramId) {
      const { data: dbUser } = await supabase
        .from('users')
        .select('id, role')
        .eq('telegram_id', telegramId)
        .maybeSingle();

      if (dbUser) {
        userRole = dbUser.role;
        if (!reviewerUuid && dbUser.id && isUuid.test(dbUser.id)) {
          reviewerUuid = dbUser.id;
        }
      }
    }

    if (!userRole || (userRole !== 'admin' && userRole !== 'worker')) {
      return res.status(403).json({ error: 'Admin or worker only' });
    }

    const { data: request, error: reqErr } = await supabase
      .from('pro_upgrade_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request) {
      return res.status(404).json({ error: 'Upgrade request not found' });
    }

    // Resolve the agent's telegram_id to send them the bot notification (like deposits/withdrawals)
    let agentTelegramId = '';
    if (request.agent_id && /^\d+$/.test(request.agent_id.toString())) {
      agentTelegramId = request.agent_id.toString();
    } else if (request.agent_id && isUuid.test(request.agent_id.toString())) {
      const { data: agentUser } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', request.agent_id)
        .maybeSingle();
      if (agentUser?.telegram_id) {
        agentTelegramId = agentUser.telegram_id.toString();
      }
    }

    if (!agentTelegramId && request.room_id && isUuid.test(request.room_id.toString())) {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('owner_telegram_id, agent_id')
        .eq('id', request.room_id)
        .maybeSingle();
      if (roomData?.owner_telegram_id) {
        agentTelegramId = roomData.owner_telegram_id.toString();
      } else if (roomData?.agent_id && /^\d+$/.test(roomData.agent_id.toString())) {
        agentTelegramId = roomData.agent_id.toString();
      }
    }

    const botToken = process.env.BOT_TOKEN;

    if (action === 'approve') {
      // 1. Mark request as approved (reviewed_by is UUID type)
      const { error: updErr } = await supabase
        .from('pro_upgrade_requests')
        .update({
          status: 'approved',
          reviewed_by: reviewerUuid,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updErr) {
        return res.status(500).json({ error: updErr.message });
      }

      // 2. Fetch room to compute 30 days extension
      let newExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
      if (request.room_id && isUuid.test(request.room_id.toString())) {
        const { data: room } = await supabase
          .from('rooms')
          .select('system_players_pro_expires_at')
          .eq('id', request.room_id)
          .maybeSingle();

        let baseTime = Date.now();
        if (room?.system_players_pro_expires_at) {
          const existingExpires = new Date(room.system_players_pro_expires_at).getTime();
          if (existingExpires > baseTime) baseTime = existingExpires;
        }
        newExpiresAt = new Date(baseTime + 30 * 86400000).toISOString();

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
      }

      // 4. Send Telegram Bot Notification to the Agent (like deposit approved)
      if (botToken && agentTelegramId) {
        const safeRoomName = (request.room_name || 'Your Room').replace(/[_*[\]]/g, '\\$&');
        const amountStr = Number(request.amount || 1000).toLocaleString('en-US');
        const expiresStr = new Date(newExpiresAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        const approveMsg =
          `🎉 *System Pro Upgrade Approved!*\n\n` +
          `🏢 *Room:* *${safeRoomName}*\n` +
          `💰 *Amount Verified:* *${amountStr} ETB*\n` +
          `🤖 *Status:* *PRO Level 1 Activated!*\n` +
          `⏳ *Valid Until:* *${expiresStr}* (30 Days)\n` +
          `👥 *Bots Seeded:* *1,000 Bots in your Room Pool*\n\n` +
          `🚀 Open your Agent Portal to manage your automated players!`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: agentTelegramId,
            text: approveMsg,
            parse_mode: 'Markdown',
          }),
        }).catch((err) => console.error('[SystemPro] Failed to notify agent on approve:', err));
      }

      return res.json({
        success: true,
        message: `Pro Level 1 activated for room until ${newExpiresAt}`,
        pro_expires_at: newExpiresAt,
      });
    } else if (action === 'reject') {
      const rejectReasonText = (reason && reason.trim()) ? reason.trim() : 'Payment proof verification failed';

      const { error: updErr } = await supabase
        .from('pro_upgrade_requests')
        .update({
          status: 'rejected',
          rejection_reason: rejectReasonText,
          reviewed_by: reviewerUuid,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updErr) {
        return res.status(500).json({ error: updErr.message });
      }

      // Send Telegram Bot Notification to the Agent (like deposit rejected)
      if (botToken && agentTelegramId) {
        const safeRoomName = (request.room_name || 'Your Room').replace(/[_*[\]]/g, '\\$&');
        const amountStr = Number(request.amount || 1000).toLocaleString('en-US');
        const safeReason = rejectReasonText.replace(/[_*[\]]/g, '\\$&');

        const rejectMsg =
          `❌ *System Pro Upgrade Request Rejected*\n\n` +
          `🏢 *Room:* *${safeRoomName}*\n` +
          `💰 *Amount:* *${amountStr} ETB*\n` +
          `📝 *Reason:* ${safeReason}\n\n` +
          `Please verify your transfer receipt and submit again from your Agent portal if this was an error.`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: agentTelegramId,
            text: rejectMsg,
            parse_mode: 'Markdown',
          }),
        }).catch((err) => console.error('[SystemPro] Failed to notify agent on reject:', err));
      }

      return res.json({
        success: true,
        message: 'Upgrade request rejected',
      });
    } else {
      return res.status(400).json({ error: 'Invalid action. Must be approve or reject.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
