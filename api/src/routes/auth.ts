import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

router.post('/verify', validateTelegramAuth, async (req: AuthRequest, res) => {
  const user = req.telegramUser!;
  
  // Check if user already exists
  const { data: existing } = await supabase.from('users').select('*').eq('telegram_id', user.id.toString()).maybeSingle();
  if (existing && existing.status === 'inactive') {
    res.status(403).json({ error: 'Your account has been deactivated.' });
    return;
  }

  if (existing) {
    const { data, error } = await supabase
      .from('users')
      .update({ username: user.username || user.first_name, first_name: user.first_name })
      .eq('telegram_id', user.id.toString())
      .select().single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ user: data });
  } else {
    // New user: fetch welcome bonus from settings (default 10)
    const { data: settingRow } = await supabase.from('settings').select('value').eq('key', 'welcome_bonus_amount').maybeSingle();
    const welcomeBonus = settingRow && !isNaN(Number(settingRow.value)) ? Number(settingRow.value) : 10;

    const { data, error } = await supabase
      .from('users')
      .insert({
        telegram_id: user.id.toString(),
        username: user.username || user.first_name,
        first_name: user.first_name,
        main_balance: 0,
        bonus_balance: welcomeBonus,
      })
      .select().single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ user: data });
  }
});

export default router;
