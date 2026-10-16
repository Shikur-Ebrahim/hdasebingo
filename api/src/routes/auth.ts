import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

router.post('/verify', validateTelegramAuth, async (req: AuthRequest, res) => {
  const user = req.telegramUser!;
  const rawRoomId = req.body?.room_id || req.body?.start_param || null;
  let invitedRoomId: string | null = null;
  if (typeof rawRoomId === 'string' && rawRoomId.trim()) {
    invitedRoomId = rawRoomId.startsWith('room_') ? rawRoomId.replace('room_', '').trim() : rawRoomId.trim();
  }
  
  // Check if user already exists
  const { data: existing } = await supabase.from('users').select('*').eq('telegram_id', user.id.toString()).maybeSingle();
  if (existing && existing.status === 'inactive') {
    res.status(403).json({ error: 'Your account has been deactivated.' });
    return;
  }

  if (existing) {
    const updatePayload: any = { username: user.username || user.first_name, first_name: user.first_name };
    if (invitedRoomId && !existing.room_id) {
      updatePayload.room_id = invitedRoomId;
    }
    const { data, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('telegram_id', user.id.toString())
      .select().single();
    if (error) {
      // Fallback without room_id in case column is not yet in schema
      const fallback = await supabase
        .from('users')
        .update({ username: user.username || user.first_name, first_name: user.first_name })
        .eq('telegram_id', user.id.toString())
        .select().single();
      res.json({ user: fallback.data || existing });
      return;
    }
    res.json({ user: data });
  } else {
    // New user: fetch welcome bonus from settings (default 10)
    const { data: settingRow } = await supabase.from('settings').select('value').eq('key', 'welcome_bonus_amount').maybeSingle();
    const welcomeBonus = settingRow && !isNaN(Number(settingRow.value)) ? Number(settingRow.value) : 10;

    const insertPayload: any = {
      telegram_id: user.id.toString(),
      username: user.username || user.first_name,
      first_name: user.first_name,
      main_balance: 0,
      bonus_balance: welcomeBonus,
    };
    if (invitedRoomId) {
      insertPayload.room_id = invitedRoomId;
    }
    const { data, error } = await supabase
      .from('users')
      .insert(insertPayload)
      .select().single();
    if (error) {
      delete insertPayload.room_id;
      const fallback = await supabase.from('users').insert(insertPayload).select().single();
      if (fallback.error) { res.status(500).json({ error: fallback.error.message }); return; }
      res.json({ user: fallback.data });
      return;
    }
    res.json({ user: data });
  }
});

export default router;
