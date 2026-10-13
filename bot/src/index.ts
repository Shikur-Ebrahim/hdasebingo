import { Bot } from 'grammy';
import dotenv from 'dotenv';
dotenv.config();

import { startCommand } from './commands/start';
import { handleCallback } from './handlers/callback';
import { handleDepositAmount, handleDepositScreenshot, getDepositSession } from './handlers/deposit';

async function main() {
  const bot = new Bot(process.env.BOT_TOKEN!);

  bot.command('start', startCommand);
  bot.on('callback_query:data', handleCallback);

  // Intercept text messages for deposit amount step
  bot.on('message:text', async (ctx) => {
    const session = getDepositSession(ctx.from!.id);
    if (session?.step === 'awaiting_amount') {
      await handleDepositAmount(ctx);
    }
  });

  // Intercept photo messages for deposit screenshot step
  bot.on('message:photo', async (ctx) => {
    const session = getDepositSession(ctx.from!.id);
    if (session?.step === 'awaiting_screenshot') {
      await handleDepositScreenshot(ctx);
    }
  });

  bot.catch((err) => {
    console.error(`Bot error for update ${err.ctx.update.update_id}:`, err.error);
  });

  await bot.start({ onStart: (info) => console.log(`🤖 @${info.username} is running!`) });
}

main().catch(console.error);
