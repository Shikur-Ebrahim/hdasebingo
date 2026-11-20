import { Context } from 'grammy';
import { supabase } from '../services/supabase';
import { removeBotNotificationButtons, deleteBotNotificationMessages } from '../services/botNotifications';

/**
 * Handle worker/admin deposit approval or rejection directly from Telegram
 */
export async function handleDepositAction(ctx: Context, action: 'approve' | 'reject', depositId: string) {
  const callerId = String(ctx.from?.id);

  // 1. Check if caller is authorized (worker or admin)
  const { data: worker } = await supabase
    .from('users')
    .select('id, telegram_id, role, username, first_name')
    .eq('telegram_id', callerId)
    .maybeSingle();

  if (!worker || (worker.role !== 'worker' && worker.role !== 'admin')) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Unauthorized: Only workers and admins can perform this action.',
      show_alert: true,
    });
    return;
  }

  // 2. Fetch deposit record
  const { data: deposit, error: depErr } = await supabase
    .from('deposits')
    .select('*')
    .eq('id', depositId)
    .maybeSingle();

  if (depErr || !deposit) {
    await ctx.answerCallbackQuery({ text: '❌ Deposit not found.', show_alert: true });
    return;
  }

  // 3. Prevent duplicate action
  if (deposit.status === 'approved') {
    await ctx.answerCallbackQuery({ text: '⚠️ This deposit is already approved.', show_alert: true });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch (_) {}
    return;
  }

  if (deposit.status === 'rejected') {
    await ctx.answerCallbackQuery({ text: '⚠️ This deposit was already rejected.', show_alert: true });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch (_) {}
    return;
  }

  const workerName = worker.username ? `@${worker.username}` : (worker.first_name || 'Worker');
  const nowEAT = new Date().toLocaleTimeString('en-US', {
    timeZone: 'Africa/Addis_Ababa',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // ── REJECT ACTION ────────────────────────────────────────────────────────
  if (action === 'reject') {
    const { error: updErr } = await supabase
      .from('deposits')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', depositId);

    if (updErr) {
      await ctx.answerCallbackQuery({ text: '❌ Error: ' + updErr.message, show_alert: true });
      return;
    }

    // Notify user on Telegram
    try {
      const rejMsg = `❌ *Deposit Rejected*\n\n` +
                     `Your deposit request of *${Number(deposit.amount).toLocaleString('en-US')} ETB* could not be verified and has been rejected.\n\n` +
                     `If you believe this is an error, please contact our support team with your receipt.`;
      await ctx.api.sendMessage(deposit.telegram_id, rejMsg, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Failed to notify user on deposit rejection:', e);
    }

    await ctx.answerCallbackQuery({ text: '❌ Deposit rejected and removed.' });

    // Delete Telegram message completely
    try {
      await ctx.deleteMessage();
    } catch (_) {}

    // Delete message for other workers
    await deleteBotNotificationMessages('deposit', depositId, ctx.from?.id);
    return;
  }

  // ── APPROVE ACTION ───────────────────────────────────────────────────────
  // Check if first or second deposit
  const { count: approvedCount } = await supabase
    .from('deposits')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', deposit.telegram_id)
    .eq('status', 'approved');

  const isFirstDeposit = (approvedCount || 0) === 0;
  const isSecondDeposit = approvedCount === 1;

  // Fetch depositor user record
  const { data: depRecord, error: userFetchErr } = await supabase
    .from('users')
    .select('id, telegram_id, main_balance, bonus_balance, inviter_id, username, first_name')
    .eq('telegram_id', String(deposit.telegram_id))
    .maybeSingle();

  if (userFetchErr || !depRecord) {
    await ctx.answerCallbackQuery({
      text: `❌ Depositor user (ID: ${deposit.telegram_id}) not found in users table.`,
      show_alert: true,
    });
    return;
  }

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
    const getSetting = (key: string, def: string) => allSettings?.find(s => s.key === key)?.value ?? def;

    const firstDepositPct = parseFloat(getSetting('first_deposit_bonus_pct', '7')) / 100;
    const secondDepositPct = parseFloat(getSetting('second_deposit_bonus_pct', '3')) / 100;
    const invitationPct = parseFloat(getSetting('invitation_reward_pct', '10')) / 100;

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

  // 2. Weekend Bonus
  let weekendBonus = 0;
  try {
    const { data: wkSettings } = await supabase.from('settings').select('key, value')
      .in('key', ['weekend_bonus_enabled', 'weekend_bonus_days', 'weekend_bonus_pct']);
    const getWk = (key: string, def: string) => wkSettings?.find(s => s.key === key)?.value ?? def;

    if (getWk('weekend_bonus_enabled', 'false') === 'true') {
      const wkPct = parseFloat(getWk('weekend_bonus_pct', '10')) / 100;
      let wkDays: number[] = [0, 6];
      try { wkDays = JSON.parse(getWk('weekend_bonus_days', '[0,6]')); } catch (_) {}

      const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
      const depositTime = new Date(deposit.created_at).getTime();
      const eatDate = new Date(depositTime + EAT_OFFSET_MS);
      const dayOfWeek = eatDate.getUTCDay();

      if (wkDays.includes(dayOfWeek) && wkPct > 0) {
        const year = eatDate.getUTCFullYear();
        const month = eatDate.getUTCMonth();
        const day = eatDate.getUTCDate();
        const startOfDayUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - EAT_OFFSET_MS);
        const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

        const { count: priorDepositsOnDay } = await supabase
          .from('deposits')
          .select('*', { count: 'exact', head: true })
          .eq('telegram_id', deposit.telegram_id)
          .eq('status', 'approved')
          .neq('id', deposit.id)
          .gte('created_at', startOfDayUTC.toISOString())
          .lte('created_at', endOfDayUTC.toISOString());

        if ((priorDepositsOnDay || 0) === 0) {
          weekendBonus = Number((depAmount * wkPct).toFixed(2));
        }
      }
    }
  } catch (err) {
    console.error('Weekend bonus calculation error in bot:', err);
  }

  // 3. Atomically update balances
  const newMainBalance = Number((currentMain + depAmount).toFixed(2));
  const totalBonusAdded = Number((depositorBonus + weekendBonus).toFixed(2));
  const newBonusBalance = Number((currentBonus + totalBonusAdded).toFixed(2));

  const { error: balErr } = await supabase
    .from('users')
    .update({
      main_balance: newMainBalance,
      bonus_balance: newBonusBalance,
    })
    .eq('telegram_id', String(deposit.telegram_id));

  if (balErr) {
    await ctx.answerCallbackQuery({
      text: '❌ Failed to credit user: ' + balErr.message,
      show_alert: true,
    });
    return;
  }

  // 4. Update inviter's bonus if applicable
  if (inviterId && inviterBonus > 0) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviterId);
      const { data: invRecord } = await (isUuid
        ? supabase.from('users').select('id, bonus_balance').eq('id', inviterId).maybeSingle()
        : supabase.from('users').select('id, bonus_balance').eq('telegram_id', String(inviterId)).maybeSingle()
      );
      if (invRecord) {
        await supabase.from('users').update({
          bonus_balance: Number(((invRecord.bonus_balance || 0) + inviterBonus).toFixed(2)),
        }).eq('id', invRecord.id);
      }
      await ctx.api.sendMessage(
        inviterId,
        `🎉 *Referral Bonus Received!*\n\nYour invited friend made their first deposit! You have received *${Number(inviterBonus).toLocaleString('en-US')} ETB* in your bonus balance. Keep inviting friends for more rewards! 🎁`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    } catch (invErr) {
      console.error('Failed to credit inviter in bot:', invErr);
    }
  }

  // 5. Mark deposit as approved
  await supabase
    .from('deposits')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', depositId);

  // 6. Notify depositor on Telegram
  try {
    let msgText = `✅ *Deposit Approved!*\n\n` +
                  `💰 Amount: *${Number(deposit.amount).toLocaleString('en-US')} ETB* has been added to your balance.`;
    if (depositorBonus > 0) {
      msgText += `\n\n🎁 *${bonusReason} Bonus!* You received an extra *${Number(depositorBonus).toLocaleString('en-US')} ETB* in your bonus balance!`;
    }
    if (weekendBonus > 0) {
      msgText += `\n\n🎉 *Weekend Bonus!* You also received *${Number(weekendBonus).toLocaleString('en-US')} ETB* weekend bonus in your bonus balance!`;
    }
    msgText += `\n\n🎮 Open the Mini App to start playing!`;

    await ctx.api.sendMessage(deposit.telegram_id, msgText, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Failed to notify depositor on Telegram:', err);
  }

  await ctx.answerCallbackQuery({ text: '✅ Deposit approved and balance credited!' });

  // 7. Update worker message
  const badge = `\n\n✅ *APPROVED* by ${workerName} at ${nowEAT} (EAT)`;
  await updateWorkerMessage(ctx, badge);
  await removeBotNotificationButtons('deposit', depositId, badge, ctx.from?.id);
}

