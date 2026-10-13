import { Router, Request, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const telegramId = req.telegramUser!.id.toString();
  
  // Attempt to select role and permissions. Fallback to just role if permissions column is missing.
  let { data, error } = await supabase.from('users').select('role, permissions').eq('telegram_id', telegramId).single();
  
  if (error && error.message.includes('permissions')) {
    const fallback = await supabase.from('users').select('role').eq('telegram_id', telegramId).single();
    if (fallback.data) {
      data = { role: fallback.data.role, permissions: {} };
    } else {
      data = null;
    }
  }
  
  if (!data || (data.role !== 'admin' && data.role !== 'worker')) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  
  if (data.role === 'admin') {
    return next();
  }

  // Worker permissions check
  const path = req.path;
  const perms = data.permissions || {};

  let allowed = false;
  if (path.startsWith('/stats')) allowed = true; // Allow workers to view stats dashboard
  else if (path.startsWith('/pending-counts')) allowed = true; // Workers always see pending counts
  else if (path.includes('deposit') && perms.deposits) allowed = true;
  else if (path.includes('withdraw') && perms.withdrawals) allowed = true;
  else if (path.startsWith('/users') && perms.users) allowed = true;
  else if (path.startsWith('/settings') && perms.settings) allowed = true;
  else if (path.startsWith('/tx-report') && perms.reports) allowed = true;
  else if (path.startsWith('/profit-report')) allowed = true; // Allow workers to view profit report
  else if (path.startsWith('/games') && perms.games) allowed = true;
  
  // Explicitly deny these to anyone but admin
  if (
    path.startsWith('/workers') || 
    path.startsWith('/deposit-methods') || 
    path.startsWith('/withdrawal-methods')
  ) {
    allowed = false;
  }

  if (!allowed) {
    res.status(403).json({ error: 'Access denied. Missing permission.' });
    return;
  }

  next();
};

router.use(validateTelegramAuth);
router.use(requireAdmin);

