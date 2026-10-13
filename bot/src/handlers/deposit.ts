import { Context } from 'grammy';
import { supabase } from '../services/supabase';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';

// R2 client
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// In-memory session: userId → deposit state
interface DepositSession {
  step: 'choose_method' | 'awaiting_amount' | 'awaiting_screenshot';
  methodId?: string;
  methodName?: string;
  accountNumber?: string;
  minDeposit?: number;
  amount?: number;
}

const sessions = new Map<number, DepositSession>();

export function getDepositSession(userId: number) {
  return sessions.get(userId);
}

export function clearDepositSession(userId: number) {
  sessions.delete(userId);
}

// Type display labels
const typeLabels: Record<string, string> = {
  cbe: '🏦 Commercial Bank of Ethiopia',
  boa: '🏛️ Bank of Abyssinia',
  telebirr: '📱 Telebirr',
  mpesa: '💚 M-Pesa',
};

// ── STEP 1: Show method list ──────────────────────────────────────────────────
export async function startDeposit(ctx: Context) {
  await ctx.answerCallbackQuery();
  const userId = ctx.from!.id;

  // Check if user already has a pending deposit
  const { data: pending } = await supabase
    .from('deposits')
    .select('id, amount')
    .eq('telegram_id', userId.toString())
    .eq('status', 'pending')
    .single();

  if (pending) {
    // Fetch support contact (worker or admin)
    let supportText = '';
    let { data: worker } = await supabase
      .from('users')
      .select('username')
      .eq('role', 'worker')
      .not('username', 'is', null)
      .limit(1)
      .single();

    if (!worker) {
      const { data: admin } = await supabase
        .from('users')
        .select('username')
        .eq('role', 'admin')
        .not('username', 'is', null)
        .limit(1)
        .single();
      worker = admin;
    }

    if (worker?.username) {
      const safeWorker = worker.username.replace(/[_*[\]]/g, '\\$&');
      supportText = `\n\n💬 Need help? Contact support: @${safeWorker}`;
    }

    await ctx.reply(
      `⏳ *Deposit Pending*\n\nYou already have a deposit of *${Number(pending.amount).toLocaleString('en-US')} ETB* waiting for admin approval.\n\nPlease wait before making a new deposit.${supportText}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Fetch active deposit methods
  const { data: methods, error } = await supabase
    .from('deposit_methods')
    .select('id, type, name, account_number, min_deposit')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error || !methods || methods.length === 0) {
    await ctx.reply('❌ No deposit methods available right now. Please try again later.');
    return;
  }

  // Build 2-column keyboard using type labels
  const methodButtons = methods.map((m: any) => ({
    text: typeLabels[m.type] || `🏦 ${m.type.toUpperCase()}`,
    callback_data: `dep_method_${m.id}`,
  }));

  // Chunk into rows of 2
  const rows: typeof methodButtons[] = [];
  for (let i = 0; i < methodButtons.length; i += 2) {
    rows.push(methodButtons.slice(i, i + 2));
  }
  rows.push([{ text: '❌ Cancel', callback_data: 'dep_cancel' }]);

  sessions.set(userId, { step: 'choose_method' });

  await ctx.reply(
    `💰 *Hdasebingo Deposit*\n\nSelect your preferred deposit method:`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: rows },
    }
  );
}

// ── STEP 2: Show method details after user selects ───────────────────────────
export async function handleMethodSelect(ctx: Context, methodId: string) {
  await ctx.answerCallbackQuery();
  const userId = ctx.from!.id;

  const { data: method, error } = await supabase
    .from('deposit_methods')
    .select('id, type, name, account_number, min_deposit')
    .eq('id', methodId)
    .single();

  if (error || !method) {
    await ctx.reply('❌ Method not found. Please try again.');
    clearDepositSession(userId);
    return;
  }

  const typeEmoji: Record<string, string> = {
    cbe: '🏦',
    boa: '🏛️',
    telebirr: '📱',
    mpesa: '💚',
  };
  const emoji = typeEmoji[method.type] || '💳';

  sessions.set(userId, {
    step: 'awaiting_amount',
    methodId: method.id,
    methodName: typeLabels[method.type] || method.name,
    accountNumber: method.account_number,
    minDeposit: method.min_deposit,
  });

  // Send account details — account number in code block = tap-to-copy on mobile
  await ctx.reply(
    `${emoji} *Deposit via ${typeLabels[method.type] || method.name}*\n\n` +
    `📋 *Send Money To:*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Name: *${method.name}*\n` +
    `🔢 Account: \`${method.account_number}\`\n` +
    `*(Tap the number above to copy it)*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️ Min deposit: *${Number(method.min_deposit).toLocaleString('en-US')} ETB*\n\n` +
    `📝 *Steps:*\n` +
    `1️⃣ Send money to account above\n` +
    `2️⃣ Take a screenshot of the receipt\n` +
    `3️⃣ Type the amount you sent below`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: `📋 Copy: ${method.account_number}`, copy_text: { text: method.account_number } as any }],
          [{ text: '❌ Cancel', callback_data: 'dep_cancel' }],
        ],
      },
    }
  );

  // Separate message with force_reply so keyboard opens automatically
  await ctx.reply(
    `👇 *Enter the amount you sent (ETB):*`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: `Min ${Number(method.min_deposit).toLocaleString('en-US')} ETB...`,
      },
    }
  );
}

