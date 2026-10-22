import { Context } from 'grammy';
import { InputFile } from 'grammy';
import { upsertUser } from '../services/game';
import { supabase } from '../services/supabase';
import { getDynamicBotSettings } from '../services/settings';
import path from 'path';
import fs from 'fs';

// Cache the file_id after first upload so we don't re-upload every time
let bannerFileId: string | null = null;

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function startCommand(ctx: Context) {
  const user = ctx.from!;
  
  // Extract inviter ID or room ID from start payload (e.g., /start ref_12345 or /start room_UUID or /start qr)
  let inviterId: string | undefined = undefined;
  let roomId: string | undefined = undefined;
  let isFromQr = false;
  if (ctx.message?.text) {
    const parts = ctx.message.text.split(' ');
    if (parts.length > 1) {
      const payload = parts[1].trim();
      if (payload === 'qr' || payload === 'start' || payload === 'play') {
        isFromQr = true;
      } else if (payload.startsWith('ref_')) {
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
  
  // Dynamically fetch live support and channel settings from public.settings database
  const settings = await getDynamicBotSettings();
  const supportUrl = settings.support_url;
  const channelUrl = settings.channel_url;

  let invitedRoomName: string | null = null;
  if (roomId) {
    try {
      const { data: rData } = await supabase.from('rooms').select('room_name').eq('id', roomId).maybeSingle();
      if (rData?.room_name) invitedRoomName = rData.room_name;
    } catch (err) {
      console.error('Failed to fetch invited room in bot:', err);
    }
  }

  // Construct play URL with room parameter if user was invited
  let playUrl = miniAppUrl;
  if (roomId) {
    const sep = playUrl.includes('?') ? '&' : '?';
    playUrl = `${playUrl}${sep}room=${encodeURIComponent(roomId)}&startapp=room_${encodeURIComponent(roomId)}`;
  }

  const botUsername = 'hdasebingo_bot';
  const inviteLink = `https://t.me/${botUsername}?start=ref_${user.id}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🎮 Play Hdasebingo with me! Join and let\'s win together! 🎱')}`;

  const playButtonText = invitedRoomName 
    ? `🎱 ወደ ${invitedRoomName} ግባ (PLAY!)` 
    : '🎱 START PLAYING (አሁኑኑ ይጫወቱ)!';

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

  const safeName = escapeHtml(user.first_name || 'ተጫዋች');
  const caption =
    `🎉 <b>እንኳን በደህና መጡ, ${safeName}!</b>\n\n` +
    `⚡ <b>ታላቁ የህዳሴ ቢንጎ • Hdasebingo</b> ላይ እንኳን ደህና መጡ! 🇪🇹\n\n` +
    `🌊 ከጓደኞችዎ ጋር ቢንጎ ይጫወቱ፣ ታላላቅ ሽልማቶችን ያሸንፉ! 🏆\n\n` +
    `👉 ከታች <b>START PLAYING</b> የሚለውን ይጫኑና ጨዋታውን ይጀምሩ! 🚀\n\n` +
    `✨ <b>ታላቁ የኢትዮጵያ ህዳሴ ግድብ 🇪🇹</b>`;

  try {
    let msg;
    if (bannerFileId) {
      // Use cached file_id (fast, no re-upload)
      msg = await ctx.replyWithPhoto(bannerFileId, {
        caption,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard.inline_keyboard },
      });
    } else {
      // First time: upload from local file (check banner.png or banner.jpg)
      const bannerPng = path.join(__dirname, '../../assets/banner.png');
      const bannerJpg = path.join(__dirname, '../../assets/banner.jpg');
      const bannerPath = fs.existsSync(bannerPng) ? bannerPng : bannerJpg;
      msg = await ctx.replyWithPhoto(new InputFile(bannerPath), {
        caption,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard.inline_keyboard },
      });
      // Cache the file_id for next time
      if (msg.photo && msg.photo.length > 0) {
        bannerFileId = msg.photo[msg.photo.length - 1].file_id;
      }
    }
  } catch (e) {
    console.error('Photo send error:', e);
    // Fallback: text with keyboard (HTML)
    try {
      await ctx.reply(caption, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard.inline_keyboard },
      });
    } catch (textErr) {
      console.error('HTML text send error:', textErr);
      // Absolute fallback: plain text without parse_mode
      await ctx.reply(`🎉 እንኳን ወደ ታላቁ የህዳሴ ቢንጎ በደህና መጡ!\n\nለመጫወት ከታች ያለውን START PLAYING የሚለውን ይጫኑ!`, {
        reply_markup: { inline_keyboard: keyboard.inline_keyboard },
      });
    }
  }
}