// Get all deposit methods
router.get('/deposit-methods', async (req, res) => {
  const { data, error } = await supabase
    .from('deposit_methods')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Create a deposit method
router.post('/deposit-methods', async (req, res) => {
  const { type, name, account_number, logo_url, min_deposit } = req.body;
  const { data, error } = await supabase
    .from('deposit_methods')
    .insert([{ type, name, account_number, logo_url, min_deposit }])
    .select().single();
    
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Update a deposit method
router.put('/deposit-methods/:id', async (req, res) => {
  const { type, name, account_number, logo_url, min_deposit, is_active } = req.body;
  const { data, error } = await supabase
    .from('deposit_methods')
    .update({ type, name, account_number, logo_url, min_deposit, is_active, updated_at: new Date() })
    .eq('id', req.params.id)
    .select().single();
    
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Delete a deposit method
router.delete('/deposit-methods/:id', async (req, res) => {
  const { error } = await supabase.from('deposit_methods').delete().eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// ─── WITHDRAWAL METHODS ───────────────────────────────────────────────────────

// Get all withdrawal methods
router.get('/withdrawal-methods', async (req, res) => {
  const { data, error } = await supabase
    .from('withdrawal_methods')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Create a withdrawal method
router.post('/withdrawal-methods', async (req, res) => {
  const { type, logo_url, min_withdrawal } = req.body;
  const { data, error } = await supabase
    .from('withdrawal_methods')
    .insert([{ type, logo_url, min_withdrawal }])
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Update a withdrawal method
router.put('/withdrawal-methods/:id', async (req, res) => {
  const { type, logo_url, min_withdrawal, is_active } = req.body;
  const { data, error } = await supabase
    .from('withdrawal_methods')
    .update({ type, logo_url, min_withdrawal, is_active, updated_at: new Date() })
    .eq('id', req.params.id)
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Delete a withdrawal method
router.delete('/withdrawal-methods/:id', async (req, res) => {
  const { error } = await supabase.from('withdrawal_methods').delete().eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// ─── PENDING COUNTS (for worker badge) ────────────────────────────────────────
router.get('/pending-counts', async (_req, res) => {
  const [dRes, wRes] = await Promise.all([
    supabase.from('deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('withdrawals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  res.json({ pendingDeposits: dRes.count ?? 0, pendingWithdrawals: wRes.count ?? 0 });
});

// ─── DEPOSIT VERIFICATION ─────────────────────────────────────────────────────

// Get all deposits with user + method info (pending and approved)
router.get('/deposits', async (req, res) => {
  const { data, error } = await supabase
    .from('deposits')
    .select('*, deposit_methods(type, name, logo_url), users!deposits_telegram_id_fkey(first_name, username)')
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Approve deposit → add to user balance + mark approved + apply bonus + notify user
router.post('/deposits/:id/approve', async (req, res) => {
  const { data: deposit, error: fetchErr } = await supabase
    .from('deposits').select('*').eq('id', req.params.id).single();
  if (fetchErr || !deposit) { res.status(404).json({ error: 'Deposit not found' }); return; }

  // Check if this is their first approved deposit
  const { count: approvedCount } = await supabase
    .from('deposits')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', deposit.telegram_id)
    .eq('status', 'approved');

  const isFirstDeposit = approvedCount === 0;
  const isSecondDeposit = approvedCount === 1;

  // Atomic balance increment for the depositor
  const { error: balErr } = await supabase.rpc('increment_user_balance', {
    p_telegram_id: deposit.telegram_id,
    p_amount: deposit.amount,
  });
  if (balErr) { res.status(500).json({ error: balErr.message }); return; }

  let depositorBonus = 0;
  let inviterBonus = 0;
  let inviterId = null;
  let bonusReason = '';
  
  if (isFirstDeposit || isSecondDeposit) {
    const { data: allSettings } = await supabase.from('settings').select('key, value');
    const getSetting = (key: string, def: number | string) => {
      const row = allSettings?.find(s => s.key === key);
      return row ? row.value : def;
    };

    const firstDepositPct = parseFloat(getSetting('first_deposit_bonus_pct', '20') as string) / 100;
    const secondDepositPct = parseFloat(getSetting('second_deposit_bonus_pct', '10') as string) / 100;
    const invitationPct = parseFloat(getSetting('invitation_reward_pct', '10') as string) / 100;

    const { data: depRecord } = await supabase.from('users').select('bonus_balance, inviter_id').eq('telegram_id', deposit.telegram_id).single();

    if (isFirstDeposit) {
      depositorBonus = deposit.amount * firstDepositPct;
      bonusReason = 'First Deposit';
      
      if (depRecord && depRecord.inviter_id) {
        inviterId = depRecord.inviter_id;
        inviterBonus = deposit.amount * invitationPct;
      }
    } else if (isSecondDeposit && secondDepositPct > 0) {
      depositorBonus = deposit.amount * secondDepositPct;
      bonusReason = 'Second Deposit';
    }

    if (depRecord && depositorBonus > 0) {
      const currentDepBonus = Number(depRecord.bonus_balance || 0);
      await supabase.from('users').update({ bonus_balance: currentDepBonus + depositorBonus }).eq('telegram_id', deposit.telegram_id);
    }

    if (inviterId && inviterBonus > 0) {
      const { data: invRecord } = await supabase.from('users').select('bonus_balance').eq('telegram_id', inviterId).single();
      if (invRecord) {
        const currentInvBonus = Number(invRecord.bonus_balance || 0);
        await supabase.from('users').update({ bonus_balance: currentInvBonus + inviterBonus }).eq('telegram_id', inviterId);
      }
    }
  }

  // Mark deposit as approved
  await supabase.from('deposits').update({ status: 'approved', updated_at: new Date() }).eq('id', req.params.id);

  // Send Telegram Notification to the depositor
  try {
    let msgText = `✅ *Deposit Approved!*\n\n💰 Amount: *${Number(deposit.amount).toLocaleString('en-US')} ETB* has been added to your balance.`;
    if (depositorBonus > 0) {
      msgText += `\n\n🎁 *${bonusReason} Bonus!* You received an extra *${Number(depositorBonus).toLocaleString('en-US')} ETB* in your bonus balance!`;
    }
    msgText += `\n\n🎮 Open the Mini App to start playing!`;

    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: deposit.telegram_id,
        text: msgText,
        parse_mode: 'Markdown',
      })
    });
  } catch (err) {
    console.error('Failed to notify user on Telegram:', err);
  }

  // Send Telegram Notification to the Inviter
  if (inviterId && inviterBonus > 0) {
    try {
      const inviterMsg = `🎉 *Referral Bonus Received!*\n\nYour invited friend made their first deposit! You have received *${Number(inviterBonus).toLocaleString('en-US')} ETB* in your bonus balance. Keep inviting friends for more rewards! 🎁`;
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: inviterId,
          text: inviterMsg,
          parse_mode: 'Markdown',
        })
      });
    } catch (err) {
      console.error('Failed to notify inviter on Telegram:', err);
    }
  }

  res.json({ success: true, isFirstDeposit, isSecondDeposit, depositorBonus, inviterBonus });
});

// Reject deposit → permanently delete from DB
router.delete('/deposits/:id/reject', async (req, res) => {
  const { error } = await supabase.from('deposits').delete().eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// Get admin stats (pending counts)
router.get('/stats', async (req, res) => {
  const { count: depCount } = await supabase
    .from('deposits')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
    
  const { count: withCount } = await supabase
    .from('withdrawals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
    
  res.json({ 
    pendingDeposits: depCount || 0,
    pendingWithdrawals: withCount || 0 
  });
});

// ─── WITHDRAWAL MANAGEMENT ───────────────────────────────────────────────────

// Get all withdrawals with user + method info
router.get('/withdrawals', async (req, res) => {
  const { data: withdrawals, error } = await supabase
    .from('withdrawals')
    .select('*, withdrawal_methods(type, logo_url)')
    .order('created_at', { ascending: false });
    
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Manually fetch user data to avoid missing foreign key issues
  if (withdrawals && withdrawals.length > 0) {
    const telegramIds = [...new Set(withdrawals.map(w => w.telegram_id))];
    const { data: users } = await supabase
      .from('users')
      .select('telegram_id, first_name, username')
      .in('telegram_id', telegramIds);
      
    if (users) {
      const userMap = Object.fromEntries(users.map(u => [u.telegram_id, u]));
      for (const w of withdrawals) {
        (w as any).users = userMap[w.telegram_id] || null;
      }
    }
  }

  res.json(withdrawals);
});

// Approve withdrawal → mark as approved and notify user
router.post('/withdrawals/:id/approve', async (req, res) => {
  const { data: withdrawal, error: fetchErr } = await supabase
    .from('withdrawals').select('*').eq('id', req.params.id).single();
  if (fetchErr || !withdrawal) { res.status(404).json({ error: 'Withdrawal not found' }); return; }

  await supabase.from('withdrawals').update({ status: 'approved', updated_at: new Date() }).eq('id', req.params.id);

  // Notify user
  try {
    const msg = `✅ *Withdrawal Approved!*\n\n💸 Amount: *${Number(withdrawal.amount).toLocaleString('en-US')} ETB* has been sent to your account.\n\n⏳ Funds will arrive within a few minutes.`;
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: withdrawal.telegram_id, text: msg, parse_mode: 'Markdown' })
    });
  } catch (err) { console.error('Failed to notify user:', err); }

  res.json({ success: true });
});

// Reject withdrawal → refund main_balance + delete record + notify user
router.delete('/withdrawals/:id/reject', async (req, res) => {
  const { data: withdrawal, error: fetchErr } = await supabase
    .from('withdrawals').select('*').eq('id', req.params.id).single();
  if (fetchErr || !withdrawal) { res.status(404).json({ error: 'Withdrawal not found' }); return; }

  // Refund main_balance
  const { data: user } = await supabase.from('users').select('main_balance').eq('telegram_id', withdrawal.telegram_id).single();
  if (user) {
    await supabase.from('users').update({ main_balance: Number(user.main_balance) + Number(withdrawal.amount) }).eq('telegram_id', withdrawal.telegram_id);
  }

  // Delete the record
  await supabase.from('withdrawals').delete().eq('id', req.params.id);

  // Notify user
  try {
    const msg = `❌ *Withdrawal Rejected*\n\n💸 Your withdrawal of *${Number(withdrawal.amount).toLocaleString('en-US')} ETB* has been rejected.\n\n💰 Your balance has been refunded. Please contact support for more info.`;
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: withdrawal.telegram_id, text: msg, parse_mode: 'Markdown' })
    });
  } catch (err) { console.error('Failed to notify user:', err); }

  res.json({ success: true });
});

// ─── PROFIT REPORT ────────────────────────────────────────────────────────────
router.get('/profit-report', validateTelegramAuth, requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  
  let dQuery = supabase.from('deposits').select('amount').eq('status', 'approved');
  let wQuery = supabase.from('withdrawals').select('amount').eq('status', 'approved');

  if (from) {
    dQuery = dQuery.gte('created_at', from);
    wQuery = wQuery.gte('created_at', from);
  }
  if (to) {
    dQuery = dQuery.lte('created_at', to);
    wQuery = wQuery.lte('created_at', to);
  }

  const [dRes, wRes] = await Promise.all([dQuery, wQuery]);

  if (dRes.error) return res.status(500).json({ error: dRes.error.message });
  if (wRes.error) return res.status(500).json({ error: wRes.error.message });

  const totalDeposits = (dRes.data || []).reduce((sum, d) => sum + Number(d.amount), 0);
  const totalWithdrawals = (wRes.data || []).reduce((sum, w) => sum + Number(w.amount), 0);
  const netProfit = totalDeposits - totalWithdrawals;

  res.json({ totalDeposits, totalWithdrawals, netProfit });
});

// ─── TRANSACTION REPORT ────────────────────────────────────────────────────────
router.get('/tx-report', validateTelegramAuth, requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  
  // Use explicit FK for deposits. Withdrawals might lack FK, so no join there.
  let dQuery = supabase.from('deposits').select('*, users!deposits_telegram_id_fkey(username, inviter_id)');
  let wQuery = supabase.from('withdrawals').select('*');

  if (from) {
    dQuery = dQuery.gte('created_at', from);
    wQuery = wQuery.gte('created_at', from);
  }
  if (to) {
    dQuery = dQuery.lte('created_at', to);
    wQuery = wQuery.lte('created_at', to);
  }

  const [dRes, wRes] = await Promise.all([dQuery, wQuery]);
  const deposits = dRes.data || [];
  const withdrawals = wRes.data || [];

  // Fetch usernames for withdrawals manually
  let wTelegramIds = [...new Set(withdrawals.map((w: any) => w.telegram_id))];
  let wUsersMap: Record<string, string> = {};
  if (wTelegramIds.length > 0) {
    const { data: wUsers } = await supabase.from('users').select('telegram_id, username').in('telegram_id', wTelegramIds);
    (wUsers || []).forEach(u => wUsersMap[u.telegram_id] = u.username);
  }

  const { data: allApproved } = await supabase
    .from('deposits')
    .select('id, telegram_id, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  const firstDepositIds = new Set();
  const secondDepositIds = new Set();
  const userDepCounts: Record<string, number> = {};

  if (allApproved) {
    for (const d of allApproved) {
      const currentCount = userDepCounts[d.telegram_id] || 0;
      if (currentCount === 0) {
        firstDepositIds.add(d.id);
      } else if (currentCount === 1) {
        secondDepositIds.add(d.id);
      }
      userDepCounts[d.telegram_id] = currentCount + 1;
    }
  }

  const { data: allSettings } = await supabase.from('settings').select('key, value');
  const getSetting = (key: string, def: string) => {
    const row = allSettings?.find(s => s.key === key);
    return row ? row.value : def;
  };

  const depPct = parseFloat(getSetting('first_deposit_bonus_pct', '20')) / 100;
  const secondDepPct = parseFloat(getSetting('second_deposit_bonus_pct', '10')) / 100;
  const invPct = parseFloat(getSetting('invitation_reward_pct', '10')) / 100;

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalDepBonus = 0;
  let totalSecondDepBonus = 0;
  let totalInvBonus = 0;

  const txList: any[] = [];

  deposits.forEach((d: any) => {
    if (d.status === 'approved') totalDeposits += Number(d.amount);
    const username = d.users?.username || 'Unknown';
    txList.push({ id: d.id, type: 'deposit', amount: Number(d.amount), status: d.status, created_at: d.created_at, username, telegram_id: d.telegram_id });

    if (d.status === 'approved') {
      let bonusAmount = 0;
      let isFirst = firstDepositIds.has(d.id);
      let isSecond = secondDepositIds.has(d.id);

      if (isFirst) {
        bonusAmount = Number(d.amount) * depPct;
      } else if (isSecond && secondDepPct > 0) {
        bonusAmount = Number(d.amount) * secondDepPct;
      }

      if (bonusAmount > 0) {
        if (isFirst) {
          totalDepBonus += bonusAmount;
          txList.push({ id: d.id + '_db', type: 'deposit_bonus', amount: bonusAmount, status: 'approved', created_at: d.created_at, username, telegram_id: d.telegram_id });
        } else if (isSecond) {
          totalSecondDepBonus += bonusAmount;
          txList.push({ id: d.id + '_db2', type: 'second_deposit_bonus', amount: bonusAmount, status: 'approved', created_at: d.created_at, username, telegram_id: d.telegram_id });
        }
      }

      if (isFirst && d.users?.inviter_id) {
        const ib = Number(d.amount) * invPct;
        totalInvBonus += ib;
        txList.push({ id: d.id + '_ib', type: 'invitation_reward', amount: ib, status: 'approved', created_at: d.created_at, username: 'Inviter of ' + username, telegram_id: d.users.inviter_id });
      }
    }
  });

  withdrawals.forEach((w: any) => {
    if (w.status === 'approved') totalWithdrawals += Number(w.amount);
    const username = wUsersMap[w.telegram_id] || 'Unknown';
    txList.push({ id: w.id, type: 'withdrawal', amount: Number(w.amount), status: w.status, created_at: w.created_at, username, telegram_id: w.telegram_id });
  });

  // ─── Bingo jackpot wins (8-call and 10-call) ────────────────────────────────
  let bingoQuery = supabase
    .from('bingo_games')
    .select('id, game_id, stake, winner_prize, winner_telegram_id, winner_first_name, win_type, finished_at')
    .in('win_type', ['jackpot_8', 'jackpot_10'])
    .eq('status', 'finished');
  if (from) bingoQuery = bingoQuery.gte('finished_at', from);
  if (to)   bingoQuery = bingoQuery.lte('finished_at', to);
  const { data: jackpotGames } = await bingoQuery;

  // Get winner usernames
  const winnerIds = [...new Set((jackpotGames || []).map((g: any) => g.winner_telegram_id).filter(Boolean))];
  let winnerUsernameMap: Record<string, string> = {};
  if (winnerIds.length > 0) {
    const { data: wu } = await supabase.from('users').select('telegram_id, username').in('telegram_id', winnerIds);
    (wu || []).forEach((u: any) => { winnerUsernameMap[u.telegram_id] = u.username || 'Unknown'; });
  }

  let totalJackpot8 = 0, totalJackpot10 = 0;
  (jackpotGames || []).forEach((g: any) => {
    const uname = winnerUsernameMap[g.winner_telegram_id] || g.winner_first_name || 'Unknown';
    const prize = Number(g.winner_prize || 0);
    if (g.win_type === 'jackpot_8') {
      totalJackpot8 += prize;
      txList.push({ id: g.id + '_j8', type: 'jackpot_8', amount: prize, status: 'approved', created_at: g.finished_at, username: uname, telegram_id: g.winner_telegram_id, game_id: g.game_id, stake: g.stake });
    } else if (g.win_type === 'jackpot_10') {
      totalJackpot10 += prize;
      txList.push({ id: g.id + '_j10', type: 'jackpot_10', amount: prize, status: 'approved', created_at: g.finished_at, username: uname, telegram_id: g.winner_telegram_id, game_id: g.game_id, stake: g.stake });
    }
  });

  // ─── Welcome / Signup bonuses for users registered in period ────────────────
  const welcomeBonusAmount = parseFloat(getSetting('welcome_bonus_amount', '10'));
  let usersQuery = supabase
    .from('users')
    .select('id, telegram_id, username, first_name, created_at');
  if (from) usersQuery = usersQuery.gte('created_at', from);
  if (to)   usersQuery = usersQuery.lte('created_at', to);
  const { data: registeredUsers } = await usersQuery;

  let totalWelcomeBonus = 0;
  if (welcomeBonusAmount > 0) {
    (registeredUsers || []).forEach((u: any) => {
      totalWelcomeBonus += welcomeBonusAmount;
      txList.push({
        id: u.id + '_wb',
        type: 'welcome_bonus',
        amount: welcomeBonusAmount,
        status: 'approved',
        created_at: u.created_at,
        username: u.username || u.first_name || 'User',
        telegram_id: u.telegram_id,
      });
    });
  }

  txList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json({
    stats: { totalDeposits, totalWithdrawals, totalDepBonus, totalSecondDepBonus, totalInvBonus, totalJackpot8, totalJackpot10, totalWelcomeBonus },
    transactions: txList
  });
});

// ─── USER MANAGEMENT ──────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  const { search = '', page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(50, parseInt(limit as string));
  const offset = (pageNum - 1) * limitNum;

  let query = supabase
    .from('users')
    .select('id, telegram_id, username, first_name, role, status, main_balance, bonus_balance, total_wins, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (search) {
    query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,telegram_id.eq.${search}`);
  }

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  const telegramIds = (data || []).map((u: any) => u.telegram_id);
  let statsMap: Record<string, { totalDeposited: number; depositCount: number }> = {};
  if (telegramIds.length > 0) {
    const { data: depositStats } = await supabase
      .from('deposits').select('telegram_id, amount, status')
      .in('telegram_id', telegramIds).eq('status', 'approved');
    for (const d of depositStats || []) {
      if (!statsMap[d.telegram_id]) statsMap[d.telegram_id] = { totalDeposited: 0, depositCount: 0 };
      statsMap[d.telegram_id].totalDeposited += Number(d.amount);
      statsMap[d.telegram_id].depositCount += 1;
    }
  }

  const enriched = (data || []).map((u: any) => ({
    ...u,
    totalDeposited: statsMap[u.telegram_id]?.totalDeposited || 0,
    depositCount: statsMap[u.telegram_id]?.depositCount || 0,
  }));

  res.json({ users: enriched, total: count || 0, page: pageNum, limit: limitNum });
});

router.get('/users/:telegramId', async (req, res) => {
  const { data: user, error } = await supabase.from('users').select('*').eq('telegram_id', req.params.telegramId).single();
  if (error || !user) { res.status(404).json({ error: 'User not found' }); return; }

  const [dRes, wRes] = await Promise.all([
    supabase.from('deposits').select('*').eq('telegram_id', req.params.telegramId).order('created_at', { ascending: false }).limit(20),
    supabase.from('withdrawals').select('*').eq('telegram_id', req.params.telegramId).order('created_at', { ascending: false }).limit(20),
  ]);

  const totalDeposited = (dRes.data || []).filter((d: any) => d.status === 'approved').reduce((s: number, d: any) => s + Number(d.amount), 0);
  const totalWithdrawn = (wRes.data || []).filter((w: any) => w.status === 'approved').reduce((s: number, w: any) => s + Number(w.amount), 0);

  res.json({ user, deposits: dRes.data || [], withdrawals: wRes.data || [], totalDeposited, totalWithdrawn });
});

router.put('/users/:telegramId/balance', async (req, res) => {
  const { field, amount, note } = req.body;
  if (!field || amount === undefined) { res.status(400).json({ error: 'field and amount required' }); return; }
  if (!['main_balance', 'bonus_balance'].includes(field)) { res.status(400).json({ error: 'Invalid field' }); return; }

  const { data: user } = await supabase.from('users').select('main_balance, bonus_balance').eq('telegram_id', req.params.telegramId).single();
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const current = Number((user as Record<string, any>)[field] || 0);
  const newValue = Math.max(0, current + Number(amount));
  const { error } = await supabase.from('users').update({ [field]: newValue }).eq('telegram_id', req.params.telegramId);
  if (error) { res.status(500).json({ error: error.message }); return; }

  try {
    const label = field === 'main_balance' ? 'Main Balance' : 'Bonus Balance';
    const sign = Number(amount) >= 0 ? '+' : '';
    const msg = `💼 *Balance Adjustment*\n\nYour ${label} has been adjusted by *${sign}${Number(amount).toLocaleString('en-US')} ETB*.\n${note ? `📝 Note: ${note}` : ''}\n\n💰 New ${label}: *${newValue.toLocaleString('en-US')} ETB*`;
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: req.params.telegramId, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) { console.error('Notify failed:', e); }

  res.json({ success: true, newValue });
});

router.put('/users/:telegramId/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin', 'worker'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }
  const { error } = await supabase.from('users').update({ role }).eq('telegram_id', req.params.telegramId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

router.put('/users/:telegramId/status', async (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive'].includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }
  const { error } = await supabase.from('users').update({ status }).eq('telegram_id', req.params.telegramId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// ─── WORKERS ───────────────────────────────────────────────────────────────────

router.get('/workers', async (req, res) => {
  let { data, error } = await supabase
    .from('users')
    .select('id, telegram_id, username, first_name, role, status, permissions, created_at')
    .eq('role', 'worker')
    .order('created_at', { ascending: false });
    
  if (error && error.message.includes('permissions')) {
    const fallback = await supabase
      .from('users')
      .select('id, telegram_id, username, first_name, role, status, created_at')
      .eq('role', 'worker')
      .order('created_at', { ascending: false });
    data = fallback.data as any;
    error = fallback.error;
  }
  
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ workers: data });
});

router.put('/workers/:telegramId/permissions', async (req, res) => {
  const { permissions } = req.body;
  const { error } = await supabase
    .from('users')
    .update({ permissions })
    .eq('telegram_id', req.params.telegramId)
    .eq('role', 'worker');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// ─── SETTINGS ────────────────────────────────────────────────────────────────

// GET /admin/settings — return all key/value settings
router.get('/settings', validateTelegramAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ settings: data || [] });
});

// PUT /admin/settings — upsert a single setting by key
router.put('/settings', validateTelegramAuth, requireAdmin, async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) { res.status(400).json({ error: 'key and value are required' }); return; }

  const { error } = await supabase
    .from('settings')
    .upsert({ key, value: String(value) }, { onConflict: 'key' });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// ─── BINGO ADMIN MONITORING ───────────────────────────────────────────────────

// GET /admin/bingo-games — list recent games for monitoring
router.get('/bingo-games', validateTelegramAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('bingo_games')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// GET /admin/bingo-games/:id/players — get player count + list for a game
router.get('/bingo-games/:id/players', validateTelegramAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('bingo_players')
    .select('cartela_number, telegram_id, created_at')
    .eq('game_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ count: (data || []).length, players: data });
});

// GET /admin/bingo-report — advanced report with time filters
router.get('/bingo-report', validateTelegramAuth, requireAdmin, async (req, res) => {
  const period = req.query.period as string || 'today';
  
  let startDate = new Date();
  startDate.setHours(0,0,0,0); // Start of today

  let endDate = new Date();
  endDate.setHours(23,59,59,999); // End of today

  const now = new Date();

  switch(period) {
    case 'yesterday':
      startDate.setDate(startDate.getDate() - 1);
      endDate.setDate(endDate.getDate() - 1);
      break;
    case 'week':
      startDate.setDate(now.getDate() - 7);
      endDate = now;
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      endDate = now;
      break;
    case '3month':
      startDate.setMonth(now.getMonth() - 3);
      endDate = now;
      break;
    case '6month':
      startDate.setMonth(now.getMonth() - 6);
      endDate = now;
      break;
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1);
      endDate = now;
      break;
    case 'all':
      startDate = new Date(0); // 1970
      endDate = now;
      break;
    case 'today':
    default:
      // already set
      break;
  }

  // Fetch games
  const { data: games, error } = await supabase
    .from('bingo_games')
    .select('id, game_id, stake, status, winner_prize, winner_first_name, winner_cartela, created_at, finished_at')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Fetch all players in date range to calculate collected stakes accurately
  const { data: players } = await supabase
    .from('bingo_players')
    .select('game_id')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const playerCounts: Record<string, number> = {};
  (players || []).forEach(p => {
    playerCounts[p.game_id] = (playerCounts[p.game_id] || 0) + 1;
  });

  let total_games = 0;
  let total_stakes_collected = 0;
  let total_prizes_paid = 0;

  const enrichedGames = (games || []).map(g => {
    const pc = playerCounts[g.id] || 0;
    const collected = pc * Number(g.stake);
    const paid = Number(g.winner_prize || 0);
    
    if (g.status === 'finished') {
      total_games++;
      total_stakes_collected += collected;
      total_prizes_paid += paid;
    }

    return { ...g, players_count: pc, collected, paid };
  });

  res.json({
    stats: {
      total_games,
      total_stakes_collected,
      total_prizes_paid,
      profit: total_stakes_collected - total_prizes_paid
    },
    games: enrichedGames
  });
});

// POST /admin/bingo-games/:id/finish — force-finish a stuck game
router.post('/bingo-games/:id/finish', validateTelegramAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('bingo_games')
    .update({ status: 'finished', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});


router.get('/user-audit/:telegramId', async (req, res) => {
  const telegramId = req.params.telegramId;
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

    // 7. Get user info
    const { data: user } = await supabase.from('users').select('username, first_name, balance').eq('telegram_id', telegramId).single();

    txList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ transactions: txList, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
export default router;
