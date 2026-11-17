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
      } else {
        if (payload.includes('ref_')) {
          const m = payload.match(/ref_([a-zA-Z0-9-]+)/);
          if (m) inviterId = m[1];
        }
        if (payload.includes('room_')) {
          const m = payload.match(/room_([a-zA-Z0-9-]+)/);
          if (m) roomId = m[1];
        }
      }
    }
  }

  let userRecord: any = null;
  try {
    userRecord = await upsertUser(user.id.toString(), user.username || user.first_name, user.first_name, inviterId, roomId);
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

  const HDASE_OFFICIAL_ROOM_ID = 'd7c9114a-e112-426f-8f9b-13c00050279c';
  // If user has a previous room in DB (different from default) or explicit roomId, keep it!
  const targetRoomId = roomId || (userRecord?.room_id && userRecord.room_id !== HDASE_OFFICIAL_ROOM_ID ? userRecord.room_id : null) || userRecord?.room_id || null;
  const effectiveRoomId = targetRoomId || HDASE_OFFICIAL_ROOM_ID;
  let invitedRoomName: string | null = null;
  if (effectiveRoomId && effectiveRoomId !== HDASE_OFFICIAL_ROOM_ID) {
    try {
      const { data: rData } = await supabase.from('rooms').select('room_name').eq('id', effectiveRoomId).maybeSingle();
      if (rData?.room_name) invitedRoomName = rData.room_name;
    } catch (err) {
      console.error('Failed to fetch invited room in bot:', err);
    }
  }

  // Construct play URL:
  // If user has a specific previous room or was explicitly invited, direct to that room.
  // Otherwise, use clean miniAppUrl so it defaults dynamically without forcing a room.
  let playUrl = miniAppUrl;
  if (targetRoomId && targetRoomId !== HDASE_OFFICIAL_ROOM_ID) {
    const sep = playUrl.includes('?') ? '&' : '?';
    playUrl = `${playUrl}${sep}room=${encodeURIComponent(targetRoomId)}&startapp=room_${encodeURIComponent(targetRoomId)}`;
  }

  const botUsername = 'hdasebingo_bot';
  const invitePayload = effectiveRoomId ? `ref_${user.id}_room_${effectiveRoomId}` : `ref_${user.id}`;
  const inviteLink = `https://t.me/${botUsername}?start=${invitePayload}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}`;

  const playButtonText = invitedRoomName 
    ? `🎱 ወደ ${invitedRoomName} ግባ (PLAY!)` 
    : '🎱 START PLAYING (አሁኑኑ ይጫወቱ)!';

  const keyboard = {
    inline_keyboard: [
      [{ text: playButtonText, web_app: { url: playUrl } }],
      [
        { text: '💬 Get Support', url: supportUrl },
        { text: '👥 Join Group', url: channelUrl },
      ],
      [
        { text: '👥 Invite Friend', url: shareUrl },
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
