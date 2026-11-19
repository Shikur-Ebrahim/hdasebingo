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
  room_number?: number;
  agent_id?: string;
  agent_name?: string;
  total_players: number;
  total_games: number;
  status: string;
  commission_rate?: number;
  is_pinned?: boolean;
  is_private?: boolean;
  system_players_pro_level?: number;
  system_players_enabled?: boolean;
  stakes?: number[];
  created_at?: string;
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
  isAuthModalOpen: boolean;
  setAuthModalOpen: (isOpen: boolean) => void;
  loginPwa: (user: User, token: string) => void;
  logoutPwa: () => void;
  setLanguage: (lang: 'en' | 'am') => void;
  setProfileOpen: (isOpen: boolean) => void;
  toggleDarkMode: () => void;
  fetchUser: () => Promise<void>;
  refreshBalance: () => Promise<void>;
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
      isAuthModalOpen: false,

      setAuthModalOpen: (isOpen: boolean) => set({ isAuthModalOpen: isOpen }),
      loginPwa: (user: User, token: string) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('hdase_pwa_token', token);
        }
        set({ user, loading: false, isBlocked: false, isAuthModalOpen: false });
      },
      logoutPwa: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('hdase_pwa_token');
        }
        set({ user: null, loading: false, isAuthModalOpen: false });
      },
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
            let userInvitedRoomId = '';
            const userDbRoom = (get().user as any)?.room_id;
            const storedRoom = typeof window !== 'undefined' && window.localStorage ? localStorage.getItem('hdase_invited_room_id') : null;
            if (userDbRoom && userDbRoom !== 'd7c9114a-e112-426f-8f9b-13c00050279c') {
              userInvitedRoomId = userDbRoom;
            } else if (storedRoom && storedRoom !== 'd7c9114a-e112-426f-8f9b-13c00050279c') {
              userInvitedRoomId = storedRoom;
            } else {
              userInvitedRoomId = userDbRoom || storedRoom || '';
            }
            const queryParam = userInvitedRoomId ? `?invited_room_id=${encodeURIComponent(userInvitedRoomId)}` : '';
            const res = await fetch(`${API_URL}/player/rooms${queryParam}`, {
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
              .select('*')
              .eq('status', 'active');

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
                room_number: r.room_number !== undefined && r.room_number !== null ? Number(r.room_number) : undefined,
                agent_id: r.agent_id,
                agent_name: r.agent_name,
                total_games: Number(r.total_games || 0),
                total_players: roomPlayersMap[r.id] || 0,
                status: r.status,
                is_pinned: Boolean(r.is_pinned),
                is_private: Boolean(r.is_private),
                commission_rate: r.commission_rate ?? 8,
                created_at: r.created_at,
              }));

              // Pinned rooms ALWAYS come first, then room_number ascending
              loadedRooms.sort((a, b) => {
                if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) {
                  return b.is_pinned ? 1 : -1;
                }
                if (a.room_number !== undefined && b.room_number !== undefined && a.room_number !== b.room_number) {
                  return Number(a.room_number) - Number(b.room_number);
                }
                return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
              });
            }
          }

          if (loadedRooms && loadedRooms.length > 0) {
            const userDbRoom = (get().user as any)?.room_id;
            const storedRoom = typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null;
            const invitedRoomId = (userDbRoom && userDbRoom !== 'd7c9114a-e112-426f-8f9b-13c00050279c')
              ? userDbRoom
              : (storedRoom || userDbRoom || null);
            loadedRooms.sort((a, b) => {
              // 1. PINNED rooms ALWAYS have top priority
              if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) {
                return b.is_pinned ? 1 : -1;
              }
              // 2. User's invited/assigned room next
              const aInv = Boolean(invitedRoomId && a.id === invitedRoomId);
              const bInv = Boolean(invitedRoomId && b.id === invitedRoomId);
              if (aInv !== bInv) return aInv ? -1 : 1;

              return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
            });
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

          const rawInvitedRoom = typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null;
          // Only pass a specific agent room as invited room_id; never send generic default room to avoid overwriting user's DB room
          const invitedRoomId = (rawInvitedRoom && rawInvitedRoom !== 'd7c9114a-e112-426f-8f9b-13c00050279c') ? rawInvitedRoom : null;
          const promoterRef = typeof window !== 'undefined' ? localStorage.getItem('hdase_promoter_ref') : null;
          
          // Silently fetch real data in background
          if (initData) {
            const response = await fetch(`${API_URL}/auth/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-telegram-init-data': initData,
              },
              body: JSON.stringify({ room_id: invitedRoomId, promoter_ref: promoterRef }),
            });

            if (response.ok) {
              const data = await response.json();
              set({ user: data.user, loading: false, isBlocked: false });
            } else if (response.status === 403) {
              set({ loading: false, isBlocked: true, user: null });
            }
          } else {
            // Outside Telegram Mini App: check stored PWA token
            const pwaToken = typeof window !== 'undefined' ? localStorage.getItem('hdase_pwa_token') : null;
            if (pwaToken) {
              const response = await fetch(`${API_URL}/auth/me`, {
                headers: {
                  'Content-Type': 'application/json',
                  'x-pwa-auth': pwaToken,
                },
              });
              if (response.ok) {
                const data = await response.json();
                set({ user: data.user, loading: false, isBlocked: false, isAuthModalOpen: false });
              } else if (response.status === 403) {
                set({ loading: false, isBlocked: true, user: null });
              } else {
                if (typeof window !== 'undefined') localStorage.removeItem('hdase_pwa_token');
                set({ user: null, loading: false, isAuthModalOpen: false });
              }
            } else {
              // Visitor without account: allow browsing leaderboard & rooms freely
              set({ user: null, loading: false, isAuthModalOpen: false });
            }
          }
        } catch (error: any) {
          console.error('Error fetching user:', error);
          set({ loading: false });
        }
      },

      // Fast lightweight balance fetch (sub-5ms)
      refreshBalance: async () => {
        try {
          const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
          const pwaToken = typeof window !== 'undefined' ? (localStorage.getItem('hdase_pwa_token') || localStorage.getItem('pwa_token')) : null;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (initData) headers['x-telegram-init-data'] = initData;
          if (pwaToken) headers['x-pwa-auth'] = pwaToken;

          if (!initData && !pwaToken) return;

          const res = await fetch(`${API_URL}/player/balance`, { headers });
          if (res.ok) {
            const data = await res.json();
            set((state) => {
              if (!state.user) return state;
              const newMain = Number(data.main_balance ?? state.user.main_balance);
              const newBonus = Number(data.bonus_balance ?? state.user.bonus_balance);
              if (
                state.user.main_balance === newMain &&
                state.user.bonus_balance === newBonus
              ) {
                return state;
              }
              return {
                user: {
                  ...state.user,
                  main_balance: newMain,
                  bonus_balance: newBonus,
                }
              };
            });
          }
        } catch {
          // silent fallback
        }
      },

      // Realtime subscription — updates balance instantly when admin or worker approves or transfers
      subscribeToBalance: () => {
        const currentUser = get().user;
        const telegramId = currentUser?.telegram_id;
        const userId = currentUser?.id;
        if (!telegramId && !userId) return () => {};

        const channelName = `user-balance-${telegramId || userId}-${Date.now()}`;
        let ch = supabase.channel(channelName);

        // 1. Listen on users table by primary key UUID (if present and not temp)
        if (userId && userId !== 'temp') {
          ch = ch.on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `id=eq.${userId}`,
            },
            (payload) => {
              const updated = payload.new as any;
              if (updated) {
                set((state) => {
                  if (!state.user) return state;
                  return {
                    user: {
                      ...state.user,
                      main_balance: Number(updated.main_balance ?? state.user.main_balance),
                      bonus_balance: Number(updated.bonus_balance ?? state.user.bonus_balance),
                    }
                  };
                });
              }
            }
          );
        }

        // 2. Listen on users table by telegram_id
        if (telegramId) {
          ch = ch.on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `telegram_id=eq.${telegramId}`,
            },
            (payload) => {
              const updated = payload.new as any;
              if (updated) {
                set((state) => {
                  if (!state.user) return state;
                  return {
                    user: {
                      ...state.user,
                      main_balance: Number(updated.main_balance ?? state.user.main_balance),
                      bonus_balance: Number(updated.bonus_balance ?? state.user.bonus_balance),
                    }
                  };
                });
              }
            }
          )
          // 3. Listen on deposits table for instant approval event
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'deposits',
              filter: `telegram_id=eq.${telegramId}`,
            },
            (payload) => {
              const updated = payload.new as any;
              if (updated?.status === 'approved') {
                get().refreshBalance();
                if (typeof WebApp !== 'undefined') {
                  WebApp.HapticFeedback?.notificationOccurred('success');
                }
              }
            }
          );
        }

        ch.subscribe();

        return () => {
          supabase.removeChannel(ch);
        };
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
