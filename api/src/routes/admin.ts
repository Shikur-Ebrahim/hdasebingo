import { Router, Request, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { getWithdrawalFeeSettings, saveWithdrawalFeeSettings, calculateWithdrawalFee } from '../services/withdrawalFee';
import { checkAndAutoPostProofs } from './channelProofs';

const router = Router();

const BANK_NAMES: Record<string, string> = {
  cbe: 'Commercial Bank of Ethiopia (CBE)',
  boa: 'Bank of Abyssinia (BOA)',
  telebirr: 'Telebirr',
};

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
  
  (req as any).userRole = data.role;

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
  else if (path.startsWith('/audit/worker-balance')) allowed = true; // Workers see net remaining balance
  else if (path.startsWith('/worker-transfers') && !path.includes('/review')) allowed = true; // Workers can submit/view transfers
  else if (path.startsWith('/manager-accounts') && req.method === 'GET') allowed = true; // Workers view manager accounts
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

  // Prevent double approval
  if (deposit.status === 'approved') {
    res.status(400).json({ error: 'This deposit has already been approved.' });
    return;
  }

  // Check if this is their first approved deposit
  const { count: approvedCount } = await supabase
    .from('deposits')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', deposit.telegram_id)
    .eq('status', 'approved');

  const isFirstDeposit = approvedCount === 0;
  const isSecondDeposit = approvedCount === 1;

  // Fetch depositor user record from public.users table
  const { data: depRecord, error: userFetchErr } = await supabase
    .from('users')
    .select('id, telegram_id, main_balance, bonus_balance, inviter_id')
    .eq('telegram_id', String(deposit.telegram_id))
    .maybeSingle();

  if (userFetchErr || !depRecord) {
    res.status(404).json({ error: `User with Telegram ID ${deposit.telegram_id} not found in users table.` });
    return;
  }

  // Calculate new balances based on public.users schema
  const depAmount = Number(deposit.amount || 0);
  const currentMain = Number(depRecord.main_balance || 0);
  const currentBonus = Number(depRecord.bonus_balance || 0);

  let depositorBonus = 0;
  let inviterBonus = 0;
  let inviterId: string | null = null;
  let bonusReason = '';

  // 1. First & Second Deposit Bonus
  if (isFirstDeposit || isSecondDeposit) {
    const { data: allSettings } = await supabase.from('settings').select('key, value');
    const getSetting = (key: string, def: number | string) => {
      const row = allSettings?.find(s => s.key === key);
      return row ? row.value : def;
    };

    const firstDepositPct = parseFloat(getSetting('first_deposit_bonus_pct', '20') as string) / 100;
    const secondDepositPct = parseFloat(getSetting('second_deposit_bonus_pct', '10') as string) / 100;
    const invitationPct = parseFloat(getSetting('invitation_reward_pct', '10') as string) / 100;

    if (isFirstDeposit) {
      depositorBonus = Number((depAmount * firstDepositPct).toFixed(2));
      bonusReason = 'First Deposit';
      
      if (depRecord.inviter_id) {
        inviterId = depRecord.inviter_id;
        inviterBonus = Number((depAmount * invitationPct).toFixed(2));
      }
    } else if (isSecondDeposit && secondDepositPct > 0) {
      depositorBonus = Number((depAmount * secondDepositPct).toFixed(2));
      bonusReason = 'Second Deposit';
    }
  }

  // 2. Weekend Bonus (independent of 1st/2nd deposit bonuses)
  let weekendBonus = 0;
  try {
    const { data: wkSettings } = await supabase.from('settings').select('key, value')
      .in('key', ['weekend_bonus_enabled', 'weekend_bonus_days', 'weekend_bonus_pct']);
    const getWk = (key: string, def: string) => {
      const row = wkSettings?.find(s => s.key === key);
      return row ? row.value : def;
    };
    const wkEnabled = getWk('weekend_bonus_enabled', 'false') === 'true';
    if (wkEnabled) {
      const wkPct = parseFloat(getWk('weekend_bonus_pct', '10')) / 100;
      let wkDays: number[] = [0, 6]; // default: Sunday & Saturday
      try { wkDays = JSON.parse(getWk('weekend_bonus_days', '[0,6]')); } catch (_) {}

      // Determine day-of-week and calendar day in Ethiopian Time (UTC+3)
      const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
      const depositTime = new Date(deposit.created_at).getTime();
      const eatDate = new Date(depositTime + EAT_OFFSET_MS);

      const dayOfWeek = eatDate.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat

      if (wkDays.includes(dayOfWeek) && wkPct > 0) {
        // Calculate the start and end of this calendar day (in UTC)
        const year = eatDate.getUTCFullYear();
        const month = eatDate.getUTCMonth();
        const day = eatDate.getUTCDate();
        const startOfDayUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - EAT_OFFSET_MS);
        const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

        // Check if user already had an approved deposit on this specific day
        const { count: priorDepositsOnDay } = await supabase
          .from('deposits')
          .select('*', { count: 'exact', head: true })
          .eq('telegram_id', deposit.telegram_id)
          .eq('status', 'approved')
          .neq('id', deposit.id)
          .gte('created_at', startOfDayUTC.toISOString())
          .lte('created_at', endOfDayUTC.toISOString());

        // Weekend bonus only awarded once per day (on user's first approved deposit for that day)
        if ((priorDepositsOnDay || 0) === 0) {
          weekendBonus = Number((depAmount * wkPct).toFixed(2));
        }
      }
    }
  } catch (err) {
    console.error('Weekend bonus calculation error:', err);
  }

  // 3. Update public.users table in ONE atomic call
  const newMainBalance = Number((currentMain + depAmount).toFixed(2));
  const totalBonusAdded = Number((depositorBonus + weekendBonus).toFixed(2));
  const newBonusBalance = Number((currentBonus + totalBonusAdded).toFixed(2));

  const { error: balErr } = await supabase
    .from('users')
    .update({ 
      main_balance: newMainBalance,
      bonus_balance: newBonusBalance
    })
    .eq('telegram_id', String(deposit.telegram_id));

  if (balErr) {
    res.status(500).json({ error: 'Failed to update user balances: ' + balErr.message });
    return;
  }

  // 4. Update inviter's bonus balance if applicable
  if (inviterId && inviterBonus > 0) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviterId);
      const { data: invRecord } = await (isUuid
        ? supabase.from('users').select('id, bonus_balance').eq('id', inviterId).maybeSingle()
        : supabase.from('users').select('id, bonus_balance').eq('telegram_id', String(inviterId)).maybeSingle()
      );
      if (invRecord) {
        const currentInvBonus = Number(invRecord.bonus_balance || 0);
        await supabase.from('users').update({ 
          bonus_balance: Number((currentInvBonus + inviterBonus).toFixed(2))
        }).eq('id', invRecord.id);
      }
    } catch (err) {
      console.error('Failed to credit inviter bonus:', err);
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
    if (weekendBonus > 0) {
      msgText += `\n\n🎉 *Weekend Bonus!* You also received *${Number(weekendBonus).toLocaleString('en-US')} ETB* weekend bonus in your bonus balance!`;
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

  // Check auto-post milestone in background
  checkAndAutoPostProofs('deposit').catch(e => console.error('auto-post deposit error:', e));

  res.json({ success: true, isFirstDeposit, isSecondDeposit, depositorBonus, inviterBonus, weekendBonus });
});

