import { supabase } from './supabase';
import { User } from '../types';

export async function upsertUser(telegramId: string, username: string, firstName: string, inviterId?: string, roomId?: string): Promise<User> {
  const { data: existing } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
  
  if (existing) {
    if (existing.status === 'inactive') {
      throw new Error('ACCOUNT_INACTIVE');
    }

    const updatePayload: any = { username, first_name: firstName };
    if (roomId) {
      updatePayload.room_id = roomId;
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
    // New user: fetch welcome bonus from settings (default 10)
    const { data: settingRow } = await supabase.from('settings').select('value').eq('key', 'welcome_bonus_amount').maybeSingle();
    const welcomeBonus = settingRow && !isNaN(Number(settingRow.value)) ? Number(settingRow.value) : 10;

    const insertPayload: any = {
      telegram_id: telegramId,
      username,
      first_name: firstName,
      inviter_id: inviterId || null,
      main_balance: 0,
      bonus_balance: welcomeBonus,
    };
    if (roomId) {
      insertPayload.room_id = roomId;
    }

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
