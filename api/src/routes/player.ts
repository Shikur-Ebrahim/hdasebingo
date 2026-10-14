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
// Fetch support contact and channel link from settings
router.get('/support-contact', validateTelegramAuth, async (req: AuthRequest, res) => {
  const { data: allSettings } = await supabase.from('settings').select('key, value');
  const getSetting = (k: string, def: string) => {
    const row = allSettings?.find(s => s.key === k);
    return row ? row.value : def;
  };

  res.json({
    username: getSetting('support_username', 'hdasebingo_admin'),
    channel: getSetting('channel_link', 'https://t.me/hdasebingo'),
    announcement_message: getSetting('announcement_message', ''),
    announcement_max_views: parseInt(getSetting('announcement_max_views', '2'), 10)
  });
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
           txList.push({ id: 'play_' + p.game_id + '_' + Math.random(), type: 'game_stake', amount: p.bingo_games.stake, status: 'approved', created_at: p.created_at, note: 'Game #' + p.game_id });
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
      .select('id, room_name, agent_id, agent_name, total_games, status, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const enrichedRooms = await Promise.all(
      (rooms || []).map(async (room) => {
        let players = 0;
        if (room.agent_id) {
          const { count } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('inviter_id', room.agent_id);
          players = count || 0;
        }
        return {
          ...room,
          total_players: players,
          total_games: Number(room.total_games || 0)
        };
      })
    );

    res.json({ rooms: enrichedRooms });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /player/rooms/:id/enter — track player entering a room (no longer mutates total_players in rooms table)
router.post('/rooms/:id/enter', async (_req, res) => {
  res.json({ success: true });
});

export default router;