// Reject deposit → permanently delete from DB
router.delete('/deposits/:id/reject', async (req, res) => {
  const { error } = await supabase.from('deposits').delete().eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

// Get admin stats (pending counts)
router.get('/stats', async (req, res) => {
  const [depRes, withRes, trRes] = await Promise.all([
    supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('worker_transfers').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
    
  res.json({ 
    pendingDeposits: depRes.count || 0,
    pendingWithdrawals: withRes.count || 0,
    pendingTransfers: trRes.count || 0,
  });
});

// ─── WITHDRAWAL MANAGEMENT ───────────────────────────────────────────────────

// User withdrawal fee settings
router.get('/withdrawal-fee', async (req, res) => {
  try {
    const settings = await getWithdrawalFeeSettings();
    res.json({ ok: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/withdrawal-fee', async (req, res) => {
  try {
    const updated = await saveWithdrawalFeeSettings(req.body);
    res.json({ ok: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all withdrawals with user + method info
router.get('/withdrawals', async (req, res) => {
  const [{ data: withdrawals, error }, feeSettings] = await Promise.all([
    supabase
      .from('withdrawals')
      .select('*, withdrawal_methods(type, logo_url)')
      .order('created_at', { ascending: false }),
    getWithdrawalFeeSettings(),
  ]);
    
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Manually fetch user data to avoid missing foreign key issues
  if (withdrawals && withdrawals.length > 0) {
    const telegramIds = [...new Set(withdrawals.map(w => w.telegram_id))];
    const { data: users } = await supabase
      .from('users')
      .select('telegram_id, first_name, username, role')
      .in('telegram_id', telegramIds);
      
    const userMap = users ? Object.fromEntries(users.map(u => [u.telegram_id, u])) : {};
    for (const w of withdrawals) {
      const u = userMap[w.telegram_id] || null;
      (w as any).users = u;

      let fee_percent = (w as any).fee_percent;
      let fee_amount = (w as any).fee_amount;
      let net_amount = (w as any).net_amount;

      if (fee_percent === undefined || fee_percent === null || net_amount === undefined || net_amount === null) {
        const calc = calculateWithdrawalFee(Number(w.amount), u?.role, feeSettings);
        fee_percent = calc.fee_percent;
        fee_amount = calc.fee_amount;
        net_amount = calc.net_amount;
      }

      (w as any).fee_percent = Number(fee_percent) || 0;
      (w as any).fee_amount = Number(fee_amount) || 0;
      (w as any).net_amount = Number(net_amount) || Number(w.amount);
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
    const feeSettings = await getWithdrawalFeeSettings();
    const { data: user } = await supabase.from('users').select('role').eq('telegram_id', withdrawal.telegram_id).maybeSingle();
    const calc = calculateWithdrawalFee(Number(withdrawal.amount), user?.role, feeSettings);
    const netAmount = Number(withdrawal.net_amount ?? calc.net_amount);
    const feeAmount = Number(withdrawal.fee_amount ?? calc.fee_amount);
    const feePercent = Number(withdrawal.fee_percent ?? calc.fee_percent);

    const feeText = feeAmount > 0 
      ? `\n🏷️ Fee (${feePercent}%): *${feeAmount.toLocaleString('en-US')} ETB*\n💰 Total Deducted: *${Number(withdrawal.amount).toLocaleString('en-US')} ETB*`
      : '';
    const msg = `✅ *Withdrawal Approved!*\n\n💸 Amount: *${netAmount.toLocaleString('en-US')} ETB* has been sent to your account.${feeText}\n\n⏳ Funds will arrive within a few minutes.`;
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: withdrawal.telegram_id, text: msg, parse_mode: 'Markdown' })
    });
  } catch (err) { console.error('Failed to notify user:', err); }

  // Check auto-post milestone in background
  checkAndAutoPostProofs('withdrawal').catch(e => console.error('auto-post withdrawal error:', e));

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
  // Select net_amount so we can show actual payout (after fee) for withdrawals
  let wQuery = supabase.from('withdrawals').select('amount, net_amount, fee_amount').eq('status', 'approved');

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
  // Use net_amount (actual payout to user after fee deduction) if available; fallback to amount
  const totalWithdrawals = (wRes.data || []).reduce((sum, w) => {
    const netAmt = Number((w as any).net_amount);
    const amt = Number(w.amount);
    // net_amount > 0 means fee was applied; use it as the actual payout the worker sends
    return sum + (netAmt > 0 ? netAmt : amt);
  }, 0);
  const totalFees = (wRes.data || []).reduce((sum, w) => sum + Number((w as any).fee_amount || 0), 0);
  const netProfit = totalDeposits - totalWithdrawals;

  res.json({ totalDeposits, totalWithdrawals, totalFees, netProfit });
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
    .select('id, stake, winner_prize, winner_telegram_id, winner_first_name, win_type, finished_at')
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
      txList.push({ id: g.id + '_j8', type: 'jackpot_8', amount: prize, status: 'approved', created_at: g.finished_at, username: uname, telegram_id: g.winner_telegram_id, game_id: g.id.replace(/-/g, '').substring(0, 8).toUpperCase(), stake: g.stake });
    } else if (g.win_type === 'jackpot_10') {
      totalJackpot10 += prize;
      txList.push({ id: g.id + '_j10', type: 'jackpot_10', amount: prize, status: 'approved', created_at: g.finished_at, username: uname, telegram_id: g.winner_telegram_id, game_id: g.id.replace(/-/g, '').substring(0, 8).toUpperCase(), stake: g.stake });
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
  if (!['user', 'agent', 'worker', 'promoter', 'admin'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }
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
    .select('id, stake, status, winner_prize, winner_first_name, winner_cartela, created_at, finished_at')
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

    // 7. Get user info
    const { data: user } = await supabase.from('users').select('username, first_name, balance').eq('telegram_id', telegramId).single();

    txList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ transactions: txList, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// ─── AGENTS & ROOMS ──────────────────────────────────────────────────────────

// GET /admin/agents — list all agents and their rooms
router.get('/agents', async (_req, res) => {
  try {
    const { data: agents, error: aErr } = await supabase
      .from('users')
      .select('id, telegram_id, username, first_name, role, status, main_balance, bonus_balance, total_wins, created_at')
      .eq('role', 'agent')
      .order('created_at', { ascending: false });

    if (aErr) throw aErr;

    const { data: rooms, error: rErr } = await supabase.from('rooms').select('*');
    if (rErr && !rErr.message.includes('does not exist')) throw rErr;

    const roomByAgent = new Map<string, any>();
    (rooms || []).forEach((r: any) => {
      if (r.agent_id) roomByAgent.set(r.agent_id, r);
    });

    const result = (agents || []).map((a: any) => ({
      ...a,
      room: roomByAgent.get(a.id) || roomByAgent.get(a.telegram_id) || null,
    }));

    res.json({ agents: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/agents/search/:telegramId — search user and their assigned room
router.get('/agents/search/:telegramId', async (req, res) => {
  try {
    const { data: user, error: uErr } = await supabase
      .from('users')
      .select('id, telegram_id, username, first_name, role, status, main_balance, bonus_balance, total_wins, created_at, inviter_id')
      .eq('telegram_id', req.params.telegramId)
      .maybeSingle();

    if (uErr) throw uErr;
    if (!user) {
      res.status(404).json({ error: 'User not found with this Telegram ID' });
      return;
    }

    // Check room by user.id (UUID) OR telegram_id
    let room = null;
    const { data: r1 } = await supabase
      .from('rooms')
      .select('*')
      .eq('agent_id', user.id)
      .maybeSingle();
    room = r1;

    if (!room) {
      const { data: r2 } = await supabase
        .from('rooms')
        .select('*')
        .eq('agent_id', req.params.telegramId)
        .maybeSingle();
      room = r2;
    }

    // If room or user has promoter, enrich with promoter details
    const effectivePromoterId = room?.promoter_id || user.inviter_id || null;
    let promoter_name: string | null = null;
    let promoter_telegram_id: string | null = null;
    if (effectivePromoterId) {
      const isUuidP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(effectivePromoterId);
      const { data: prUser } = await (isUuidP
        ? supabase.from('users').select('telegram_id, first_name, username').eq('id', effectivePromoterId)
        : supabase.from('users').select('telegram_id, first_name, username').eq('telegram_id', effectivePromoterId)
      ).maybeSingle();
      if (prUser) {
        promoter_name = prUser.first_name || prUser.username || null;
        promoter_telegram_id = prUser.telegram_id || null;
      }
    }

    res.json({
      user,
      room: room ? { ...room, promoter_name, promoter_telegram_id } : null,
      suggested_promoter_id: effectivePromoterId,
      suggested_promoter_name: promoter_name,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/agents/assign-room — assign or create a room for an agent
router.post('/agents/assign-room', async (req, res) => {
  try {
    const { telegramId, roomName, status, commission_rate, is_pinned, is_private, promoter_id, promoter_commission_rate } = req.body;
    if (!telegramId) {
      res.status(400).json({ error: 'telegramId is required' });
      return;
    }

    // Check user
    const { data: user, error: uErr } = await supabase
      .from('users')
      .select('id, telegram_id, username, first_name, role, inviter_id')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (uErr) throw uErr;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Ensure user has agent role (promote if user/worker)
    if (user.role !== 'agent' && user.role !== 'admin') {
      await supabase.from('users').update({ role: 'agent' }).eq('telegram_id', telegramId);
    }

    const assignedRoomName = roomName?.trim() || `${user.first_name || user.username || 'Agent'}'s Room`;
    const roomStatus = status || 'active';
    const commRate = commission_rate !== undefined ? Number(commission_rate) : 8;
    const isPinned = is_pinned !== undefined ? Boolean(is_pinned) : false;
    const isPrivate = is_private !== undefined ? Boolean(is_private) : false;
    const promoterCommRate = promoter_commission_rate !== undefined ? Number(promoter_commission_rate) : 3;
    // promoter_id: use provided promoter_id, or fallback to the agent's inviter_id (promoter UUID)
    let promoterId: string | null = null;
    if (promoter_id !== undefined && promoter_id !== null) {
      promoterId = typeof promoter_id === 'string' && promoter_id.trim() ? promoter_id.trim() : null;
    } else {
      promoterId = user.inviter_id || null;
    }

    // Check if room already exists by user.id (UUID) or telegramId
    let existingRoom = null;
    const { data: er1 } = await supabase.from('rooms').select('id').eq('agent_id', user.id).maybeSingle();
    existingRoom = er1;
    if (!existingRoom) {
      const { data: er2 } = await supabase.from('rooms').select('id').eq('agent_id', telegramId).maybeSingle();
      existingRoom = er2;
    }

    let roomResult = null;
    if (existingRoom) {
      // Update existing room with user.id (UUID) as agent_id
      const updateRoomPayload: any = {
        agent_id: user.id, // Store users.id UUID!
        room_name: assignedRoomName,
        agent_name: user.first_name || user.username || 'Agent',
        status: roomStatus,
        commission_rate: commRate,
        is_pinned: isPinned,
        is_private: isPrivate,
        promoter_commission_rate: promoterCommRate,
        updated_at: new Date().toISOString(),
      };
      if (promoterId !== null) updateRoomPayload.promoter_id = promoterId;
      const { data: updated, error: uErr } = await supabase
        .from('rooms')
        .update(updateRoomPayload)
        .eq('id', existingRoom.id)
        .select()
        .single();
      if (uErr) throw uErr;
      roomResult = updated;
    } else {
      // Insert new room with user.id (UUID) as agent_id
      const insertRoomPayload: any = {
        agent_id: user.id, // Store users.id UUID!
        room_name: assignedRoomName,
        agent_name: user.first_name || user.username || 'Agent',
        total_games: 0,
        status: roomStatus,
        commission_rate: commRate,
        is_pinned: isPinned,
        is_private: isPrivate,
        promoter_commission_rate: promoterCommRate,
        updated_at: new Date().toISOString(),
      };
      if (promoterId !== null) insertRoomPayload.promoter_id = promoterId;
      const { data: inserted, error: iErr } = await supabase
        .from('rooms')
        .insert(insertRoomPayload)
        .select()
        .single();
      if (iErr) throw iErr;
      roomResult = inserted;
    }

    res.json({ success: true, room: roomResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/rooms — get all rooms (enriched with real player count, agent balance, pinned status)
router.get('/rooms', async (_req, res) => {
  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enriched = await Promise.all(
      (rooms || []).map(async (r) => {
        let players = 0;
        let agent_balance = 0;
        let agent_telegram_id = '';
        let agent_first_name = r.agent_name || 'Agent';
        let promoter_name: string | null = null;
        let promoter_telegram_id: string | null = null;

        if (r.agent_id) {
          // Check if agent_id is UUID or telegram_id
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.agent_id);
          const { data: agUser } = await (isUuid
            ? supabase.from('users').select('id, telegram_id, main_balance, first_name, username').eq('id', r.agent_id)
            : supabase.from('users').select('id, telegram_id, main_balance, first_name, username').eq('telegram_id', r.agent_id)
          ).maybeSingle();

          if (agUser) {
            agent_balance = Number(agUser.main_balance || 0);
            agent_telegram_id = agUser.telegram_id;
            agent_first_name = agUser.first_name || agUser.username || agent_first_name;

            const { count } = await supabase
              .from('users')
              .select('id', { count: 'exact', head: true })
              .or(`inviter_id.eq.${agUser.id},inviter_id.eq.${agUser.telegram_id}`);
            players = count || 0;
          }
        }

        // Enrich promoter info
        if (r.promoter_id) {
          const isUuidP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.promoter_id);
          const { data: prUser } = await (isUuidP
            ? supabase.from('users').select('telegram_id, first_name, username').eq('id', r.promoter_id)
            : supabase.from('users').select('telegram_id, first_name, username').eq('telegram_id', r.promoter_id)
          ).maybeSingle();
          if (prUser) {
            promoter_name = prUser.first_name || prUser.username || null;
            promoter_telegram_id = prUser.telegram_id || null;
          }
        }

        return {
          ...r,
          commission_rate: r.commission_rate ?? 8,
          promoter_commission_rate: r.promoter_commission_rate ?? 3,
          is_pinned: Boolean(r.is_pinned),
          is_private: Boolean(r.is_private),
          total_players: players,
          agent_balance,
          agent_telegram_id,
          agent_name: agent_first_name,
          promoter_name,
          promoter_telegram_id,
        };
      })
    );

    // Pinned rooms ALWAYS come first
    enriched.sort((a, b) => {
      if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) {
        return b.is_pinned ? 1 : -1;
      }
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    res.json({ rooms: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/rooms/:id — update room details
router.put('/rooms/:id', async (req, res) => {
  try {
    const updates: any = { updated_at: new Date().toISOString() };
    if (req.body.room_name !== undefined) updates.room_name = req.body.room_name;
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.total_games !== undefined) updates.total_games = Number(req.body.total_games);
    if (req.body.commission_rate !== undefined) updates.commission_rate = Number(req.body.commission_rate);
    if (req.body.promoter_commission_rate !== undefined) updates.promoter_commission_rate = Number(req.body.promoter_commission_rate);
    if (req.body.is_pinned !== undefined) updates.is_pinned = Boolean(req.body.is_pinned);
    if (req.body.is_private !== undefined) updates.is_private = Boolean(req.body.is_private);
    if (req.body.promoter_id !== undefined) updates.promoter_id = req.body.promoter_id || null;

    const { data: room, error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/promoters — get all promoters with their linked rooms and metrics
router.get('/promoters', async (_req, res) => {
  try {
    const { data: promoters, error: pErr } = await supabase
      .from('users')
      .select('id, telegram_id, username, first_name, role, status, main_balance, bonus_balance, created_at')
      .eq('role', 'promoter')
      .order('created_at', { ascending: false });

    if (pErr) throw pErr;

    const enriched = await Promise.all(
      (promoters || []).map(async (p) => {
        // Find rooms directly assigned to this promoter
        const { data: rooms } = await supabase
          .from('rooms')
          .select('id, room_name, status, total_games, commission_rate, promoter_commission_rate, agent_name, agent_id')
          .or(`promoter_id.eq.${p.id},promoter_id.eq.${p.telegram_id}`);

        // Count users invited by this promoter
        const { count: invitedCount } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .or(`inviter_id.eq.${p.id},inviter_id.eq.${p.telegram_id}`);

        return {
          ...p,
          rooms: rooms || [],
          total_rooms: (rooms || []).length,
          total_invited: invitedCount || 0,
        };
      })
    );

    res.json({ promoters: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/promoters/assign-room — assign or link a room to a promoter with custom commission rate
router.post('/promoters/assign-room', async (req, res) => {
  try {
    const { roomId, promoterId, promoter_commission_rate } = req.body;
    if (!roomId) {
      res.status(400).json({ error: 'roomId is required' });
      return;
    }

    const updates: any = {
      promoter_id: promoterId ? String(promoterId).trim() : null,
      promoter_commission_rate: promoter_commission_rate !== undefined ? Number(promoter_commission_rate) : 3,
      updated_at: new Date().toISOString(),
    };

    const { data: room, error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', roomId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/rooms/:id — delete a room
router.delete('/rooms/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('rooms').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SUPPORT VIDEOS ─────────────────────────────────────────────────────────

// GET /admin/support-videos
router.get('/support-videos', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('support_videos')
      .select('*')
      .order('category')
      .order('sort_order')
      .order('created_at');
    if (error) throw error;
    res.json({ videos: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/support-videos
router.post('/support-videos', async (req, res) => {
  try {
    const { category, title, description, video_url, video_key, thumbnail_url, sort_order } = req.body;
    if (!category || !title || !video_url || !video_key) {
      res.status(400).json({ error: 'category, title, video_url and video_key are required' });
      return;
    }
    const { data, error } = await supabase
      .from('support_videos')
      .insert({ category, title, description: description || null, video_url, video_key, thumbnail_url: thumbnail_url || null, sort_order: sort_order ?? 0 })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, video: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/support-videos/:id
router.put('/support-videos/:id', async (req, res) => {
  try {
    const updates: any = { updated_at: new Date().toISOString() };
    const fields = ['category', 'title', 'description', 'video_url', 'video_key', 'thumbnail_url', 'is_active', 'sort_order'];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    const { data, error } = await supabase
      .from('support_videos')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, video: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/support-videos/:id
router.delete('/support-videos/:id', async (req, res) => {
  try {
    // Fetch the video_key first so we can clean up R2
    const { data: vid, error: fetchErr } = await supabase
      .from('support_videos')
      .select('video_key')
      .eq('id', req.params.id)
      .single();
    if (fetchErr) throw fetchErr;

    const { error } = await supabase.from('support_videos').delete().eq('id', req.params.id);
    if (error) throw error;

    // Best-effort R2 deletion
    if (vid?.video_key) {
      try {
        const { deleteFromR2 } = await import('../services/r2');
        await deleteFromR2(vid.video_key);
      } catch (_) {}
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FINANCIAL AUDIT & TRANSFERS ROUTES ─────────────────────────────────────

// GET /admin/audit — full financial summary (deposits, withdrawals, fees, reductions, worker transfers)
router.get('/audit', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;

    let dQuery = supabase.from('deposits').select('amount').eq('status', 'approved');
    let wQuery = supabase.from('withdrawals').select('amount, net_amount, fee_amount').eq('status', 'approved');

    if (from) { dQuery = dQuery.gte('created_at', from); wQuery = wQuery.gte('created_at', from); }
    if (to)   { dQuery = dQuery.lte('created_at', to);   wQuery = wQuery.lte('created_at', to); }

    const [dRes, wRes, redRes, trRes] = await Promise.all([
      dQuery,
      wQuery,
      supabase.from('audit_reductions').select('*').order('created_at', { ascending: false }),
      supabase.from('worker_transfers').select('*').order('created_at', { ascending: false }),
    ]);

    if (dRes.error) return res.status(500).json({ error: dRes.error.message });
    if (wRes.error) return res.status(500).json({ error: wRes.error.message });

    const totalDeposits   = (dRes.data || []).reduce((s, d) => s + Number(d.amount), 0);
    const totalWithdrawals = (wRes.data || []).reduce((s, w) => {
      const net = Number((w as any).net_amount);
      return s + (net > 0 ? net : Number(w.amount));
    }, 0);
    const totalFees = (wRes.data || []).reduce((s, w) => s + Number((w as any).fee_amount || 0), 0);
    const grossRequested = (wRes.data || []).reduce((s, w) => s + Number(w.amount), 0);

    const manualReductions = (redRes.data || []) as any[];
    const transfers = (trRes.data || []) as any[];

    // Approved transfers count as reductions towards net profit
    const approvedTransfers = transfers.filter(t => t.status === 'approved');
    const transfersReduced = approvedTransfers.reduce((s, t) => s + Number(t.amount), 0);
    const manualReduced = manualReductions.reduce((s, r) => s + Number(r.amount), 0);
    const totalReduced = transfersReduced + manualReduced;

    const netProfit    = totalDeposits - totalWithdrawals;
    const netRemaining = netProfit - totalReduced;

    res.json({
      totalDeposits,
      totalWithdrawals,   // actual payout (net_amount)
      grossRequested,     // full amount user requested
      totalFees,          // fees collected
      netProfit,          // deposits - actual payouts
      totalReduced,       // sum of manual reductions + approved transfers
      netRemaining,       // netProfit - totalReduced
      reductions: manualReductions,
      transfers,          // all worker transfer requests (pending, approved, rejected)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/audit/reduce — add a manual reduction entry (legacy/direct support)
router.post('/audit/reduce', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, note } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be positive.' });

    const reducedBy = req.telegramUser?.username || req.telegramUser?.first_name || 'admin';

    const { data, error } = await supabase
      .from('audit_reductions')
      .insert({ amount: amt, note: note?.trim() || '', reduced_by: reducedBy })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, entry: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/audit/reduce/:id — remove a reduction entry
router.delete('/audit/reduce/:id', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('audit_reductions').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/audit/worker-balance — worker sees live net remaining + transfer history
router.get('/audit/worker-balance', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const workerTelegramId = req.telegramUser!.id.toString();

    const [dRes, wRes, redRes, trRes] = await Promise.all([
      supabase.from('deposits').select('amount').eq('status', 'approved'),
      supabase.from('withdrawals').select('amount, net_amount').eq('status', 'approved'),
      supabase.from('audit_reductions').select('*').order('created_at', { ascending: false }),
      supabase.from('worker_transfers').select('*').order('created_at', { ascending: false }),
    ]);

    const totalDeposits    = (dRes.data || []).reduce((s, d) => s + Number(d.amount), 0);
    const totalWithdrawals = (wRes.data || []).reduce((s, w) => {
      const net = Number((w as any).net_amount);
      return s + (net > 0 ? net : Number(w.amount));
    }, 0);
    const netProfit      = totalDeposits - totalWithdrawals;

    const manualReductions = (redRes.data || []) as any[];
    const allTransfers = (trRes.data || []) as any[];

    // Only approved transfers reduce the balance
    const approvedTransfers = allTransfers.filter(t => t.status === 'approved');
    const transfersReduced = approvedTransfers.reduce((s, t) => s + Number(t.amount), 0);
    const manualReduced = manualReductions.reduce((s, r) => s + Number(r.amount), 0);
    const totalReduced = transfersReduced + manualReduced;

    const netRemaining = netProfit - totalReduced;

    // Filter transfers: workers see all transfers or their own
    const workerTransfers = allTransfers.filter(t => t.worker_telegram_id === workerTelegramId || (req as any).userRole === 'admin');

    res.json({
      netRemaining,
      netProfit,
      totalReduced,
      transfers: workerTransfers,
      reductions: manualReductions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MANAGER RECEIVING ACCOUNTS (CBE, BOA, Telebirr) ──────────────────────────

// GET /admin/manager-accounts — list manager accounts
router.get('/manager-accounts', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = (req as any).userRole === 'admin';
    let query = supabase.from('manager_accounts').select('*').order('created_at', { ascending: false });
    if (!isAdmin) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error && error.code !== 'PGRST205') return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/manager-accounts — add new manager account (Admin only)
router.post('/manager-accounts', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if ((req as any).userRole !== 'admin') return res.status(403).json({ error: 'Admin only.' });
    const { bank_type, account_name, account_number } = req.body;
    if (!bank_type || !account_name || !account_number) {
      return res.status(400).json({ error: 'Bank type, account name, and account number are required.' });
    }
    const { data, error } = await supabase
      .from('manager_accounts')
      .insert({
        bank_type: bank_type.toLowerCase().trim(),
        account_name: account_name.trim(),
        account_number: account_number.trim(),
        is_active: true
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, account: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/manager-accounts/:id — update manager account (Admin only)
router.put('/manager-accounts/:id', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if ((req as any).userRole !== 'admin') return res.status(403).json({ error: 'Admin only.' });
    const { id } = req.params;
    const { bank_type, account_name, account_number, is_active } = req.body;
    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (bank_type !== undefined) updatePayload.bank_type = bank_type.toLowerCase().trim();
    if (account_name !== undefined) updatePayload.account_name = account_name.trim();
    if (account_number !== undefined) updatePayload.account_number = account_number.trim();
    if (is_active !== undefined) updatePayload.is_active = Boolean(is_active);

    const { data, error } = await supabase
      .from('manager_accounts')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, account: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/manager-accounts/:id — delete manager account (Admin only)
router.delete('/manager-accounts/:id', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if ((req as any).userRole !== 'admin') return res.status(403).json({ error: 'Admin only.' });
    const { id } = req.params;
    const { error } = await supabase.from('manager_accounts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WORKER TRANSFERS (Transfer to Manager) ──────────────────────────────────

// POST /admin/worker-transfers — Worker submits transfer to manager
router.post('/worker-transfers', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { manager_account_id, amount, screenshot_url, note } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Valid positive amount required.' });
    if (!screenshot_url) return res.status(400).json({ error: 'Payment screenshot receipt is required.' });

    // Fetch the manager account details
    const { data: mAccount, error: mErr } = await supabase
      .from('manager_accounts')
      .select('*')
      .eq('id', manager_account_id)
      .single();

    if (mErr || !mAccount) return res.status(400).json({ error: 'Selected manager account not found.' });

    const workerTelegramId = req.telegramUser!.id.toString();
    const workerName = req.telegramUser?.first_name || 'Worker';

    const { data, error } = await supabase
      .from('worker_transfers')
      .insert({
        worker_telegram_id: workerTelegramId,
        worker_name: workerName,
        manager_account_id: mAccount.id,
        bank_type: mAccount.bank_type,
        account_name: mAccount.account_name,
        account_number: mAccount.account_number,
        amount: amt,
        screenshot_url: screenshot_url.trim(),
        note: (note || '').trim(),
        status: 'pending'
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Notify all admins via Telegram Bot
    try {
      const { data: admins } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('role', 'admin');

      const botToken = process.env.BOT_TOKEN;
      if (botToken && admins && admins.length > 0) {
        const safeWorkerName = (req.telegramUser?.username ? `@${req.telegramUser.username}` : (req.telegramUser?.first_name || 'Worker')).replace(/[_*[\]]/g, '\\$&');
        const bankName = BANK_NAMES[mAccount.bank_type] || mAccount.bank_type.toUpperCase();
        const safeBank = bankName.replace(/[_*[\]]/g, '\\$&');
        const safeHolder = mAccount.account_name.replace(/[_*[\]]/g, '\\$&');
        const safeAcc = mAccount.account_number.replace(/[_*[\]]/g, '\\$&');
        const safeId = (data.id || '').replace(/[_*[\]]/g, '\\$&');
        const safeNote = (note || '').trim().replace(/[_*[\]]/g, '\\$&');

        const msg =
          `⚡ *New Worker Balance Transfer Request!*\n\n` +
          `👤 *Worker:* ${safeWorkerName}\n` +
          `💰 *Amount:* *${amt.toLocaleString()} ETB*\n` +
          `🏦 *Method:* ${safeBank}\n` +
          `📛 *Holder:* ${safeHolder}\n` +
          `🔢 *Account:* \`${safeAcc}\`\n` +
          (safeNote ? `📝 *Note:* ${safeNote}\n` : '') +
          `\n📋 *Ref:* \`${safeId.slice(0, 8).toUpperCase()}\`\n` +
          `👉 Check *Admin Dashboard → Financial Audit*`;

        for (const a of admins) {
          if (!a.telegram_id) continue;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: a.telegram_id, text: msg, parse_mode: 'Markdown' }),
          }).catch(() => {});
        }
      }
    } catch (notifyErr) {
      console.error('Worker transfer admin notification error:', notifyErr);
    }

    res.json({ success: true, transfer: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/worker-transfers — List worker transfers (Admin sees all; worker sees own)
router.get('/worker-transfers', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = (req as any).userRole === 'admin';
    const { status } = req.query;
    let query = supabase.from('worker_transfers').select('*').order('created_at', { ascending: false });

    if (!isAdmin) {
      query = query.eq('worker_telegram_id', req.telegramUser!.id.toString());
    }
    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error && error.code !== 'PGRST205') return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/worker-transfers/:id/review — Admin approves or rejects worker transfer
router.put('/worker-transfers/:id/review', validateTelegramAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if ((req as any).userRole !== 'admin') return res.status(403).json({ error: 'Admin only.' });
    const { id } = req.params;
    const { action } = req.body;
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: 'Action must be approve or reject.' });
    }

    const reviewerName = req.telegramUser?.first_name || req.telegramUser?.username || 'Admin';

    const { data, error } = await supabase
      .from('worker_transfers')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Notify worker of approval / rejection
    try {
      const botToken = process.env.BOT_TOKEN;
      if (botToken && data?.worker_telegram_id) {
        const isApproved = action === 'approve';
        const msg = isApproved
          ? `✅ *Balance Transfer Approved!*\n\n💰 *Amount:* *${Number(data.amount).toLocaleString()} ETB*\n🏦 *Account:* ${data.account_name} (\`${data.account_number}\`)\n\n✨ Your manager transfer has been approved and deducted from your net balance.`
          : `❌ *Balance Transfer Rejected*\n\n💰 *Amount:* *${Number(data.amount).toLocaleString()} ETB*\nYour balance transfer request was rejected by admin. Please contact manager for more info.`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: data.worker_telegram_id, text: msg, parse_mode: 'Markdown' }),
        }).catch(() => {});
      }
    } catch (notifyErr) {
      console.error('Worker notification error:', notifyErr);
    }

    res.json({ success: true, transfer: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


