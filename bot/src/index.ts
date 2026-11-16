import { Bot } from 'grammy';
import dotenv from 'dotenv';
dotenv.config();

import { startCommand } from './commands/start';
import { handleCallback } from './handlers/callback';
import { handleDepositAmount, handleDepositScreenshot, getDepositSession } from './handlers/deposit';

async function main() {
  const bot = new Bot(process.env.BOT_TOKEN!);

  bot.command('start', startCommand);
  bot.command('play', startCommand);
  bot.hears(/^(start|play|restart|\/play|\/restart|ጀመር|መጫወት)/i, startCommand);
  bot.on('callback_query:data', handleCallback);

  // Intercept text messages for deposit amount step
  bot.on('message:text', async (ctx, next) => {
    const session = getDepositSession(ctx.from!.id);
    if (session?.step === 'awaiting_amount') {
      await handleDepositAmount(ctx);
      return;
    }
    await next();
  });

  // Intercept photo messages for deposit screenshot step
  bot.on('message:photo', async (ctx, next) => {
    const session = getDepositSession(ctx.from!.id);
    if (session?.step === 'awaiting_screenshot') {
      await handleDepositScreenshot(ctx);
      return;
    }
    await next();
  });

  bot.catch((err) => {
    console.error(`Bot error for update ${err.ctx.update.update_id}:`, err.error);
  });

  // Configure permanent Chat Menu Button for Telegram Mini App
  const miniAppUrl = process.env.MINI_APP_URL || 'https://hdasebingo-44kc.vercel.app';
  const HDASE_OFFICIAL_ROOM_ID = 'd7c9114a-e112-426f-8f9b-13c00050279c';
  const sep = miniAppUrl.includes('?') ? '&' : '?';
  const menuAppUrl = `${miniAppUrl}${sep}room=${HDASE_OFFICIAL_ROOM_ID}&startapp=room_${HDASE_OFFICIAL_ROOM_ID}`;
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '🎮 PLAY BINGO',
        web_app: { url: menuAppUrl },
      },
    });
    console.log('✅ Chat menu button configured: 🎮 PLAY BINGO (Official HDASE Room)');
  } catch (menuErr) {
    console.warn('Could not set chat menu button:', menuErr);
  }

  try {
    await bot.api.setMyCommands([
      { command: 'start', description: '🎮 Start Hdase Bingo & Open Mini App' },
      { command: 'play', description: '🎱 Play Bingo Now' },
    ]);
  } catch (cmdErr) {
    console.warn('Could not set bot commands:', cmdErr);
  }

  await bot.start({ onStart: (info) => console.log(`🤖 @${info.username} is running!`) });
}

main().catch(console.error);
