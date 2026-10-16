import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

router.get('/profile', validateTelegramAuth, async (req: AuthRequest, res) => {
  const { data } = await supabase.from('users').select('*').eq('telegram_id', req.telegramUser!.id.toString()).single();
  if (!data) { res.status(404).json({ error: 'Player not found' }); return; }
  res.json({ player: data });
});

// GET /api/player/invited — returns all users invited by the current user
router.get('/invited', validateTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();

  // Fetch all users who have this user as their inviter
  const { data: invitedUsers, error } = await supabase
    .from('users')
    .select('telegram_id, first_name, username, created_at')
    .eq('inviter_id', telegramId)
    .order('created_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!invitedUsers || invitedUsers.length === 0) {
    res.json({ invited: [], total_earned: 0 });
    return;
  }

  // For each invited user, check if they made a first approved deposit and calculate reward
  const invitedWithRewards = await Promise.all(
    invitedUsers.map(async (u: any) => {
      const { data: firstDeposit } = await supabase
        .from('deposits')
        .select('amount, created_at')
        .eq('telegram_id', u.telegram_id)
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      const rewardEarned = firstDeposit ? firstDeposit.amount * 0.10 : 0;
      return {
        telegram_id: u.telegram_id,
        first_name: u.first_name,
        username: u.username,
        joined_at: u.created_at,
        has_deposited: !!firstDeposit,
        first_deposit_amount: firstDeposit?.amount || 0,
        first_deposit_date: firstDeposit?.created_at || null,
        reward_earned: rewardEarned,
      };
    })
  );

  const total_earned = invitedWithRewards.reduce((sum, u) => sum + u.reward_earned, 0);
  res.json({ invited: invitedWithRewards, total_earned });
});
// Fetch support contact and channel link from settings (fallback to real admin username)
router.get('/support-contact', async (_req, res) => {
  try {
    const { data: allSettings } = await supabase.from('settings').select('key, value');
    const getSetting = (k: string, def: string) => {
      const row = allSettings?.find(s => s.key === k);
      return row ? row.value : def;
    };

    let username = (getSetting('support_username', '') || '').trim().replace('@', '');

    // If support_username is not customized, dynamically track the actual admin user from the database
    if (!username || username === 'hdasebingo_admin' || username === 'adwabingo_admin') {
      const { data: adminUser } = await supabase
        .from('users')
        .select('username')
        .eq('role', 'admin')
        .not('username', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (adminUser?.username) {
        username = adminUser.username.replace('@', '');
      }
    }

    if (!username) {
      username = 'Mosque_Dona';
    }

    res.json({
      username,
      channel: getSetting('channel_link', 'https://t.me/hdasebingo'),
      announcement_message: getSetting('announcement_message', ''),
      announcement_max_views: parseInt(getSetting('announcement_max_views', '2'), 10)
    });
  } catch {
    res.json({
      username: 'Mosque_Dona',
      channel: 'https://t.me/hdasebingo',
      announcement_message: '',
      announcement_max_views: 2
    });
  }
});

// GET /api/player/transfer/lookup — verify recipient before showing confirmation
router.get('/transfer/lookup', validateTelegramAuth, async (req: AuthRequest, res) => {
  const senderTelegramId = req.telegramUser!.id.toString();
  const recipient_id = (req.query.recipient_id as string || '').trim();
  if (!recipient_id) {
    res.status(400).json({ error: 'Recipient Telegram ID is required.' });
    return;
  }
  if (recipient_id === senderTelegramId) {
    res.status(400).json({ error: 'You cannot transfer to yourself.' });
    return;
  }
  const { data: recipient, error } = await supabase
    .from('users')
    .select('telegram_id, first_name, username')
    .eq('telegram_id', recipient_id)
    .maybeSingle();

  if (error || !recipient) {
    res.status(404).json({ error: 'Recipient not found. Please check the Telegram ID.' });
    return;
  }

  res.json({
    recipient_telegram_id: recipient.telegram_id,
    first_name: recipient.first_name || 'User',
    username: recipient.username || '',
  });
});

// POST /api/player/transfer — transfer main_balance between users
router.post('/transfer', validateTelegramAuth, async (req: AuthRequest, res) => {
  const senderTelegramId = req.telegramUser!.id.toString();
  const { recipient_telegram_id, amount } = req.body;

  if (!recipient_telegram_id || !amount || Number(amount) <= 0) {
    res.status(400).json({ error: 'Recipient Telegram ID and a valid amount are required.' });
    return;
  }

  if (recipient_telegram_id === senderTelegramId) {
    res.status(400).json({ error: 'You cannot transfer to yourself.' });
    return;
  }

  const transferAmount = Number(amount);

  // Fetch sender balance
  const { data: sender } = await supabase
    .from('users')
    .select('main_balance, first_name, username')
    .eq('telegram_id', senderTelegramId)
    .single();

  if (!sender) { res.status(404).json({ error: 'Sender not found.' }); return; }
  if (sender.main_balance < transferAmount) {
    res.status(400).json({ error: `Insufficient main balance. You have ${sender.main_balance} ETB.` });
    return;
  }

  // Fetch recipient
  const { data: recipient } = await supabase
    .from('users')
    .select('main_balance, first_name, username')
    .eq('telegram_id', recipient_telegram_id)
    .single();

  if (!recipient) {
    res.status(404).json({ error: 'Recipient not found. Make sure the Telegram ID is correct.' });
    return;
  }

  // Deduct from sender
  const { error: senderErr } = await supabase
    .from('users')
    .update({ main_balance: sender.main_balance - transferAmount })
    .eq('telegram_id', senderTelegramId)
    .gte('main_balance', transferAmount);

  if (senderErr) { res.status(500).json({ error: 'Failed to deduct balance. Please try again.' }); return; }

  // Add to recipient
  const { error: recipientErr } = await supabase
    .from('users')
    .update({ main_balance: recipient.main_balance + transferAmount })
    .eq('telegram_id', recipient_telegram_id);

  if (recipientErr) {
    // Rollback sender
    await supabase.from('users').update({ main_balance: sender.main_balance }).eq('telegram_id', senderTelegramId);
    res.status(500).json({ error: 'Failed to credit recipient. Transfer rolled back.' }); return;
  }

  // Notify recipient and sender via Telegram bot
  try {
    const botToken = process.env.BOT_TOKEN;
    const safeSender = (sender.username || sender.first_name || 'Someone').replace(/[_*[\]]/g, '\\$&');
    const safeRecipient = (recipient.username || recipient.first_name || 'User').replace(/[_*[\]]/g, '\\$&');
    
    if (botToken) {
      // Notify Recipient
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: recipient_telegram_id,
          text: `💸 *You received a transfer!*\n\n👤 From: @${safeSender}\n💰 Amount: *${transferAmount.toLocaleString('en-US')} ETB*\n\n✅ Added to your Main Balance.`,
          parse_mode: 'Markdown'
        })
      });

      // Notify Sender
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: senderTelegramId,
          text: `📤 *Transfer Sent Successfully!*\n\n👤 To: @${safeRecipient}\n💰 Amount: *${transferAmount.toLocaleString('en-US')} ETB*\n\n✅ Deducted from your Main Balance.`,
          parse_mode: 'Markdown'
        })
      });
    }
  } catch (e) { console.error('Notify error:', e); }

  res.json({
    success: true,
    recipient_name: recipient.first_name || recipient.username || 'User',
    amount: transferAmount
  });
});


