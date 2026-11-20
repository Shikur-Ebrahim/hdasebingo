import { supabase } from './supabase';

export interface StoredBotMessage {
  chat_id: string | number;
  message_id: number;
}

/**
 * Record bot notification message IDs sent to workers
 */
export async function trackBotNotification(
  type: 'deposit' | 'withdraw',
  id: string,
  messages: StoredBotMessage[]
): Promise<void> {
  if (!messages || messages.length === 0) return;
  try {
    const key = `bot_msg_${type}_${id}`;
    await supabase.from('settings').upsert({
      key,
      value: JSON.stringify(messages),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Failed to track bot notification for ${type} ${id}:`, err);
  }
}

/**
 * When approved in Mini App or Bot:
 * Remove Approve & Reject inline buttons from Telegram bot messages sent to workers,
 * and mark message with an approved status badge.
 */
export async function removeBotNotificationButtons(
  type: 'deposit' | 'withdraw',
  id: string,
  badgeText?: string,
  excludeChatId?: string | number
): Promise<void> {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return;

  const key = `bot_msg_${type}_${id}`;
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (!data?.value) return;

    let messages: StoredBotMessage[] = [];
    try {
      messages = JSON.parse(data.value);
    } catch (_) {
      return;
    }

    const badge = badgeText || (type === 'deposit' ? '\n\n✅ *APPROVED*' : '\n\n✅ *APPROVED & SENT*');

    for (const msg of messages) {
      if (!msg.chat_id || !msg.message_id) continue;
      if (excludeChatId && String(msg.chat_id) === String(excludeChatId)) continue;

      // Remove inline buttons
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat_id,
            message_id: msg.message_id,
            reply_markup: { inline_keyboard: [] },
          }),
        });
      } catch (e) {
        console.warn(`Failed to remove buttons for ${msg.chat_id}:${msg.message_id}:`, e);
      }

      // Try to update caption or text to show approved badge
      try {
        const captionRes = await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat_id,
            message_id: msg.message_id,
            caption: badge,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] },
          }),
        });
        if (!captionRes.ok) {
          await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: msg.chat_id,
              message_id: msg.message_id,
              text: badge,
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [] },
            }),
          });
        }
      } catch (_) {}
    }

    // Clean up settings entry after resolving
    await supabase.from('settings').delete().eq('key', key);
  } catch (err) {
    console.error(`Failed to remove bot buttons for ${type} ${id}:`, err);
  }
}

/**
 * When rejected in Mini App or Bot:
 * Completely delete the notification message(s) from the Telegram bot for all workers.
 */
export async function deleteBotNotificationMessages(
  type: 'deposit' | 'withdraw',
  id: string,
  excludeChatId?: string | number
): Promise<void> {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return;

  const key = `bot_msg_${type}_${id}`;
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (!data?.value) return;

    let messages: StoredBotMessage[] = [];
    try {
      messages = JSON.parse(data.value);
    } catch (_) {
      return;
    }

    for (const msg of messages) {
      if (!msg.chat_id || !msg.message_id) continue;
      if (excludeChatId && String(msg.chat_id) === String(excludeChatId)) continue;

      try {
        await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat_id,
            message_id: msg.message_id,
          }),
        });
      } catch (e) {
        console.warn(`Failed to delete bot message ${msg.chat_id}:${msg.message_id}:`, e);
      }
    }

    // Clean up settings entry
    await supabase.from('settings').delete().eq('key', key);
  } catch (err) {
    console.error(`Failed to delete bot messages for ${type} ${id}:`, err);
  }
}
