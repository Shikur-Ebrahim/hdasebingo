import { supabase } from './supabase';
import { User } from '../types';

const HDASE_OFFICIAL_ROOM_ID = 'd7c9114a-e112-426f-8f9b-13c00050279c';

export async function upsertUser(telegramId: string, username: string, firstName: string, inviterId?: string, explicitRoomId?: string): Promise<User> {
  // Resolve inviter UUID if inviterId was provided (could be telegram_id or UUID)
  let resolvedInviterUuid: string | null = null;
  let resolvedRoomId: string | undefined = explicitRoomId;

  if (inviterId) {
    const cleanRef = inviterId.replace('ref_', '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanRef);
    const { data: inviterUser } = await (isUuid
      ? supabase.from('users').select('id, room_id').eq('id', cleanRef).maybeSingle()
      : supabase.from('users').select('id, room_id').eq('telegram_id', cleanRef).maybeSingle()
    );
    if (inviterUser?.id) {
      resolvedInviterUuid = inviterUser.id;
      // Inherit the inviter's room so friends play in the same room!
      if (!resolvedRoomId && inviterUser.room_id) {
        resolvedRoomId = inviterUser.room_id;
      }
    } else if (isUuid) {
      resolvedInviterUuid = cleanRef;
    }
  }

  const { data: existing } = await supabase.from('users').select('*').eq('telegram_id', telegramId).maybeSingle();
  
  if (existing) {
    if (existing.status === 'inactive') {
      throw new Error('ACCOUNT_INACTIVE');
    }

    const updatePayload: any = { username, first_name: firstName };
    
    // If the user was explicitly invited to a specific room (via invite link), update to that room.
    // If user already has a previous room, NEVER overwrite it with the default official room!
    if (resolvedRoomId && resolvedRoomId !== HDASE_OFFICIAL_ROOM_ID) {
      updatePayload.room_id = resolvedRoomId;
    } else if (!existing.room_id) {
      // ONLY set room if user has NO room assigned (null): default to official HDASE BINGO room!
      // If user already has a room (from PWA or prior room), keep it as is!
      updatePayload.room_id = resolvedRoomId || HDASE_OFFICIAL_ROOM_ID;
    }

    if (!existing.inviter_id && resolvedInviterUuid) {
      updatePayload.inviter_id = resolvedInviterUuid;
    }

    const { data, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('telegram_id', telegramId)
      .select().single();
    if (error) {
      delete updatePayload.room_id;
      const fb = await supabase.from('users').update(updatePayload).eq('telegram_id', telegramId).select().single();
      if (fb.error) throw fb.error;
      return fb.data as User;
    }
    return data as User;
  } else {
    // New user
    const { data: settingRow } = await supabase.from('settings').select('value').eq('key', 'welcome_bonus_amount').maybeSingle();
    const welcomeBonus = settingRow && !isNaN(Number(settingRow.value)) ? Number(settingRow.value) : 0;

    const insertPayload: any = {
      telegram_id: telegramId,
      username,
      first_name: firstName,
      inviter_id: resolvedInviterUuid || null,
      main_balance: 0,
      bonus_balance: welcomeBonus,
      // If invited to a room, use that room; otherwise default to official HDASE BINGO room!
      room_id: resolvedRoomId || HDASE_OFFICIAL_ROOM_ID,
    };

    const { data, error } = await supabase
      .from('users')
      .insert(insertPayload)
      .select().single();
    if (error) {
      delete insertPayload.room_id;
      const fb = await supabase.from('users').insert(insertPayload).select().single();
      if (fb.error) throw fb.error;
      return fb.data as User;
    }
    return data as User;
  }
}
