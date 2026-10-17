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

  // Resolve promoter_ref → inviter_id UUID
  let resolvedInviterUuid: string | null = null;
  const rawPromoterRef = req.body?.promoter_ref || null;
  if (typeof rawPromoterRef === 'string' && rawPromoterRef.trim()) {
    const cleanRef = rawPromoterRef.replace('ref_', '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanRef);
    const { data: promoterUser } = await (isUuid
      ? supabase.from('users').select('id').eq('id', cleanRef).maybeSingle()
      : supabase.from('users').select('id').eq('telegram_id', cleanRef).maybeSingle()
    );
    if (promoterUser?.id) {
      resolvedInviterUuid = promoterUser.id;
    }
  }
  
  // Check if user already exists
  const { data: existing } = await supabase.from('users').select('*').eq('telegram_id', user.id.toString()).maybeSingle();
  if (existing && existing.status === 'inactive') {
    res.status(403).json({ error: 'Your account has been deactivated.' });
    return;
  }

  if (existing) {
    const updatePayload: any = { username: user.username || user.first_name, first_name: user.first_name };
    if (invitedRoomId) {
      // Always update to latest scanned room so new QR scans take effect immediately
      updatePayload.room_id = invitedRoomId;
    }
    // Only set inviter_id if not already set (first-time promoter attribution)
    if (!existing.inviter_id && resolvedInviterUuid) {
      updatePayload.inviter_id = resolvedInviterUuid;
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
    if (resolvedInviterUuid) {
      insertPayload.inviter_id = resolvedInviterUuid; // Store promoter UUID!
    }
    const { data, error } = await supabase
      .from('users')
      .insert(insertPayload)
      .select().single();
    if (error) {
      delete insertPayload.room_id;
      delete insertPayload.inviter_id;
      const fallback = await supabase.from('users').insert(insertPayload).select().single();
      if (fallback.error) { res.status(500).json({ error: fallback.error.message }); return; }
      res.json({ user: fallback.data });
      return;
    }
    res.json({ user: data });
  }
});

export default router;
