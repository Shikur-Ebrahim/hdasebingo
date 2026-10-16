import { Context } from 'grammy';
import { InputFile } from 'grammy';
import { upsertUser } from '../services/game';
import path from 'path';

// Cache the file_id after first upload so we don't re-upload every time
let bannerFileId: string | null = null;

export async function startCommand(ctx: Context) {
  const user = ctx.from!;
  
  // Extract inviter ID or room ID from start payload (e.g., /start ref_12345 or /start room_UUID)
  let inviterId: string | undefined = undefined;
  let roomId: string | undefined = undefined;
  if (ctx.message?.text) {
    const parts = ctx.message.text.split(' ');
    if (parts.length > 1) {
      const payload = parts[1].trim();
      if (payload.startsWith('ref_')) {
        inviterId = payload.replace('ref_', '');
      } else if (payload.startsWith('room_')) {
        roomId = payload.replace('room_', '');
      }
    }
  }

  try {
    await upsertUser(user.id.toString(), user.username || user.first_name, user.first_name, inviterId, roomId);
  } catch (e: any) {
    if (e.message === 'ACCOUNT_INACTIVE') {
      await ctx.reply('❌ Your account has been deactivated by the admin. You can no longer use this bot.');
      return;
    }
    console.error('Upsert user error:', e); 
  }

  const miniAppUrl = process.env.MINI_APP_URL || 'https://hdasebingo-44kc.vercel.app';
  
  // Fetch dynamic links & room name if roomId is present
  let supportUsername = 'hdasebingo_admin';
  let channelLink = 'https://t.me/hdasebingo';
  let invitedRoomName: string | null = null;
  try {
    const { supabase } = await import('../services/supabase');
    const { data: supportData } = await supabase.from('settings').select('value').eq('key', 'support_username').single();
    const { data: channelData } = await supabase.from('settings').select('value').eq('key', 'channel_link').single();
    if (supportData) supportUsername = supportData.value;
    if (channelData) channelLink = channelData.value;
    if (roomId) {
      const { data: rData } = await supabase.from('rooms').select('room_name').eq('id', roomId).maybeSingle();
      if (rData?.room_name) invitedRoomName = rData.room_name;
    }
  } catch (err) {
    console.error('Failed to fetch settings in bot:', err);
  }

  // Construct play URL with room parameter if user was invited
  let playUrl = miniAppUrl;
  if (roomId) {
    const sep = playUrl.includes('?') ? '&' : '?';
    playUrl = `${playUrl}${sep}room=${encodeURIComponent(roomId)}&startapp=room_${encodeURIComponent(roomId)}`;
  }

  const channelUrl = channelLink;
  const supportUrl = `https://t.me/${supportUsername.replace('@', '')}`;
  const botUsername = 'hdasebingo_bot';
  const inviteLink = `https://t.me/${botUsername}?start=ref_${user.id}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🎮 Play Hdasebingo with me! Join and let\'s win together! 🎱')}`;

  const playButtonText = '🎱 PLAY NOW!';

  const keyboard = {
    inline_keyboard: [
      [{ text: playButtonText, web_app: { url: playUrl } }],
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
    `⚡ *ታላቁ የህዳሴ ቢንጎ • Hdasebingo* ላይ እንኳን ደህና መጡ! 🇪🇹\n\n` +
    `🌊 ከጓደኞችዎ ጋር ቢንጎ ይጫወቱ፣ ታላላቅ ሽልማቶችን ያሸንፉ! 🏆\n\n` +
    `✨ *ታላቁ የኢትዮጵያ ህዳሴ ግድብ 🇪🇹*`;

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
