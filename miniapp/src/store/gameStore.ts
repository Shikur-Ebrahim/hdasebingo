import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';
import WebApp from '@twa-dev/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Clear legacy cached rooms for all users
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    // Remove old cache keys that had preset rooms
    ['hdasebingo-cache', 'hdasebingo-rooms', 'hdasebingo-cache-v2'].forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw && (raw.includes('preset-') || raw.includes('Abay') || raw.includes('Renaissance Dam'))) {
        localStorage.removeItem(key);
      }
    });
  } catch {}
}

export interface Room {
  id: string;
  room_name: string;
  agent_id?: string;
  agent_name?: string;
  total_players: number;
  total_games: number;
  status: string;
}

interface GameStore {
  user: User | null;
  loading: boolean;
  error: string | null;
  isBlocked: boolean;
  isProfileOpen: boolean;
  isDarkMode: boolean;
  language: 'en' | 'am';
  rooms: Room[];
  setLanguage: (lang: 'en' | 'am') => void;
  setProfileOpen: (isOpen: boolean) => void;
  toggleDarkMode: () => void;
  fetchUser: () => Promise<void>;
  subscribeToBalance: () => () => void;
  fetchRooms: () => Promise<void>;
  subscribeToRooms: () => () => void;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      error: null,
      isBlocked: false,
      isProfileOpen: false,
      isDarkMode: false,
      language: 'en',
      rooms: [],

      setLanguage: (lang) => set({ language: lang }),
      setProfileOpen: (isOpen: boolean) => set({ isProfileOpen: isOpen }),
      toggleDarkMode: () => set((state) => {
        const newMode = !state.isDarkMode;
        if (newMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return { isDarkMode: newMode };
      }),

      fetchRooms: async () => {
        try {
          let loadedRooms: Room[] | null = null;
          // 1. Try backend API first
          try {
            let initData = '';
            if (typeof WebApp !== 'undefined' && WebApp.initData) {
              initData = WebApp.initData;
            }
            const res = await fetch(`${API_URL}/player/rooms`, {
              headers: {
                'Content-Type': 'application/json',
                'x-telegram-init-data': initData,
              },
            });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.rooms) && data.rooms.length > 0) {
                loadedRooms = data.rooms.filter((r: any) => !String(r.id).startsWith('preset-'));
              }
            }
          } catch {
            // fallback to direct Supabase query
          }

          // 2. If API didn't return rooms or errored, fetch directly from Supabase (100% resilient fallback)
          if (!loadedRooms || loadedRooms.length === 0) {
            const { data: dbRooms, error } = await supabase
              .from('rooms')
              .select('id, room_name, agent_id, agent_name, total_games, status, created_at')
              .eq('status', 'active')
              .order('created_at', { ascending: true });

            if (!error && Array.isArray(dbRooms) && dbRooms.length > 0) {
              const { data: activeGames } = await supabase
                .from('bingo_games')
                .select('room_id, total_players')
                .in('status', ['waiting', 'calling']);

              const roomPlayersMap: Record<string, number> = {};
              (activeGames || []).forEach((g: any) => {
                if (g.room_id) {
                  roomPlayersMap[g.room_id] = (roomPlayersMap[g.room_id] || 0) + Number(g.total_players || 0);
                }
              });

              loadedRooms = dbRooms.map((r: any) => ({
                id: r.id,
                room_name: r.room_name,
                agent_id: r.agent_id,
                agent_name: r.agent_name,
                total_games: Number(r.total_games || 0),
                total_players: roomPlayersMap[r.id] || 0,
                status: r.status,
              }));
            }
          }

          if (loadedRooms && loadedRooms.length > 0) {
            set({ rooms: loadedRooms });
          }
        } catch (err) {
          console.error('Error fetching rooms:', err);
        }
      },

      subscribeToRooms: () => {
        const channel = supabase
          .channel(`public-rooms-sync-${Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'rooms' },
            () => {
              get().fetchRooms();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'bingo_games' },
            () => {
              get().fetchRooms();
            }
          )
          .subscribe();

        return () => { supabase.removeChannel(channel); };
      },

      fetchUser: async () => {
        try {
          // Instantly show UI using Telegram data if no cache exists
          if (!get().user && typeof WebApp !== 'undefined' && WebApp.initDataUnsafe?.user) {
            const tgUser = WebApp.initDataUnsafe.user;
            set({
              user: {
                id: 'temp',
                telegram_id: tgUser.id.toString(),
                username: tgUser.username || '',
                first_name: tgUser.first_name || 'User',
                main_balance: 0,
                bonus_balance: 0,
                role: 'user',
                total_wins: 0
              }
            });
          }

          let initData = '';
          if (typeof WebApp !== 'undefined' && WebApp.initData) {
            initData = WebApp.initData;
          }
          
          // Silently fetch real data in background
          const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-telegram-init-data': initData,
            },
          });

          if (response.ok) {
            const data = await response.json();
            set({ user: data.user, loading: false, isBlocked: false });
          } else if (response.status === 403) {
            set({ loading: false, isBlocked: true, user: null });
          }
        } catch (error: any) {
          console.error('Error fetching user:', error);
          set({ loading: false });
        }
      },

      // Realtime subscription — updates balance instantly when admin approves
      subscribeToBalance: () => {
        const telegramId = get().user?.telegram_id;
        if (!telegramId) return () => {};

        const channel = supabase
          .channel(`user-balance-${telegramId}-${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `telegram_id=eq.${telegramId}`,
            },
            (payload) => {
              const updated = payload.new as User;
              set((state) => ({
                user: state.user ? { ...state.user, main_balance: updated.main_balance, bonus_balance: updated.bonus_balance } : state.user,
              }));
            }
          )
          .subscribe();

        return () => { supabase.removeChannel(channel); };
      },
    }),
    {
      name: 'hdasebingo-v4',
      partialize: (state) => ({
        user: state.user,
        language: state.language,
        isDarkMode: state.isDarkMode,
      }),
    }
  )
);