router.get('/audit', validateTelegramAuth, async (req: AuthRequest, res) => {
  const telegramId = req.telegramUser!.id.toString();
  try {
    const txList: any[] = [];
    
    // 1. Get settings for percentages
    const { data: allSettings } = await supabase.from('settings').select('key, value');
    const getSetting = (key: string, def: string) => {
      const row = allSettings?.find(s => s.key === key);
      return row ? row.value : def;
    };
    const depPct = parseFloat(getSetting('first_deposit_bonus_pct', '20')) / 100;
    const secondDepPct = parseFloat(getSetting('second_deposit_bonus_pct', '10')) / 100;
    const invPct = parseFloat(getSetting('invitation_reward_pct', '10')) / 100;

    // 2. Fetch Deposits
    const { data: deposits } = await supabase.from('deposits').select('*').eq('telegram_id', telegramId).order('created_at', { ascending: true });
    let approvedCount = 0;
    (deposits || []).forEach((d: any) => {
      txList.push({ id: d.id, type: 'deposit', amount: d.amount, status: d.status, created_at: d.created_at, note: d.payment_method });
      
      if (d.status === 'approved') {
        approvedCount++;
        if (approvedCount === 1 && depPct > 0) {
          const bAmount = d.amount * depPct;
          txList.push({ id: d.id + '_db1', type: 'deposit_bonus', amount: bAmount, status: 'approved', created_at: d.created_at, note: '1st Deposit Bonus' });
        } else if (approvedCount === 2 && secondDepPct > 0) {
          const bAmount = d.amount * secondDepPct;
          txList.push({ id: d.id + '_db2', type: 'second_deposit_bonus', amount: bAmount, status: 'approved', created_at: d.created_at, note: '2nd Deposit Bonus' });
        }
      }
    });

    // 3. Fetch Withdrawals
    const { data: withdrawals } = await supabase.from('withdrawals').select('*').eq('telegram_id', telegramId);
    (withdrawals || []).forEach((w: any) => {
      txList.push({ id: w.id, type: 'withdrawal', amount: w.amount, status: w.status, created_at: w.created_at, note: w.withdrawal_method });
    });

    // 4. Fetch Bingo Wins
    const { data: wins } = await supabase.from('bingo_games').select('*').eq('winner_telegram_id', telegramId).eq('status', 'finished');
    (wins || []).forEach((g: any) => {
      const wType = g.win_type || 'normal';
      let typeLabel = 'game_win';
      if (wType === 'jackpot_8') typeLabel = 'jackpot_8';
      if (wType === 'jackpot_10') typeLabel = 'jackpot_10';
      
      txList.push({ id: 'win_' + g.id, type: typeLabel, amount: g.winner_prize, status: 'approved', created_at: g.finished_at, note: 'Game #' + g.id });
    });

    // 5. Fetch Bingo Stakes (Games Played)
    const { data: plays } = await supabase.from('bingo_players').select('created_at, game_id, bingo_games(stake, status)').eq('telegram_id', telegramId);
    (plays || []).forEach((p: any) => {
      if (p.bingo_games) {
        // Only count if game actually finished (stake was taken and not refunded)
        // Wait, stake is taken on join. Refunded if cancelled. Let's just say "stake" for all plays.
        // Actually, if cancelled, it's refunded. So let's only show completed/active games stakes.
        if (p.bingo_games.status !== 'cancelled') {
           const gId = p.game_id ? p.game_id.replace(/-/g, '').substring(0, 8).toUpperCase() : '';
           txList.push({ id: 'play_' + p.game_id + '_' + Math.random(), type: 'game_stake', amount: p.bingo_games.stake, status: 'approved', created_at: p.created_at, note: 'Game #' + gId });
        }
      }
    });

    // 6. Fetch Invitation Rewards
    const { data: invited } = await supabase.from('users').select('telegram_id, username').eq('inviter_id', telegramId);
    if (invited && invited.length > 0) {
      const invitedIds = invited.map((u: any) => u.telegram_id);
      const { data: theirDeps } = await supabase.from('deposits').select('telegram_id, amount, status, created_at').in('telegram_id', invitedIds).eq('status', 'approved').order('created_at', { ascending: true });
      
      const countedFirstDep = new Set();
      (theirDeps || []).forEach((d: any) => {
        if (!countedFirstDep.has(d.telegram_id)) {
          countedFirstDep.add(d.telegram_id);
          const iAmount = d.amount * invPct;
          if (iAmount > 0) {
            const uInfo = invited.find((u: any) => u.telegram_id === d.telegram_id);
            txList.push({ id: 'inv_' + d.telegram_id, type: 'invitation_reward', amount: iAmount, status: 'approved', created_at: d.created_at, note: 'Invited @' + (uInfo?.username || 'user') });
          }
        }
      });
    }

    txList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ transactions: txList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /player/rooms — public: list all active rooms with live stats
router.get('/rooms', async (_req, res) => {
  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('status', 'active');

    if (error) throw error;

    // Sum active players across all games in each room
    const { data: activeGames } = await supabase
      .from('bingo_games')
      .select('room_id, total_players')
      .in('status', ['waiting', 'calling']);

    const roomPlayersMap: Record<string, number> = {};
    (activeGames || []).forEach((g: any) => {
      if (g.room_id) {
        roomPlayersMap[g.room_id] = (roomPlayersMap[g.room_id] || 0) + Number(g.total_players || 0);
      }
    });

    const enrichedRooms = (rooms || []).map((room) => ({
      ...room,
      is_pinned: Boolean(room.is_pinned),
      commission_rate: room.commission_rate ?? 8,
      total_players: roomPlayersMap[room.id] || 0,
      total_games: Number(room.total_games || 0)
    }));

    // Pinned rooms ALWAYS come first
    enrichedRooms.sort((a, b) => {
      if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) {
        return b.is_pinned ? 1 : -1;
      }
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });

    res.json({ rooms: enrichedRooms });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /player/rooms/:id/enter — track player entering a room (no longer mutates total_players in rooms table)
router.post('/rooms/:id/enter', async (_req, res) => {
  res.json({ success: true });
});

// GET /player/support-videos?category=<cat> — public: active videos for users
router.get('/support-videos', async (req, res) => {
  try {
    let query = supabase
      .from('support_videos')
      .select('id, category, title, description, video_url, thumbnail_url, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at');

    if (req.query.category && req.query.category !== 'all') {
      query = query.eq('category', req.query.category as string);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ videos: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /player/agent-room — get room assigned to current agent with live stats & game analytics
router.get('/agent-room', validateTelegramAuth, async (req: AuthRequest, res) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const { data: currentUser } = await supabase
      .from('users')
      .select('id, telegram_id, main_balance, first_name, username')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    let room: any = null;
    if (currentUser?.id) {
      const { data: r1 } = await supabase
        .from('rooms')
        .select('*')
        .eq('agent_id', currentUser.id)
        .maybeSingle();
      room = r1;
    }
    if (!room) {
      const { data: r2 } = await supabase
        .from('rooms')
        .select('*')
        .eq('agent_id', telegramId)
        .maybeSingle();
      room = r2;
    }

    if (!room?.id) {
      return res.json({
        room: null,
        active_games: [],
        recent_games: [],
        stats: null,
        chart_data: [],
      });
    }

    const commRate = Number(room.commission_rate ?? 8);

    // 1. Fetch active games (waiting or calling)
    const { data: games } = await supabase
      .from('bingo_games')
      .select('id, stake, prize_pool, total_players, status, start_at, created_at')
      .eq('room_id', room.id)
      .in('status', ['waiting', 'calling'])
      .order('created_at', { ascending: false });
    const activeGames = games || [];

    // 2. Fetch recent finished games (up to 30) for history report
    const { data: finishedGames } = await supabase
      .from('bingo_games')
      .select('id, stake, prize_pool, winner_prize, winner_first_name, winner_telegram_id, winner_cartela, total_players, status, created_at, finished_at')
      .eq('room_id', room.id)
      .eq('status', 'finished')
      .order('finished_at', { ascending: false })
      .limit(100);

    const mappedRecentGames = (finishedGames || []).map((g: any) => {
      const stake = Number(g.stake || 0);
      const players = Number(g.total_players || 0);
      const pot = Number(g.prize_pool || (stake * players) || 0);
      const comm = players >= 3 ? Number(((pot * commRate) / 100).toFixed(2)) : 0;
      return {
        id: g.id,
        stake,
        total_players: players,
        prize_pool: pot,
        winner_prize: Number(g.winner_prize || 0),
        winner_first_name: g.winner_first_name || 'Anonymous',
        winner_cartela: g.winner_cartela,
        agent_commission: comm,
        commission_rate: commRate,
        created_at: g.created_at,
        finished_at: g.finished_at,
        status: g.status,
      };
    });

    // 3. Fetch all finished games for full metrics & 7-day trend
    const { data: allFinished } = await supabase
      .from('bingo_games')
      .select('id, stake, prize_pool, total_players, finished_at, created_at')
      .eq('room_id', room.id)
      .eq('status', 'finished')
      .order('finished_at', { ascending: false });

    // 4. Count referred players for this agent
    const { count: referredCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_id', telegramId);

    // Build 7-day trend map
    const daysMap: Record<string, { date: string; label: string; games_count: number; commission: number; volume: number }> = {};
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      daysMap[dateStr] = {
        date: dateStr,
        label: dayNames[d.getDay()],
        games_count: 0,
        commission: 0,
        volume: 0,
      };
    }

    const now = new Date();
    const todayDateStr = now.toISOString().split('T')[0];
    let todayGames = 0;
    let todayCommission = 0;
    let totalCommissionAllTime = 0;
    let totalPotVolume = 0;

    (allFinished || []).forEach((g: any) => {
      const pot = Number(g.prize_pool || (Number(g.stake || 0) * Number(g.total_players || 0)) || 0);
      const comm = (Number(g.total_players || 0) >= 3) ? Number(((pot * commRate) / 100).toFixed(2)) : 0;

      totalPotVolume += pot;
      totalCommissionAllTime += comm;

      const fDate = (g.finished_at || g.created_at || '').split('T')[0];
      if (fDate === todayDateStr) {
        todayGames++;
        todayCommission += comm;
      }

      if (daysMap[fDate]) {
        daysMap[fDate].games_count += 1;
        daysMap[fDate].commission = Number((daysMap[fDate].commission + comm).toFixed(2));
        daysMap[fDate].volume = Number((daysMap[fDate].volume + pot).toFixed(2));
      }
    });

    const chartData = Object.values(daysMap);

    const roomPayload = {
      ...room,
      total_players: referredCount ?? (room.total_players || 0),
      total_games: (allFinished?.length ?? 0) || (room.total_games || 0),
    };

    res.json({
      room: roomPayload,
      active_games: activeGames,
      recent_games: mappedRecentGames,
      stats: {
        today_games: todayGames,
        today_commission: Number(todayCommission.toFixed(2)),
        total_games_finished: allFinished?.length || 0,
        total_commission_all_time: Number(totalCommissionAllTime.toFixed(2)),
        total_volume_all_time: Number(totalPotVolume.toFixed(2)),
        total_referred_players: referredCount || 0,
        commission_rate: commRate,
      },
      chart_data: chartData,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