// ── Copy account number popup (Fallback if needed) ───────────────────────────
export async function handleCopyAccount(ctx: Context, accountNumber: string) {
  await ctx.answerCallbackQuery({
    text: `Account: ${accountNumber}\n(Long press to copy)`,
    show_alert: true,
  });
}

// ── STEP 3: Handle amount text ────────────────────────────────────────────────
export async function handleDepositAmount(ctx: Context) {
  const userId = ctx.from!.id;
  const session = sessions.get(userId);
  if (!session || session.step !== 'awaiting_amount') return false;

  const text = ctx.message?.text?.trim() || '';
  const amount = parseFloat(text);

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount. Please enter a valid number (e.g. 100)');
    return true;
  }

  if (amount < (session.minDeposit || 50)) {
    await ctx.reply(`❌ Minimum deposit is *${session.minDeposit?.toLocaleString('en-US')} ETB*. Please enter a higher amount.`, { parse_mode: 'Markdown' });
    return true;
  }

  sessions.set(userId, { ...session, step: 'awaiting_screenshot', amount });

  await ctx.reply(
    `✅ Amount: *${amount.toLocaleString('en-US')} ETB*\n\n📸 Now send a *screenshot* of your payment receipt as a *photo*:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'dep_cancel' }]],
      },
    }
  );
  return true;
}

// ── STEP 4: Handle screenshot photo ─────────────────────────────────────────
export async function handleDepositScreenshot(ctx: Context) {
  const userId = ctx.from!.id;
  const session = sessions.get(userId);
  if (!session || session.step !== 'awaiting_screenshot') return false;

  const photo = ctx.message?.photo;
  if (!photo || photo.length === 0) {
    await ctx.reply('❌ Please send a *photo* (screenshot) of your payment receipt.', { parse_mode: 'Markdown' });
    return true;
  }

  const processingMsg = await ctx.reply('⏳ Processing your deposit request...');

  try {
    // Get the highest resolution photo
    const best = photo[photo.length - 1];
    const fileInfo = await ctx.api.getFile(best.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

    // Download from Telegram
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to R2
    const fileName = `deposits/bot_${userId}_${Date.now()}.jpg`;
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: fileName,
      Body: buffer,
      ContentType: 'image/jpeg',
    }));

    const screenshotUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    // Save deposit to Supabase
    const { error: depErr } = await supabase.from('deposits').insert([{
      telegram_id: userId.toString(),
      method_id: session.methodId,
      amount: session.amount,
      screenshot_url: screenshotUrl,
      status: 'pending',
    }]);

    if (depErr) throw new Error(depErr.message);

    clearDepositSession(userId);

    // ── Notify Workers ────────────────────────────────────────────────────────
    try {
      const { data: workers } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('role', 'worker');

      if (workers && workers.length > 0) {
        const safeUsername = (ctx.from?.username || ctx.from?.first_name || 'User').replace(/[_*[\]]/g, '\\$&');
        const safeMethodName = (session.methodName || 'Unknown').replace(/[_*[\]]/g, '\\$&');
        
        const notifyMsg = `🔔 *New Deposit Request!*\n\n` +
                          `👤 User: @${safeUsername}\n` +
                          `💰 Amount: *${Number(session.amount).toLocaleString('en-US')} ETB*\n` +
                          `🏦 Method: *${safeMethodName}*\n\n` +
                          `👇 Please check the Admin Dashboard to approve.`;

        for (const worker of workers) {
          if (!worker.telegram_id) continue;
          await ctx.api.sendMessage(worker.telegram_id, notifyMsg, { parse_mode: 'Markdown' }).catch(e => console.error(e));
        }
      }
    } catch (notifyErr) {
      console.error('Failed to notify workers:', notifyErr);
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Fetch support contact for success message
    let supportText = '📞 For support, contact our team.';
    let inlineKeyboard;
    
    let { data: worker } = await supabase
      .from('users')
      .select('username')
      .eq('role', 'worker')
      .not('username', 'is', null)
      .limit(1)
      .single();

    if (!worker) {
      const { data: admin } = await supabase
        .from('users')
        .select('username')
        .eq('role', 'admin')
        .not('username', 'is', null)
        .limit(1)
        .single();
      worker = admin;
    }

    if (worker?.username) {
      const safeUsername = worker.username.replace(/[_*[\]]/g, '\\$&');
      supportText = `💬 Need help? Contact support: @${safeUsername}`;
      inlineKeyboard = { inline_keyboard: [[{ text: '💬 Contact Support', url: `https://t.me/${worker.username}` }]] };
    }

    const safeMethodName = (session.methodName || '').replace(/[_*[\]]/g, '\\$&');

    // Edit processing message to success
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      `✅ *Deposit Request Submitted!*\n\n` +
      `💰 Amount: *${Number(session.amount).toLocaleString('en-US')} ETB*\n` +
      `🏦 Method: *${safeMethodName}*\n` +
      `📊 Status: *Pending Review*\n\n` +
      `⏳ Your deposit will be approved within a few minutes.\n` +
      `${supportText}`,
      { 
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      }
    );

  } catch (err: any) {
    console.error('Deposit screenshot error:', err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      `❌ Failed to process deposit. Please try again or contact support.\n\nError: ${err.message}`
    );
  }

  return true;
}

// ── CANCEL ───────────────────────────────────────────────────────────────────
export async function cancelDeposit(ctx: Context) {
  await ctx.answerCallbackQuery();
  clearDepositSession(ctx.from!.id);
  await ctx.editMessageText('❌ Deposit cancelled. Use /start to begin again.');
}
