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
      if (effectiveRoomId && effectiveRoomId !== 'd7c9114a-e112-426f-8f9b-13c00050279c') {
        updateData.room_id = effectiveRoomId;
      } else if (!existingUser.room_id) {
        updateData.room_id = effectiveRoomId;
      }
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

// ── POST /api/auth/login — PWA & Web Visitor Login (by Telegram ID or Phone) ────────────
router.post('/login', async (req, res) => {
  try {
    const { identifier, phone_number, telegram_id, password } = req.body || {};
    const rawIdentifier = (identifier || telegram_id || phone_number || '').toString().trim();
    const safePassword = (password || '').toString();

    if (!rawIdentifier) {
      res.status(400).json({ error: 'Please enter your Telegram ID or phone number • የቴሌግራም ID ወይም ስልክ ቁጥር ያስገቡ' });
      return;
    }

    if (!safePassword) {
      res.status(400).json({ error: 'Please enter your password • የይለፍ ቃል ያስገቡ' });
      return;
    }

    const cleanId = rawIdentifier.replace(/^@/, '').trim();

    // 1. First, search by exact telegram_id (matches numeric Telegram ID like "8921867837" or phone-based "251912345678")
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', cleanId)
      .maybeSingle();

    // 2. If not found, check if input is an Ethiopian phone number (e.g. "0912345678", "912345678", "+251912345678")
    if (!user) {
      const cleanPhone = normalizeEthiopianPhone(cleanId);
      if (cleanPhone) {
        const phoneTgId = `251${cleanPhone}`;
        const { data: phoneUser } = await supabase
          .from('users')
          .select('*')
          .or(`telegram_id.eq.${phoneTgId},phone_number.eq.${cleanPhone},phone_number.eq.+251${cleanPhone}`)
          .maybeSingle();
        if (phoneUser) user = phoneUser;
      }
    }

    // 3. If still not found, check by username
    if (!user) {
      const { data: unameUser } = await supabase
        .from('users')
        .select('*')
        .ilike('username', cleanId)
        .maybeSingle();
      if (unameUser) user = unameUser;
    }

    if (!user) {
      res.status(401).json({ error: 'Account not found. Please check your Telegram ID / phone or register first.' });
      return;
    }

    if (user.status === 'inactive') {
      res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' });
      return;
    }

    if (!user.password_hash) {
      res.status(400).json({
        error: 'No password has been set for this account yet. Open the bot on Telegram and save a password in Profile!'
      });
      return;
    }

    const isMatch = verifyPassword(safePassword, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Incorrect password. Please try again • የተሳሳተ ይለፍ ቃል' });
      return;
    }

    const token = generatePwaToken({ telegram_id: user.telegram_id, id: user.id });
    res.json({ success: true, user, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// ── POST /api/auth/set-password — Set or Update Password (Telegram Mini App & PWA) ──
router.post('/set-password', validateTelegramAuth, async (req: AuthRequest, res) => {
  try {
    const { new_password, password, current_password } = req.body || {};
    const safeNew = (new_password || password || '').toString().trim();
    const safeCurr = (current_password || '').toString().trim();

    if (!safeNew || safeNew.length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters • የይለፍ ቃል ቢያንስ 4 ፊደል መሆን አለበት' });
      return;
    }

    const telegramId = req.telegramUser!.id.toString();
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (userErr || !user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If caller is in PWA (not Telegram WebApp initData verified) and already has a password, verify current password
    const isTelegramVerified = Boolean(req.headers['x-telegram-init-data']);
    if (user.password_hash && !isTelegramVerified) {
      if (!safeCurr) {
        res.status(400).json({ error: 'Please enter your current password • የድሮውን ይለፍ ቃል ያስገቡ' });
        return;
      }
      const isMatch = verifyPassword(safeCurr, user.password_hash);
      if (!isMatch) {
        res.status(400).json({ error: 'Current password is incorrect • ያስገቡት የድሮ ይለፍ ቃል የተሳሳተ ነው' });
        return;
      }
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

    res.json({
      success: true,
      message: 'Password saved successfully! You can now log into the PWA app using your Telegram ID and this password. • የይለፍ ቃልዎ ተቀምጧል!',
      user: { ...user, password_hash: newHash },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save password' });
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
  const startParam = typeof req.body?.start_param === 'string' ? req.body.start_param.trim() : '';
  let explicitRoomId: string | null = null;
  let rawPromoterRef: string | null = req.body?.promoter_ref || null;

  // Extract both ref and room from startParam if present (e.g. ref_123_room_456 or room_456)
  if (startParam) {
    if (startParam.includes('ref_')) {
      const m = startParam.match(/ref_([a-zA-Z0-9-]+)/);
      if (m && !rawPromoterRef) rawPromoterRef = m[1];
    }
    if (startParam.includes('room_')) {
      const m = startParam.match(/room_([a-zA-Z0-9-]+)/);
      if (m) explicitRoomId = m[1];
    } else if (!explicitRoomId && !startParam.includes('ref_')) {
      explicitRoomId = startParam;
    }
  }

  // Also check direct room_id in body
  if (!explicitRoomId && req.body?.room_id) {
    const raw = String(req.body.room_id).trim();
    explicitRoomId = raw.startsWith('room_') ? raw.replace('room_', '').trim() : raw;
  }

  // Resolve promoter_ref → inviter_id UUID & inherited room
  let resolvedInviterUuid: string | null = null;
  let inviterRoomId: string | null = null;
  if (typeof rawPromoterRef === 'string' && rawPromoterRef.trim()) {
    const cleanRef = rawPromoterRef.replace('ref_', '').trim();
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

  const effectiveInvitedRoomId = explicitRoomId || inviterRoomId || null;

  // Fallback default room ID if user has no room
  let defaultRoomId = 'd7c9114a-e112-426f-8f9b-13c00050279c';
  try {
    const { data: defRoom } = await supabase
      .from('rooms')
      .select('id')
      .or('id.eq.d7c9114a-e112-426f-8f9b-13c00050279c,room_name.ilike.%hdase%')
      .limit(1)
      .maybeSingle();
    if (defRoom?.id) defaultRoomId = defRoom.id;
  } catch {}
  
  // Check if user already exists
  const { data: existing } = await supabase.from('users').select('*').eq('telegram_id', user.id.toString()).maybeSingle();
  if (existing && existing.status === 'inactive') {
    res.status(403).json({ error: 'Your account has been deactivated.' });
    return;
  }

  if (existing) {
    const updatePayload: any = { username: user.username || user.first_name, first_name: user.first_name };
    const isOfficialHdase = effectiveInvitedRoomId === defaultRoomId || effectiveInvitedRoomId === 'd7c9114a-e112-426f-8f9b-13c00050279c';
    if (effectiveInvitedRoomId && !isOfficialHdase) {
      // User explicitly joined or scanned a SPECIFIC agent room (different from default)
      updatePayload.room_id = effectiveInvitedRoomId;
    } else if (!existing.room_id) {
      // Only set default room if user has NO room assigned at all (first-time user without room)
      updatePayload.room_id = effectiveInvitedRoomId || defaultRoomId;
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
      room_id: effectiveInvitedRoomId || defaultRoomId,
    };
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
