import { Router, Request, Response, NextFunction } from 'express';
import { AuthRequest, validateTelegramAuth, hashPassword } from '../middleware/auth';
import { supabase } from '../services/supabase';
import { getWithdrawalFeeSettings, saveWithdrawalFeeSettings, calculateWithdrawalFee } from '../services/withdrawalFee';
import { getAgencyWithdrawalFeeSettings, saveAgencyWithdrawalFeeSettings, calculateAgencyWithdrawalFee } from '../services/agencyWithdrawalFee';
import { checkAndAutoPostProofs } from './channelProofs';
import { systemPlayerService } from '../services/systemPlayerService';
import { invalidatePoolsCache } from './bingo';

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
  else if (path.startsWith('/profit-report')) allowed = true; // Allow workers to view profit report
  else if (path.startsWith('/audit/worker-balance')) allowed = true; // Workers see net remaining balance
  else if (path.startsWith('/worker-transfers') && !path.includes('/review')) allowed = true; // Workers can submit/view transfers
  else if (path.startsWith('/manager-accounts') && req.method === 'GET') allowed = true; // Workers view manager accounts
  else if (path.startsWith('/games') && perms.games) allowed = true;
  else if (path.startsWith('/system-pro')) allowed = true;
  
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
  const [dRes, wRes, pRes] = await Promise.all([
    supabase.from('deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('withdrawals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('pro_upgrade_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  res.json({
    pendingDeposits: dRes.count ?? 0,
    pendingWithdrawals: wRes.count ?? 0,
    pendingSystemPro: pRes.count ?? 0,
  });
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

    const firstDepositPct = parseFloat(getSetting('first_deposit_bonus_pct', '7') as string) / 100;
    const secondDepositPct = parseFloat(getSetting('second_deposit_bonus_pct', '3') as string) / 100;
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
  try {
    const [depRes, withRes, trRes, postedDepRow, postedWithRow, appDepsRes, appWithsRes, proReqRes] = await Promise.all([
      supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('worker_transfers').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('settings').select('value').eq('key', 'posted_deposit_ids').single(),
      supabase.from('settings').select('value').eq('key', 'posted_withdraw_ids').single(),
      supabase.from('deposits').select('id').eq('status', 'approved').limit(100),
      supabase.from('withdrawals').select('id').eq('status', 'approved').limit(100),
      supabase.from('pro_upgrade_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    let postedDepIds: string[] = [];
    try {
      postedDepIds = JSON.parse(postedDepRow.data?.value || '[]');
      if (!Array.isArray(postedDepIds)) postedDepIds = [];
    } catch {
      postedDepIds = [];
    }

    let postedWithIds: string[] = [];
    try {
      postedWithIds = JSON.parse(postedWithRow.data?.value || '[]');
      if (!Array.isArray(postedWithIds)) postedWithIds = [];
    } catch {
      postedWithIds = [];
    }

    const unpostedProofDeposits = (appDepsRes.data || []).filter(d => !postedDepIds.includes(d.id)).length;
    const unpostedProofWithdrawals = (appWithsRes.data || []).filter(w => !postedWithIds.includes(w.id)).length;
      
    res.json({ 
      pendingDeposits: depRes.count || 0,
      pendingWithdrawals: withRes.count || 0,
      pendingTransfers: trRes.count || 0,
      pendingSystemPro: proReqRes.count || 0,
      unpostedProofDeposits,
      unpostedProofWithdrawals,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching stats' });
  }
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

// Agency & Promoter withdrawal fee settings
router.get('/agency-withdrawal-fee', async (req, res) => {
  try {
    const settings = await getAgencyWithdrawalFeeSettings();
    res.json({ ok: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/agency-withdrawal-fee', async (req, res) => {
  try {
    const updated = await saveAgencyWithdrawalFeeSettings(req.body);
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

  let dQuery = supabase.from('deposits').select('amount, created_at').eq('status', 'approved');
  // Select net_amount so we can show actual payout (after fee) for withdrawals
  let wQuery = supabase.from('withdrawals').select('amount, net_amount, fee_amount, created_at').eq('status', 'approved');

  if (from) {
    dQuery = dQuery.gte('created_at', from as string);
    wQuery = wQuery.gte('created_at', from as string);
  }
  if (to) {
    dQuery = dQuery.lte('created_at', to as string);
    wQuery = wQuery.lte('created_at', to as string);
  }

  const [dRes, wRes] = await Promise.all([dQuery, wQuery]);

  if (dRes.error) return res.status(500).json({ error: dRes.error.message });
  if (wRes.error) return res.status(500).json({ error: wRes.error.message });

  const deposits = dRes.data || [];
  const withdrawals = wRes.data || [];

  const totalDeposits = deposits.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const totalWithdrawals = withdrawals.reduce((sum: number, w: any) => {
    const netAmt = Number((w as any).net_amount);
    const amt = Number(w.amount || 0);
    return sum + (netAmt > 0 ? netAmt : amt);
  }, 0);
  const totalFees = withdrawals.reduce((sum: number, w: any) => sum + Number((w as any).fee_amount || 0), 0);
  const netProfit = totalDeposits - totalWithdrawals;

  // Build daily buckets for chart
  const now = new Date();
  const DAY_MS = 86400000;
  let numDays = 7;
  let endDate = now;

  if (to) {
    const pt = new Date(to as string);
    if (!isNaN(pt.getTime())) endDate = pt;
  }

  if (from && to) {
    const start = new Date(from as string);
    const end = new Date(to as string);
    const diffDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    if (diffDays <= 1) {
      numDays = 7;
    } else {
      numDays = Math.min(30, Math.max(7, diffDays + 1));
    }
  } else {
    numDays = 14;
  }

  const chartBuckets: Record<string, { deposits: number; withdrawals: number; net_profit: number; deposit_count: number; withdrawal_count: number }> = {};
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(endDate.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    chartBuckets[key] = { deposits: 0, withdrawals: 0, net_profit: 0, deposit_count: 0, withdrawal_count: 0 };
  }

  deposits.forEach((d: any) => {
    const key = d.created_at?.slice(0, 10);
    if (key && chartBuckets[key]) {
      const amt = Number(d.amount || 0);
      chartBuckets[key].deposits += amt;
      chartBuckets[key].net_profit += amt;
      chartBuckets[key].deposit_count++;
    }
  });

  withdrawals.forEach((w: any) => {
    const key = w.created_at?.slice(0, 10);
    if (key && chartBuckets[key]) {
      const netAmt = Number((w as any).net_amount);
      const amt = Number(w.amount || 0);
      const payout = netAmt > 0 ? netAmt : amt;
      chartBuckets[key].withdrawals += payout;
      chartBuckets[key].net_profit -= payout;
      chartBuckets[key].withdrawal_count++;
    }
  });

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const chart_data = Object.entries(chartBuckets).map(([date, vals]) => {
    const d = new Date(date);
    return {
      date,
      label: DAYS[d.getDay()],
      deposits: Math.round(vals.deposits * 100) / 100,
      withdrawals: Math.round(vals.withdrawals * 100) / 100,
      net_profit: Math.round(vals.net_profit * 100) / 100,
      deposit_count: vals.deposit_count,
      withdrawal_count: vals.withdrawal_count,
    };
  });

  res.json({
    totalDeposits,
    totalWithdrawals,
    totalFees,
    netProfit,
    depositCount: deposits.length,
    withdrawalCount: withdrawals.length,
    chart_data,
  });
});

// ─── USER MANAGEMENT ──────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  const { search = '', page = '1', limit = '20', role = 'all' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(50, parseInt(limit as string));
  const offset = (pageNum - 1) * limitNum;

  let query = supabase
    .from('users')
    .select('id, telegram_id, username, first_name, role, status, main_balance, bonus_balance, total_wins, created_at', { count: 'exact' });

  if (role && role !== 'all' && ['user', 'agent', 'worker', 'promoter', 'admin'].includes(role as string)) {
    query = query.eq('role', role);
  }

  if (search) {
    query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,telegram_id.eq.${search}`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limitNum - 1);

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

router.put('/users/:telegramId/reset-password', async (req, res) => {
  const { new_password } = req.body || {};
  const safePassword = (new_password || '').toString().trim();
  if (!safePassword || safePassword.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters • የይለፍ ቃል ቢያንስ 4 ፊደል መሆን አለበት' });
    return;
  }

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, telegram_id, username, first_name')
    .eq('telegram_id', req.params.telegramId)
    .maybeSingle();

  if (userErr || !user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const password_hash = hashPassword(safePassword);
  const { error: updateErr } = await supabase
    .from('users')
    .update({ password_hash })
    .eq('telegram_id', req.params.telegramId);

  if (updateErr) {
    res.status(500).json({ error: updateErr.message });
    return;
  }

  // Notify user on Telegram if applicable
  try {
    const msg = `🔐 *Password Reset by Admin*\n\nYour account password has been updated by administrator.\n\n🔑 *New Password:* \`${safePassword}\`\n🆔 *Telegram ID:* \`${user.telegram_id}\`\n\nYou can use this Telegram ID and password to log in on the Web / PWA app!`;
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: user.telegram_id, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) {
    // Non-blocking notification
  }

  res.json({ success: true, message: `Password reset successfully to: ${safePassword}` });
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

// POST /admin/purge-finished-games — immediately purge all finished games to reclaim database storage
router.post('/purge-finished-games', validateTelegramAuth, requireAdmin, async (_req, res) => {
  try {
    const { data: deleted, error } = await supabase
      .from('bingo_games')
      .delete()
      .eq('status', 'finished')
      .select('id');
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true, purged_count: deleted?.length || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

// GET /admin/room-ranking — advanced room analytics ranked by commission, games, players
router.get('/room-ranking', validateTelegramAuth, requireAdmin, async (req, res) => {
  const period = (req.query.period as string) || 'week';

  let startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  let endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const now = new Date();

  switch (period) {
    case 'today': break;
    case 'week':
      startDate.setDate(now.getDate() - 7);
      endDate = now;
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      endDate = now;
      break;
    case 'all':
      startDate = new Date(0);
      endDate = now;
      break;
    default: break;
  }

  try {
    // 1. Fetch all rooms
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, room_name, status, commission_rate, promoter_commission_rate, agent_name, total_games, created_at, is_pinned');

    // 2. Fetch finished games in period
    const { data: periodGames } = await supabase
      .from('bingo_games')
      .select('id, room_id, stake, winner_prize, total_players, created_at, finished_at')
      .eq('status', 'finished')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .limit(50000);

    // 3. Fetch active players per room right now
    const { data: activeGames } = await supabase
      .from('bingo_games')
      .select('room_id, total_players')
      .in('status', ['waiting', 'calling']);

    const activePlayers: Record<string, number> = {};
    (activeGames || []).forEach((g: any) => {
      if (g.room_id) activePlayers[g.room_id] = (activePlayers[g.room_id] || 0) + Number(g.total_players || 0);
    });

    // 4. Fetch player counts for period games
    const periodGameIds = (periodGames || []).map((g: any) => g.id);
    let playerCountMap: Record<string, number> = {};
    let uniquePlayerMap: Record<string, Set<string>> = {};
    if (periodGameIds.length > 0) {
      const { data: bplayers } = await supabase
        .from('bingo_players')
        .select('game_id, telegram_id')
        .in('game_id', periodGameIds)
        .limit(100000);
      (bplayers || []).forEach((p: any) => {
        playerCountMap[p.game_id] = (playerCountMap[p.game_id] || 0) + 1;
        if (!uniquePlayerMap[p.game_id]) uniquePlayerMap[p.game_id] = new Set();
        if (p.telegram_id) uniquePlayerMap[p.game_id].add(p.telegram_id);
      });
    }

    // 5. Build per-room stats
    const roomMap: Record<string, any> = {};
    (rooms || []).forEach((r: any) => {
      roomMap[r.id] = {
        id: r.id,
        room_name: r.room_name,
        status: r.status,
        agent_name: r.agent_name || null,
        commission_rate: Number(r.commission_rate ?? 7),
        promoter_commission_rate: Number(r.promoter_commission_rate ?? 3),
        total_games_all_time: Number(r.total_games || 0),
        is_pinned: Boolean(r.is_pinned),
        created_at: r.created_at,
        // period stats
        period_games: 0,
        period_pot: 0,
        period_room_commission: 0,
        period_promoter_commission: 0,
        period_platform_commission: 0,
        period_winner_prizes: 0,
        active_players: activePlayers[r.id] || 0,
      };
    });

    // 6. Accumulate period stats per room
    (periodGames || []).forEach((g: any) => {
      const room = roomMap[g.room_id];
      if (!room) return;
      const cartelasCount = playerCountMap[g.id] || Number(g.total_players || 0);
      const uniqueCount = uniquePlayerMap[g.id]?.size || Number(g.total_players || 0);
      const stake = Number(g.stake || 0);
      const pot = cartelasCount * stake;
      const prize = Number(g.winner_prize || 0);

      let roomComm = 0;
      let promoComm = 0;
      let platComm = 0;

      // In Bingo, commission (20% total house cut) is ONLY charged when unique players >= 3!
      // If unique players < 3, 100% of the pot went to the winner (0% platform fee, 0% room, 0% promoter).
      if (uniqueCount >= 3) {
        const totalCut = Math.max(0, pot - prize);
        const commRate = Number(room.commission_rate ?? 7);
        const promoRate = Number(room.promoter_commission_rate ?? 3);
        
        roomComm = Math.min(totalCut, (pot * commRate) / 100);
        promoComm = Math.min(Math.max(0, totalCut - roomComm), (pot * promoRate) / 100);
        platComm = Math.max(0, totalCut - roomComm - promoComm);
      }

      room.period_games += 1;
      room.period_pot += pot;
      room.period_room_commission += roomComm;
      room.period_promoter_commission += promoComm;
      room.period_platform_commission += platComm;
      room.period_winner_prizes += prize;
    });

    // 7. Round and rank
    const rankedRooms = Object.values(roomMap).map((r: any) => ({
      ...r,
      period_pot: Math.round(r.period_pot * 100) / 100,
      period_room_commission: Math.round(r.period_room_commission * 100) / 100,
      period_promoter_commission: Math.round(r.period_promoter_commission * 100) / 100,
      period_platform_commission: Math.round(r.period_platform_commission * 100) / 100,
      period_winner_prizes: Math.round(r.period_winner_prizes * 100) / 100,
    })).sort((a, b) => {
      // Rank by: period_room_commission DESC → active_players DESC → total_games DESC
      const commDiff = b.period_room_commission - a.period_room_commission;
      if (Math.abs(commDiff) > 0.001) return commDiff;
      const playerDiff = b.active_players - a.active_players;
      if (playerDiff !== 0) return playerDiff;
      return b.total_games_all_time - a.total_games_all_time;
    });

    // 8. Grand totals
    const totals = rankedRooms.reduce((acc, r) => ({
      total_games: acc.total_games + r.period_games,
      total_pot: acc.total_pot + r.period_pot,
      total_room_commission: acc.total_room_commission + r.period_room_commission,
      total_promoter_commission: acc.total_promoter_commission + r.period_promoter_commission,
      total_platform_commission: acc.total_platform_commission + r.period_platform_commission,
    }), { total_games: 0, total_pot: 0, total_room_commission: 0, total_promoter_commission: 0, total_platform_commission: 0 });

    res.json({
      rooms: rankedRooms,
      totals: {
        total_games: totals.total_games,
        total_pot: Math.round(totals.total_pot * 100) / 100,
        total_room_commission: Math.round(totals.total_room_commission * 100) / 100,
        total_promoter_commission: Math.round(totals.total_promoter_commission * 100) / 100,
        total_platform_commission: Math.round(totals.total_platform_commission * 100) / 100,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
    const commRate = commission_rate !== undefined ? Number(commission_rate) : 10;
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
        stakes: (req.body.stakes && Array.isArray(req.body.stakes)) ? req.body.stakes : undefined,
        updated_at: new Date().toISOString(),
      };
      if (req.body.system_players_risk_percent !== undefined) {
        updateRoomPayload.system_players_risk_percent = Math.max(0, Math.min(100, Number(req.body.system_players_risk_percent)));
      }
      if (req.body.system_players_monthly_price !== undefined) {
        updateRoomPayload.system_players_monthly_price = Math.max(0, Number(req.body.system_players_monthly_price));
      }
      if (!updateRoomPayload.stakes) delete updateRoomPayload.stakes;
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
      // Calculate next sequential room_number (1, 2, 3...)
      let nextRoomNumber = 1;
      try {
        const { data: maxRoom } = await supabase
          .from('rooms')
          .select('room_number')
          .order('room_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxRoom?.room_number) {
          nextRoomNumber = Number(maxRoom.room_number) + 1;
        }
      } catch (e) {
        console.warn('Could not determine max room_number:', e);
      }

      // Insert new room with user.id (UUID) as agent_id
      const insertRoomPayload: any = {
        agent_id: user.id, // Store users.id UUID!
        room_name: assignedRoomName,
        room_number: nextRoomNumber,
        agent_name: user.first_name || user.username || 'Agent',
        total_games: 0,
        status: roomStatus,
        commission_rate: commRate,
        is_pinned: isPinned,
        is_private: isPrivate,
        promoter_commission_rate: promoterCommRate,
        system_players_risk_percent: req.body.system_players_risk_percent !== undefined ? Math.max(0, Math.min(100, Number(req.body.system_players_risk_percent))) : 25,
        system_players_monthly_price: req.body.system_players_monthly_price !== undefined ? Math.max(0, Number(req.body.system_players_monthly_price)) : 1000,
        updated_at: new Date().toISOString(),
      };
      if (promoterId !== null) insertRoomPayload.promoter_id = promoterId;

      let inserted = null;
      const { data: iData, error: iErr } = await supabase
        .from('rooms')
        .insert(insertRoomPayload)
        .select()
        .single();

      if (iErr) {
        // Fallback in case room_number column is not in DB yet
        delete insertRoomPayload.room_number;
        const { data: fbData, error: fbErr } = await supabase
          .from('rooms')
          .insert(insertRoomPayload)
          .select()
          .single();
        if (fbErr) throw fbErr;
        inserted = fbData;
      } else {
        inserted = iData;
      }
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
          commission_rate: r.commission_rate ?? 10,
          promoter_commission_rate: r.promoter_commission_rate ?? 3,
          is_pinned: Boolean(r.is_pinned),
          is_private: Boolean(r.is_private),
          system_players_risk_percent: Number(r.system_players_risk_percent ?? 25),
          system_players_monthly_price: Number(r.system_players_monthly_price ?? 1000),
          system_players_enabled: Boolean(r.system_players_enabled),
          system_players_pro_level: Number(r.system_players_pro_level || 0),
          total_players: players,
          agent_balance,
          agent_telegram_id,
          agent_name: agent_first_name,
          promoter_name,
          promoter_telegram_id,
        };
      })
    );

    // Pinned rooms ALWAYS come first, then sequential room_number (1, 2, 3...)
    enriched.sort((a, b) => {
      if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) {
        return b.is_pinned ? 1 : -1;
      }
      if (a.room_number !== undefined && b.room_number !== undefined && a.room_number !== b.room_number) {
        return Number(a.room_number) - Number(b.room_number);
      }
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
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
    if (req.body.room_number !== undefined) updates.room_number = Number(req.body.room_number);
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.total_games !== undefined) updates.total_games = Number(req.body.total_games);
    if (req.body.commission_rate !== undefined) updates.commission_rate = Number(req.body.commission_rate);
    if (req.body.promoter_commission_rate !== undefined) updates.promoter_commission_rate = Number(req.body.promoter_commission_rate);
    if (req.body.is_pinned !== undefined) updates.is_pinned = Boolean(req.body.is_pinned);
    if (req.body.is_private !== undefined) updates.is_private = Boolean(req.body.is_private);
    if (req.body.promoter_id !== undefined) updates.promoter_id = req.body.promoter_id || null;
    if (req.body.stakes !== undefined && Array.isArray(req.body.stakes)) updates.stakes = req.body.stakes;
    if (req.body.system_players_risk_percent !== undefined) {
      updates.system_players_risk_percent = Math.max(0, Math.min(100, Number(req.body.system_players_risk_percent)));
    }
    if (req.body.system_players_monthly_price !== undefined) {
      updates.system_players_monthly_price = Math.max(0, Number(req.body.system_players_monthly_price));
    }

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

    // Also get settings for home popup
    const { data: settingsData } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['home_popup_video_id', 'home_popup_video_views', 'home_popup_video_enabled']);

    const settingsMap: Record<string, string> = {};
    (settingsData || []).forEach((r: any) => { settingsMap[r.key] = r.value; });

    const activePopupId = settingsMap['home_popup_video_id'];
    const activePopupViews = parseInt(settingsMap['home_popup_video_views'] || '1', 10);
    const popupEnabled = settingsMap['home_popup_video_enabled'] !== 'false';

    const augmented = (data || []).map((v: any) => {
      const isHomePopup = activePopupId
        ? (v.id === activePopupId && popupEnabled)
        : (v.show_on_home ?? (v.category === 'how_to_use'));

      const maxViews = (activePopupId && v.id === activePopupId)
        ? activePopupViews
        : (typeof v.popup_max_views === 'number' ? v.popup_max_views : 1);

      return {
        ...v,
        show_on_home: isHomePopup,
        popup_max_views: maxViews,
      };
    });

    res.json({ videos: augmented });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/support-videos
router.post('/support-videos', async (req, res) => {
  try {
    const { category, title, description, video_url, video_key, thumbnail_url, sort_order, show_on_home, popup_max_views } = req.body;
    if (!category || !title || !video_url || !video_key) {
      res.status(400).json({ error: 'category, title, video_url and video_key are required' });
      return;
    }

    const isShowOnHome = show_on_home !== undefined ? Boolean(show_on_home) : (category === 'how_to_use');
    const parsedViews = popup_max_views !== undefined ? Math.max(1, parseInt(popup_max_views, 10) || 1) : 1;

    const insertData: any = {
      category,
      title,
      description: description || null,
      video_url,
      video_key,
      thumbnail_url: thumbnail_url || null,
      sort_order: sort_order ?? 0,
      show_on_home: isShowOnHome,
      popup_max_views: parsedViews,
    };

    let savedVideo: any = null;
    const { data, error } = await supabase
      .from('support_videos')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === '23514') {
        res.status(400).json({
          error: `Category '${category}' is blocked by database check constraint. Please run migration 037 to enable '${category}' in public.support_videos.`,
        });
        return;
      }
      // If error is missing column (e.g. 42703), retry without show_on_home & popup_max_views
      if (error.code === '42703' || String(error.message).includes('column')) {
        delete insertData.show_on_home;
        delete insertData.popup_max_views;
        const retry = await supabase.from('support_videos').insert(insertData).select().single();
        if (retry.error) throw retry.error;
        savedVideo = retry.data;
      } else {
        throw error;
      }
    } else {
      savedVideo = data;
    }

    // Always update settings table with home popup preference so it works immediately
    if (savedVideo && isShowOnHome) {
      await supabase.from('settings').upsert([
        { key: 'home_popup_video_id', value: String(savedVideo.id) },
        { key: 'home_popup_video_views', value: String(parsedViews) },
        { key: 'home_popup_video_enabled', value: 'true' }
      ], { onConflict: 'key' });
    }

    res.json({ success: true, video: savedVideo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/support-videos/:id
router.put('/support-videos/:id', async (req, res) => {
  try {
    const updates: any = { updated_at: new Date().toISOString() };
    const fields = ['category', 'title', 'description', 'video_url', 'video_key', 'thumbnail_url', 'is_active', 'sort_order', 'show_on_home', 'popup_max_views'];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    let savedVideo: any = null;
    const { data, error } = await supabase
      .from('support_videos')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23514') {
        res.status(400).json({
          error: `Category update blocked by database check constraint. Please run migration 037 in Supabase SQL editor.`,
        });
        return;
      }
      if (error.code === '42703' || String(error.message).includes('column')) {
        delete updates.show_on_home;
        delete updates.popup_max_views;
        const retry = await supabase.from('support_videos').update(updates).eq('id', req.params.id).select().single();
        if (retry.error) throw retry.error;
        savedVideo = retry.data;
      } else {
        throw error;
      }
    } else {
      savedVideo = data;
    }

    // Sync settings table for home popup
    if (req.body.show_on_home !== undefined || req.body.popup_max_views !== undefined) {
      const isShowOnHome = req.body.show_on_home !== false;
      const parsedViews = req.body.popup_max_views !== undefined ? Math.max(1, parseInt(req.body.popup_max_views, 10) || 1) : 1;
      if (isShowOnHome) {
        await supabase.from('settings').upsert([
          { key: 'home_popup_video_id', value: String(req.params.id) },
          { key: 'home_popup_video_views', value: String(parsedViews) },
          { key: 'home_popup_video_enabled', value: 'true' }
        ], { onConflict: 'key' });
      } else {
        await supabase.from('settings').upsert([
          { key: 'home_popup_video_enabled', value: 'false' }
        ], { onConflict: 'key' });
      }
    }

    res.json({ success: true, video: savedVideo });
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

    // Clean up settings if this was the active home popup video
    await supabase.from('settings').delete().eq('key', 'home_popup_video_id').eq('value', String(req.params.id));

    // Best-effort R2 deletion
    if (vid?.video_key) {
      try {
        const { deleteFromR2 } = await import('../services/r2');
        await deleteFromR2(vid.video_key);
      } catch (_) {}
    }

    res.json({ success: true });

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

// ── SYSTEM PRO UPGRADE REQUESTS (ADMIN / WORKER) ───────────────────────────
router.get('/system-pro/requests', async (req: AuthRequest, res: Response) => {
  try {
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

router.get('/system-pro/pending-count', async (_req: AuthRequest, res: Response) => {
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

router.post('/system-pro/requests/:id/review', async (req: AuthRequest, res: Response) => {
  try {
    const requestId = req.params.id ? req.params.id.trim() : '';
    const { action, reason } = req.body;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!requestId || !isUuid.test(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID format' });
    }

    const telegramId = req.telegramUser?.id?.toString() || '';
    let reviewerUuid: string | null = null;
    if (req.pwaUser?.id && isUuid.test(req.pwaUser.id)) {
      reviewerUuid = req.pwaUser.id;
    } else if (telegramId) {
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegramId)
        .maybeSingle();
      if (dbUser?.id && isUuid.test(dbUser.id)) {
        reviewerUuid = dbUser.id;
      }
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
      // 1. Mark request as approved (reviewed_by column is UUID type)
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

        // 3. Ensure 1,000 bots are seeded in the database for this room
        await systemPlayerService.seedSystemPlayersPool(request.room_id, 1000);
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

// ─── HDASE BINGO & ROOM SYSTEM PLAYER MANAGEMENT ─────────────────────────────
const HDASE_ROOM_ID = 'd7c9114a-e112-426f-8f9b-13c00050279c';
const HDASE_AGENT_ID = '5b3ac1f4-6a29-4929-9fc4-5043c0118572';

// GET /admin/rooms/all — list all rooms for admin room-management switcher
router.get('/rooms/all', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const { data: allRooms, error } = await supabase
      .from('rooms')
      .select('id, room_name, status, is_pinned, stakes, system_players_enabled, system_players_pro_level, system_players_pro_expires_at')
      .order('is_pinned', { ascending: false })
      .order('room_name', { ascending: true });
    if (error) throw error;
    res.json({ rooms: allRooms || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/hdase-room — get room details, bot pool, and live games by roomId (default: HDASE BINGO)
router.get('/hdase-room', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const targetRoomId = (req.query.roomId || req.query.room_id || HDASE_ROOM_ID) as string;
    let { data: room, error: rErr } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', targetRoomId)
      .maybeSingle();

    if (!room && (targetRoomId === HDASE_ROOM_ID || targetRoomId.toLowerCase().includes('hdase'))) {
      const { data: fallback } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_name', 'HDASE BINGO')
        .maybeSingle();
      room = fallback;
    }

    if (!room) {
      if (targetRoomId !== HDASE_ROOM_ID) {
        return res.status(404).json({ error: 'Room not found' });
      }

      // Resolve admin user from users table
      const { data: adminUser } = await supabase
        .from('users')
        .select('id, first_name, username')
        .or(`id.eq.${HDASE_AGENT_ID},role.eq.admin`)
        .limit(1)
        .maybeSingle();

      const targetAdminId = adminUser?.id || HDASE_AGENT_ID;
      const targetAdminName = adminUser?.first_name || adminUser?.username || 'Admin';

      // Auto-initialize official room if not in DB
      const { data: newRoom, error: createErr } = await supabase
        .from('rooms')
        .insert({
          id: HDASE_ROOM_ID,
          room_name: 'HDASE BINGO',
          room_number: 1,
          agent_id: targetAdminId,
          agent_name: targetAdminName,
          status: 'active',
          is_pinned: true,
          is_private: false,
          stakes: [5, 10, 20, 35],
          system_players_enabled: true,
          system_players_pro_level: 1,
          system_players_risk_percent: 25,
          waiter_players_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createErr) throw createErr;
      room = newRoom;
    } else if (room.id === HDASE_ROOM_ID) {
      // Ensure agent_id is synced to admin user id for official platform room
      const { data: adminUser } = await supabase
        .from('users')
        .select('id, first_name, username')
        .or(`id.eq.${HDASE_AGENT_ID},role.eq.admin`)
        .limit(1)
        .maybeSingle();

      const targetAdminId = adminUser?.id || HDASE_AGENT_ID;
      const targetAdminName = adminUser?.first_name || adminUser?.username || 'Admin';

      if (room.agent_id !== targetAdminId) {
        await supabase
          .from('rooms')
          .update({
            agent_id: targetAdminId,
            agent_name: targetAdminName,
            system_players_pro_level: 1,
          })
          .eq('id', room.id);
        room.agent_id = targetAdminId;
        room.agent_name = targetAdminName;
      }
    }

    const roomId = room.id;

    // Fetch bot pool count for this room
    const { count: botCount } = await supabase
      .from('system_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);

    // If pool is empty, auto-seed in background
    if (!botCount || botCount < 100) {
      systemPlayerService.seedSystemPlayersPool(roomId, 1000).catch(console.error);
    }

    // Fetch active games for HDASE BINGO room
    const { data: activeGames } = await supabase
      .from('bingo_games')
      .select('id, stake, status, total_players, prize_pool, called_numbers, start_at, created_at')
      .eq('room_id', roomId)
      .in('status', ['waiting', 'calling'])
      .order('created_at', { ascending: false });

    // Deduplicate: Keep strictly 1 latest active game per stake (prefer 'calling' if multiple, else newest)
    const gamesByStake = new Map<number, any>();
    const duplicateWaitersToFinish: string[] = [];

    for (const g of (activeGames || [])) {
      const s = Number(g.stake);
      const existing = gamesByStake.get(s);
      if (!existing) {
        gamesByStake.set(s, g);
      } else if (existing.status === 'waiting' && g.status === 'calling') {
        duplicateWaitersToFinish.push(existing.id);
        gamesByStake.set(s, g);
      } else if (g.status === 'waiting') {
        duplicateWaitersToFinish.push(g.id);
      }
    }

    if (duplicateWaitersToFinish.length > 0) {
      await supabase.from('bingo_games').update({ status: 'finished' }).in('id', duplicateWaitersToFinish);
    }

    const uniqueGames = Array.from(gamesByStake.values()).sort((a, b) => Number(a.stake) - Number(b.stake));

    // Enrich active games with real vs system vs waiter player counts
    const enrichedGames = await Promise.all(
      uniqueGames.map(async (g) => {
        const { data: pData } = await supabase
          .from('bingo_players')
          .select('telegram_id, is_system, is_waiter, cartela_number')
          .eq('game_id', g.id);

        const players = pData || [];
        const real = new Set(players.filter(p => !p.is_system).map(p => p.telegram_id)).size;
        const system = new Set(players.filter(p => p.is_system && !p.is_waiter).map(p => p.telegram_id)).size;
        const waiter = new Set(players.filter((p: any) => p.is_waiter).map((p: any) => p.telegram_id)).size;

        return {
          id: g.id,
          stake: Number(g.stake),
          status: g.status,
          start_at: g.start_at,
          prize_pool: Number(g.prize_pool || 0),
          called_count: (g.called_numbers || []).length,
          real_count: real,
          system_count: system,
          waiter_count: waiter,
          cartelas_count: players.length,
        };
      })
    );

    res.json({
      room,
      bot_count: botCount || 0,
      live_games: enrichedGames,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/hdase-room — update room stakes, Pro status, and system player / waiter settings by roomId
router.put('/hdase-room', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const targetRoomId = (req.body.roomId || req.body.room_id || req.query.roomId || req.query.room_id || HDASE_ROOM_ID) as string;
    const {
      stakes,
      system_players_enabled,
      system_players_pro_level,
      system_players_pro_expires_at,
      system_players_schedule_start,
      system_players_schedule_end,
      system_players_stake_configs,
      system_players_risk_percent,
      waiter_players_enabled,
      waiter_players_stake_configs,
      status,
    } = req.body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (targetRoomId === HDASE_ROOM_ID) {
      // Ensure agent_id is linked to admin from users table for official room
      const { data: adminUser } = await supabase
        .from('users')
        .select('id, first_name, username')
        .or(`id.eq.${HDASE_AGENT_ID},role.eq.admin`)
        .limit(1)
        .maybeSingle();

      const targetAdminId = adminUser?.id || HDASE_AGENT_ID;
      const targetAdminName = adminUser?.first_name || adminUser?.username || 'Admin';
      updates.agent_id = targetAdminId;
      updates.agent_name = targetAdminName;
      updates.system_players_pro_level = 1; // Permanent Pro status for official room
    } else {
      if (system_players_pro_level !== undefined) {
        updates.system_players_pro_level = Number(system_players_pro_level);
        if (Number(system_players_pro_level) >= 1 && !system_players_pro_expires_at) {
          updates.system_players_pro_expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
        }
      }
      if (system_players_pro_expires_at !== undefined) {
        updates.system_players_pro_expires_at = system_players_pro_expires_at;
      }
    }

    if (stakes !== undefined && Array.isArray(stakes)) {
      updates.stakes = stakes.map(Number);
    }
    if (system_players_enabled !== undefined) {
      updates.system_players_enabled = Boolean(system_players_enabled);
    }
    if (system_players_schedule_start !== undefined) {
      const s = String(system_players_schedule_start || '00:00').trim();
      updates.system_players_schedule_start = s;
    }
    if (system_players_schedule_end !== undefined) {
      let e = String(system_players_schedule_end || '24:00').trim();
      if (e === '00:00' && (updates.system_players_schedule_start === '00:00' || !updates.system_players_schedule_start)) {
        e = '24:00';
      }
      updates.system_players_schedule_end = e;
    }
    if (system_players_stake_configs !== undefined) {
      updates.system_players_stake_configs = system_players_stake_configs;
    }
    if (system_players_risk_percent !== undefined) {
      updates.system_players_risk_percent = Math.max(0, Math.min(100, Number(system_players_risk_percent)));
    }
    if (waiter_players_enabled !== undefined) {
      updates.waiter_players_enabled = Boolean(waiter_players_enabled);
    }
    if (waiter_players_stake_configs !== undefined) {
      updates.waiter_players_stake_configs = waiter_players_stake_configs;
    } else if (req.body.waiter_stake_configs !== undefined) {
      updates.waiter_players_stake_configs = req.body.waiter_stake_configs;
    }
    if (status !== undefined) {
      updates.status = status;
    }

    const { data: updated, error: uErr } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', targetRoomId)
      .select()
      .single();

    if (uErr) {
      if (targetRoomId === HDASE_ROOM_ID) {
        // Fallback: try by room_name if ID match failed
        const { data: fallbackUpdated, error: fbErr } = await supabase
          .from('rooms')
          .update(updates)
          .eq('room_name', 'HDASE BINGO')
          .select()
          .single();

        if (fbErr) throw fbErr;
        await systemPlayerService.cleanDisabledWaitingGames(fallbackUpdated.id || HDASE_ROOM_ID);
        invalidatePoolsCache();
        return res.json({ success: true, room: fallbackUpdated });
      }
      throw uErr;
    }

    // Immediately clean up any waiting games for disabled stakes and invalidate pools cache
    await systemPlayerService.cleanDisabledWaitingGames(targetRoomId);
    invalidatePoolsCache();

    // Auto-seed bot pool if needed
    if (updates.system_players_enabled) {
      systemPlayerService.seedSystemPlayersPool(targetRoomId, 1000).catch(console.error);
    }

    res.json({ success: true, room: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/hdase-room/reseed — force seed 1,000 Ethiopian bots for target room
router.post('/hdase-room/reseed', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const targetRoomId = (req.query.roomId || req.query.room_id || req.body?.roomId || req.body?.room_id || HDASE_ROOM_ID) as string;
    await systemPlayerService.seedSystemPlayersPool(targetRoomId, 1000);
    const { count } = await supabase
      .from('system_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', targetRoomId);

    res.json({
      success: true,
      message: `Successfully seeded ${count || 1000} system players`,
      bot_count: count || 1000,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/hdase-room/bots — get paginated, searchable bots in target room pool
router.get('/hdase-room/bots', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const targetRoomId = (req.query.roomId || req.query.room_id || HDASE_ROOM_ID) as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 25));
    const search = ((req.query.search as string) || '').trim();
    const offset = (page - 1) * limit;

    let query = supabase
      .from('system_players')
      .select('id, first_name, telegram_id, total_won, created_at', { count: 'exact' })
      .eq('room_id', targetRoomId)
      .order('created_at', { ascending: true });

    if (search) {
      query = query.ilike('first_name', `%${search}%`);
    }

    let data: any[] | null = null;
    let count: number | null = null;
    const { data: qData, count: qCount, error } = await query.range(offset, offset + limit - 1);

    if (error && error.code === '42703') {
      let fbQuery = supabase
        .from('system_players')
        .select('id, first_name, total_won, created_at', { count: 'exact' })
        .eq('room_id', targetRoomId)
        .order('created_at', { ascending: true });
      if (search) fbQuery = fbQuery.ilike('first_name', `%${search}%`);
      const { data: fbData, count: fbCount, error: fbErr } = await fbQuery.range(offset, offset + limit - 1);
      if (fbErr) throw fbErr;
      data = fbData;
      count = fbCount;
    } else if (error) {
      throw error;
    } else {
      data = qData;
      count = qCount;
    }

    const enriched = (data || []).map((bot: any) => ({
      ...bot,
      telegram_id: bot.telegram_id || systemPlayerService.getBotTelegramId(bot.id, targetRoomId),
    }));

    res.json({
      players: enriched,
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/hdase-room/bots/:id — edit system player handle/name
router.put('/hdase-room/bots/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const botId = req.params.id;
    const { first_name } = req.body;

    if (!first_name || !first_name.trim()) {
      return res.status(400).json({ error: 'Valid Name or Handle is required' });
    }

    const cleanName = first_name.trim();
    const { data, error } = await supabase
      .from('system_players')
      .update({ first_name: cleanName })
      .eq('id', botId)
      .select('id, first_name, telegram_id, total_won')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      message: `System player updated to "${cleanName}"`,
      bot: {
        ...data,
        telegram_id: data?.telegram_id || systemPlayerService.getBotTelegramId(data?.id || botId),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/hdase-room/bots — add custom bot to room pool
router.post('/hdase-room/bots', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const targetRoomId = (req.body.roomId || req.body.room_id || HDASE_ROOM_ID) as string;
    const { first_name } = req.body;

    if (!first_name || !first_name.trim()) {
      return res.status(400).json({ error: 'Valid Name or Handle is required' });
    }

    const cleanName = first_name.trim();
    const nextTelegramId = await systemPlayerService.getNextSystemTelegramId();
    const tidStr = String(nextTelegramId);

    let data: any = null;
    const { data: insData, error: insErr } = await supabase
      .from('system_players')
      .insert({
        room_id: targetRoomId,
        first_name: cleanName,
        telegram_id: tidStr,
        total_won: 0,
      })
      .select('id, first_name, telegram_id, total_won')
      .single();

    if (insErr && insErr.code === '42703') {
      const { data: fbData, error: fbErr } = await supabase
        .from('system_players')
        .insert({
          room_id: targetRoomId,
          first_name: cleanName,
          total_won: 0,
        })
        .select('id, first_name, total_won')
        .single();
      if (fbErr) throw fbErr;
      data = fbData;
      systemPlayerService.setBotTelegramId(data.id, tidStr);
      data.telegram_id = tidStr;
    } else if (insErr) {
      throw insErr;
    } else {
      data = insData;
      systemPlayerService.setBotTelegramId(data.id, tidStr);
    }

    res.json({
      success: true,
      message: `Added system player "${cleanName}" with ID ${tidStr}`,
      bot: data,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


