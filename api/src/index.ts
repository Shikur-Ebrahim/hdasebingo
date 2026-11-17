import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { corsMiddleware } from './middleware/cors';
import authRouter from './routes/auth';
import playerRouter from './routes/player';
import uploadRouter from './routes/upload';
import adminRouter from './routes/admin';
import depositRouter from './routes/deposit';
import withdrawRouter from './routes/withdraw';
import bingoRouter from './routes/bingo';
import leaderboardRouter from './routes/leaderboard';
import adminSettingsRouter from './routes/adminSettings';
import supportRouter from './routes/support';
import { engine as bingoEngine } from './services/BingoEngine';
import broadcastRouter from './routes/broadcast';
import { startBroadcastScheduler } from './routes/broadcast';
import agentBankRouter from './routes/agentBank';
import agentBankAdminRouter from './routes/agentBankAdmin';
import { agentWithdrawRouter, adminAgentWithdrawRouter } from './routes/agentWithdraw';
import channelProofsRouter from './routes/channelProofs';
import systemProofsRouter from './routes/systemProofs';
import systemPlayersRouter from './routes/systemPlayers';
import { systemPlayerService } from './services/systemPlayerService';
import { supabase } from './services/supabase';

const app = express();
const PORT = process.env.PORT || 3002;

async function ensureHdaseRoomSetup() {
  try {
    const HDASE_ROOM_ID = 'd7c9114a-e112-426f-8f9b-13c00050279c';
    const HDASE_AGENT_ID = '5b3ac1f4-6a29-4929-9fc4-5043c0118572';

    // 1. Fetch admin user from users table
    const { data: adminUser } = await supabase
      .from('users')
      .select('id, first_name, username')
      .or(`id.eq.${HDASE_AGENT_ID},role.eq.admin`)
      .limit(1)
      .maybeSingle();

    const targetAdminId = adminUser?.id || HDASE_AGENT_ID;
    const targetAdminName = adminUser?.first_name || adminUser?.username || 'Admin';

    // 2. Fetch or update HDASE BINGO room
    const { data: existingRoom } = await supabase
      .from('rooms')
      .select('id, agent_id')
      .or(`id.eq.${HDASE_ROOM_ID},room_name.eq.HDASE BINGO`)
      .maybeSingle();

    if (existingRoom) {
      await supabase
        .from('rooms')
        .update({
          agent_id: targetAdminId,
          agent_name: targetAdminName,
          system_players_pro_level: 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRoom.id);
      console.log(`✅ HDASE BINGO room [${existingRoom.id}] agent_id synced to Admin ID [${targetAdminId}]`);
    } else {
      await supabase
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
        });
      console.log(`✅ HDASE BINGO room created and synced to Admin ID [${targetAdminId}]`);
    }
  } catch (err) {
    console.error('Failed to ensure HDASE room setup:', err);
  }
}

app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'hdasebingo-api' }));
app.get(['/api/manifest', '/api/manifest.json', '/api/manifest.webmanifest'], (req, res, next) => {
  req.url = '/manifest' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  playerRouter(req, res, next);
});
app.use('/api/auth', authRouter);
app.use('/api/player', playerRouter);
app.use('/api/system-players', systemPlayersRouter);
app.use('/api/player/system-players', systemPlayersRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/admin', adminRouter);
app.use('/api/deposit', depositRouter);
app.use('/api/withdraw', withdrawRouter);
app.use('/api/bingo', bingoRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin/game-settings', adminSettingsRouter);
app.use('/api/support', supportRouter);
app.use('/api/broadcast', broadcastRouter);
app.use('/api/agent-bank', agentBankRouter);
app.use('/api/admin/agent-bank', agentBankAdminRouter);
app.use('/api/agent-withdraw', agentWithdrawRouter);
app.use('/api/admin/agent-withdrawals', adminAgentWithdrawRouter);
app.use('/api/channel-proofs', channelProofsRouter);
app.use('/api/system-proofs', systemProofsRouter);

app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
  bingoEngine.start();
  systemPlayerService.backfillSystemPlayersTelegramId();
  startBroadcastScheduler();
  ensureHdaseRoomSetup();
});