/**
 * Handle worker/admin withdrawal approval or rejection directly from Telegram
 */
export async function handleWithdrawalAction(ctx: Context, action: 'approve' | 'reject', withdrawalId: string) {
  const callerId = String(ctx.from?.id);

  // 1. Check if caller is authorized
  const { data: worker } = await supabase
    .from('users')
    .select('id, telegram_id, role, username, first_name')
    .eq('telegram_id', callerId)
    .maybeSingle();

  if (!worker || (worker.role !== 'worker' && worker.role !== 'admin')) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Unauthorized: Only workers and admins can perform this action.',
      show_alert: true,
    });
    return;
  }

  // 2. Fetch withdrawal record
  const { data: withdrawal, error: withErr } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .maybeSingle();

  if (withErr || !withdrawal) {
    await ctx.answerCallbackQuery({ text: '❌ Withdrawal not found.', show_alert: true });
    return;
  }

  // 3. Prevent duplicate action
  if (withdrawal.status === 'approved') {
    await ctx.answerCallbackQuery({ text: '⚠️ This withdrawal is already approved.', show_alert: true });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch (_) {}
    return;
  }

  if (withdrawal.status === 'rejected') {
    await ctx.answerCallbackQuery({ text: '⚠️ This withdrawal was already rejected.', show_alert: true });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch (_) {}
    return;
  }

  const workerName = worker.username ? `@${worker.username}` : (worker.first_name || 'Worker');
  const nowEAT = new Date().toLocaleTimeString('en-US', {
    timeZone: 'Africa/Addis_Ababa',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // ── REJECT ACTION ────────────────────────────────────────────────────────
  if (action === 'reject') {
    // 1. Refund user main_balance
    const { data: userRec } = await supabase
      .from('users')
      .select('main_balance')
      .eq('telegram_id', withdrawal.telegram_id)
      .maybeSingle();

    if (userRec) {
      const refundedBalance = Number((Number(userRec.main_balance || 0) + Number(withdrawal.amount)).toFixed(2));
      await supabase
        .from('users')
        .update({ main_balance: refundedBalance })
        .eq('telegram_id', withdrawal.telegram_id);
    }

    // 2. Mark withdrawal as rejected
    await supabase
      .from('withdrawals')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', withdrawalId);

    // 3. Notify user on Telegram
    try {
      const rejMsg = `❌ *Withdrawal Rejected & Refunded*\n\n` +
                     `💸 Your withdrawal request of *${Number(withdrawal.amount).toLocaleString('en-US')} ETB* has been rejected.\n\n` +
                     `💰 *${Number(withdrawal.amount).toLocaleString('en-US')} ETB* has been refunded back to your wallet balance.\n\n` +
                     `🔢 Account: \`${withdrawal.account_number}\`\n` +
                     `Please check your account details or contact support for help.`;
      await ctx.api.sendMessage(withdrawal.telegram_id, rejMsg, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Failed to notify user on withdrawal rejection:', e);
    }

    await ctx.answerCallbackQuery({ text: '❌ Withdrawal rejected, refunded, and removed.' });

    // Delete message completely
    try {
      await ctx.deleteMessage();
    } catch (_) {}

    // Delete message for other workers
    await deleteBotNotificationMessages('withdraw', withdrawalId, ctx.from?.id);
    return;
  }

  // ── APPROVE ACTION ───────────────────────────────────────────────────────
  await supabase
    .from('withdrawals')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', withdrawalId);

  // Notify user
  try {
    const netAmount = Number(withdrawal.net_amount ?? withdrawal.amount);
    const feeAmount = Number(withdrawal.fee_amount ?? 0);
    const feePercent = Number(withdrawal.fee_percent ?? 0);

    let successMsg = `✅ *Withdrawal Approved!*\n\n` +
                     `💸 *${netAmount.toLocaleString('en-US')} ETB* has been sent to your account.\n\n` +
                     `🔢 Account: \`${withdrawal.account_number}\` (${withdrawal.account_name || 'Account Holder'})\n` +
                     (feeAmount > 0 ? `🏷️ Fee (${feePercent}%): *${feeAmount.toLocaleString('en-US')} ETB*\n` : '') +
                     `\n🎉 Thank you for playing on Hdase Bingo!`;

    await ctx.api.sendMessage(withdrawal.telegram_id, successMsg, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('Failed to notify user on withdrawal approval:', e);
  }

  await ctx.answerCallbackQuery({ text: '✅ Withdrawal approved!' });

  // Update worker message
  const badge = `\n\n✅ *APPROVED & SENT* by ${workerName} at ${nowEAT} (EAT)`;
  await updateWorkerMessage(ctx, badge);
  await removeBotNotificationButtons('withdraw', withdrawalId, badge, ctx.from?.id);
}

/**
 * Helper to update message text/caption and clear inline buttons
 */
async function updateWorkerMessage(ctx: Context, badge: string) {
  try {
    if (ctx.callbackQuery?.message?.photo) {
      const origCaption = ctx.callbackQuery.message.caption || '';
      const cleanCaption = origCaption.replace(/\n*👇.*$/s, '');
      await ctx.editMessageCaption({
        caption: `${cleanCaption}${badge}`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] },
      });
    } else {
      const origText = ctx.callbackQuery?.message?.text || '';
      const cleanText = origText.replace(/\n*👇.*$/s, '');
      await ctx.editMessageText(
        `${cleanText}${badge}`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [] },
        }
      );
    }
  } catch (err) {
    console.error('Failed to update worker message:', err);
  }
}
