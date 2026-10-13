import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export function subscribeToRoom(
  roomId: string,
  onNumber: (n: number) => void,
  onRoomChange: (room: any) => void
) {
  const channel = supabase.channel(`room-${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'called_numbers', filter: `room_id=eq.${roomId}` }, p => onNumber(p.new.number))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, p => onRoomChange(p.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
