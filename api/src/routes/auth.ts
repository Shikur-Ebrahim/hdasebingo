import { Router } from 'express';
import { AuthRequest, validateTelegramAuth, hashPassword, verifyPassword, generatePwaToken } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

// Normalizes Ethiopian phone number to 9 digits starting with 9 or 7
export function normalizeEthiopianPhone(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('251')) {
    digits = digits.slice(3);
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (/^[97]\d{8}$/.test(digits)) {
    return digits;
  }
  return null;
}

// ── GET /api/auth/me — Check current session (Telegram initData or PWA token) ─
router.get('/me', validateTelegramAuth, async (req: AuthRequest, res) => {
  try {
    const telegramId = req.telegramUser!.id.toString();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (error || !user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/register — PWA & Web Visitor Registration ──────────────────
router.post('/register', async (req, res) => {
  try {
    const { first_name, phone_number, password, room_id, promoter_ref } = req.body || {};

    // 1. Validate full name
    const safeName = (first_name || '').toString().trim();
    if (!safeName || safeName.length < 2) {
      res.status(400).json({ error: 'Please enter your full name (minimum 2 characters).' });
      return;
    }

    // 2. Validate and normalize Ethiopian phone
    const cleanPhone = normalizeEthiopianPhone(phone_number);
    if (!cleanPhone) {
      res.status(400).json({
        error: 'Invalid Ethiopian phone number. Must be 9 digits starting with 9 or 7 (e.g. 912345678 or 712345678).'
      });
      return;
    }

    // 3. Validate password
    const safePassword = (password || '').toString();
    if (!safePassword || safePassword.length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters long.' });
      return;
    }

    const telegramId = `251${cleanPhone}`; // Direct phone number representation in telegram_id column

    // 4. Resolve promoter/inviter if provided
    let resolvedInviterUuid: string | null = null;
    let inviterRoomId: string | null = null;
    if (typeof promoter_ref === 'string' && promoter_ref.trim()) {
      const cleanRef = promoter_ref.replace('ref_', '').trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanRef);
      const { data: promoterUser } = await (isUuid
        ? supabase.from('users').select('id, room_id').eq('id', cleanRef).maybeSingle()
        : supabase.from('users').select('id, room_id').eq('telegram_id', cleanRef).maybeSingle()
      );
      if (promoterUser?.id) {
        resolvedInviterUuid = promoterUser.id;
        if (promoterUser.room_id) {
          inviterRoomId = promoterUser.room_id;
        }
      }
    }

    // Determine effective room_id:
    // If invited by friend/promoter, inherit that friend's room!
    // Else use selected room_id, or fall back to default HDASE BINGO room!
    let effectiveRoomId = inviterRoomId || room_id || null;
    if (!effectiveRoomId) {
      try {
        const { data: defRoom } = await supabase
          .from('rooms')
          .select('id')
          .or('id.eq.d7c9114a-e112-426f-8f9b-13c00050279c,room_name.ilike.%hdase%')
          .limit(1)
          .maybeSingle();
        effectiveRoomId = defRoom?.id || 'd7c9114a-e112-426f-8f9b-13c00050279c';
      } catch {
        effectiveRoomId = 'd7c9114a-e112-426f-8f9b-13c00050279c';
      }
    }

    // 5. Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (existingUser) {
      if (existingUser.status === 'inactive') {
        res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
        return;
      }
      if (existingUser.password_hash) {
        res.status(409).json({ error: 'This phone number is already registered. Please login with your password.' });
        return;
      }

      // Existing user without password (e.g. registered via Telegram bot before): set password
      const updateData: any = {
        password_hash: hashPassword(safePassword),
        first_name: safeName || existingUser.first_name,
      };
      if (effectiveRoomId) updateData.room_id = effectiveRoomId;
      if (!existingUser.inviter_id && resolvedInviterUuid) updateData.inviter_id = resolvedInviterUuid;

      const { data: updated, error: updateErr } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      const token = generatePwaToken({ telegram_id: updated.telegram_id, id: updated.id });
      res.json({ success: true, user: updated, token });
      return;
    }

    // 6. Fetch welcome bonus setting
    const { data: settingRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'welcome_bonus_amount')
      .maybeSingle();
    const welcomeBonus = settingRow && !isNaN(Number(settingRow.value)) ? Number(settingRow.value) : 0;

    // 7. Insert new user (phone number stored directly in telegram_id)
    const insertPayload: any = {
      telegram_id: telegramId,
      password_hash: hashPassword(safePassword),
      first_name: safeName,
      username: `user_${cleanPhone}`,
      main_balance: 0,
      bonus_balance: welcomeBonus,
      role: 'user',
    };
    if (effectiveRoomId) insertPayload.room_id = effectiveRoomId;
    if (resolvedInviterUuid) insertPayload.inviter_id = resolvedInviterUuid;

    const { data: newUser, error: insertErr } = await supabase
      .from('users')
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      res.status(500).json({ error: insertErr.message });
      return;
    }

    const token = generatePwaToken({ telegram_id: newUser.telegram_id, id: newUser.id });
    res.json({ success: true, user: newUser, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// ── POST /api/auth/login — PWA & Web Visitor Login ────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { phone_number, password } = req.body || {};

    const cleanPhone = normalizeEthiopianPhone(phone_number);
    if (!cleanPhone) {
      res.status(400).json({
        error: 'Invalid Ethiopian phone number. Must be 9 digits starting with 9 or 7.'
      });
      return;
    }

    const safePassword = (password || '').toString();
    if (!safePassword) {
      res.status(400).json({ error: 'Please enter your password.' });
      return;
    }

    const telegramId = `251${cleanPhone}`;

    // Lookup user by phone number stored in telegram_id
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (error || !user) {
      res.status(401).json({ error: 'Account not found. Please register first.' });
      return;
    }

    if (user.status === 'inactive') {
      res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
      return;
    }

    if (!user.password_hash) {
      res.status(400).json({
        error: 'No password has been set for this account yet. Please register to create your password.'
      });
      return;
    }

    const isMatch = verifyPassword(safePassword, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Incorrect password. Please try again.' });
      return;
    }

    const token = generatePwaToken({ telegram_id: user.telegram_id, id: user.id });
    res.json({ success: true, user, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// ── POST /api/auth/change-password — Reset / Change Password for Registered Accounts ──
router.post('/change-password', validateTelegramAuth, async (req: AuthRequest, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    const safeCurr = (current_password || '').toString();
    const safeNew = (new_password || '').toString();

    if (!safeCurr) {
      res.status(400).json({ error: 'Please enter your current password • የድሮውን ይለፍ ቃል ያስገቡ' });
      return;
    }

    if (!safeNew || safeNew.length < 4) {
      res.status(400).json({ error: 'New password must be at least 4 characters • አዲሱ ይለፍ ቃል ቢያንስ 4 ፊደል መሆን አለበት' });
      return;
    }

    const telegramId = req.telegramUser!.id.toString();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (error || !user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (!user.password_hash) {
      res.status(400).json({ error: 'No password is set on this account. Please register with a password.' });
      return;
    }

    const isMatch = verifyPassword(safeCurr, user.password_hash);
    if (!isMatch) {
      res.status(400).json({ error: 'Current password is incorrect • ያስገቡት የድሮ ይለፍ ቃል የተሳሳተ ነው' });
      return;
    }

    const newHash = hashPassword(safeNew);
    const { error: updateErr } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', user.id);

    if (updateErr) {
      res.status(500).json({ error: updateErr.message });
      return;
    }

    res.json({ success: true, message: 'Password updated successfully! • የይለፍ ቃልዎ በተሳካ ሁኔታ ተቀይሯል' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update password.' });
  }
});

// ── POST /api/auth/verify — Legacy & Telegram WebApp User Verification ────────
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
      ? supabase.from('users').select('id, room_id').eq('id', cleanRef).maybeSingle()
      : supabase.from('users').select('id, room_id').eq('telegram_id', cleanRef).maybeSingle()
    );
    if (promoterUser?.id) {
      resolvedInviterUuid = promoterUser.id;
      if (!invitedRoomId && promoterUser.room_id) {
        invitedRoomId = promoterUser.room_id;
      }
    }
  }

  // Fallback to default HDASE BINGO room if no room specified
  if (!invitedRoomId) {
    try {
      const { data: defRoom } = await supabase
        .from('rooms')
        .select('id')
        .or('id.eq.d7c9114a-e112-426f-8f9b-13c00050279c,room_name.ilike.%hdase%')
        .limit(1)
        .maybeSingle();
      invitedRoomId = defRoom?.id || 'd7c9114a-e112-426f-8f9b-13c00050279c';
    } catch {
      invitedRoomId = 'd7c9114a-e112-426f-8f9b-13c00050279c';
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
    // New user: fetch welcome bonus from settings (default 0)
    const { data: settingRow } = await supabase.from('settings').select('value').eq('key', 'welcome_bonus_amount').maybeSingle();
    const welcomeBonus = settingRow && !isNaN(Number(settingRow.value)) ? Number(settingRow.value) : 0;

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
