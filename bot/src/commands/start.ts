import { Context } from 'grammy';
import { InputFile } from 'grammy';
import { upsertUser } from '../services/game';
import path from 'path';

// Cache the file_id after first upload so we don't re-upload every time
let bannerFileId: string | null = null;

export async function startCommand(ctx: Context) {
  const user = ctx.from!;
  
  // Extract inviter ID from start payload if present (e.g., /start ref_12345)
  let inviterId = undefined;
  if (ctx.message?.text) {
    const parts = ctx.message.text.split(' ');
    if (parts.length > 1 && parts[1].startsWith('ref_')) {
      inviterId = parts[1].replace('ref_', '');
    }
  }

  try {
    await upsertUser(user.id.toString(), user.username || user.first_name, user.first_name, inviterId);
  } catch (e: any) {
    if (e.message === 'ACCOUNT_INACTIVE') {
      await ctx.reply('❌ Your account has been deactivated by the admin. You can no longer use this bot.');
      return;
    }
    console.error('Upsert user error:', e); 
  }

  const miniAppUrl = process.env.MINI_APP_URL || 'https://hdasebingo.vercel.app';
  
  // Fetch dynamic links from Supabase settings
  let supportUsername = 'hdasebingo_admin';
  let channelLink = 'https://t.me/hdasebingo';
  try {
    const { supabase } = await import('../services/supabase');
    const { data: supportData } = await supabase.from('settings').select('value').eq('key', 'support_username').single();
    const { data: channelData } = await supabase.from('settings').select('value').eq('key', 'channel_link').single();
    if (supportData) supportUsername = supportData.value;
    if (channelData) channelLink = channelData.value;
  } catch (err) {
    console.error('Failed to fetch settings in bot:', err);
  }

  const channelUrl = channelLink;
  const supportUrl = `https://t.me/${supportUsername.replace('@', '')}`;
  const botUsername = 'hdasebingo_bot';
  const inviteLink = `https://t.me/${botUsername}?start=ref_${user.id}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🎮 Play Hdasebingo with me! Join and let\'s win together! 🎱')}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎱 START PLAYING!', web_app: { url: miniAppUrl } }],
      [
        { text: '💬 Get Support', url: supportUrl },
        { text: '📢 Join Channel', url: channelUrl },
      ],
      [
        { text: '👥 Invite Friend', url: `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🎮 Play Hdasebingo with me! Join using my invite link and let\'s win together! 🎱')}` },
        { text: '💰 Deposit', callback_data: 'btn_deposit' },
      ],
    ],
  };

  const caption =
    `🎉 *እንኳን በደህና መጡ, ${user.first_name}!*\n\n` +
    `🎱 *Hdasebingo* ላይ እንኳን ደህና መጡ!\n\n` +
    `ከጓደኞችዎ ጋር ቢንጎ ይጫወቱ፣ ታላላቅ ሸልማቶችን ያሸንፉ! 🏆\n\n` +
    `*Victory in Every Ball • Ethiopia 🇪🇹*`;

  try {
    let msg;
    if (bannerFileId) {
      // Use cached file_id (fast, no re-upload)
      msg = await ctx.replyWithPhoto(bannerFileId, {
        caption,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard.inline_keyboard },
      });
    } else {
      // First time: upload from local file
      const bannerPath = path.join(__dirname, '../../assets/banner.jpg');
      msg = await ctx.replyWithPhoto(new InputFile(bannerPath), {
        caption,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard.inline_keyboard },
      });
      // Cache the file_id for next time
      if (msg.photo && msg.photo.length > 0) {
        bannerFileId = msg.photo[msg.photo.length - 1].file_id;
      }
    }
  } catch (e) {
    console.error('Photo send error:', e);
    // Fallback: text only
    await ctx.reply(caption, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard.inline_keyboard },
    });
  }
}
