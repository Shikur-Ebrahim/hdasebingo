import { getInitData } from './telegram';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': getInitData(), ...opts.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export const api = {
  verify: () => req('/auth/verify', { method: 'POST' }),
  getRoom: (code: string) => req<{ room: any; players: any[]; calledNumbers: number[] }>(`/game/room/${code}`),
  getMyCard: (code: string) => req<{ player: any }>(`/game/room/${code}/mycard`),
  markCell: (code: string, row: number, col: number) =>
    req<{ success: boolean; markedCells: boolean[][] }>(`/game/room/${code}/mark`, { method: 'POST', body: JSON.stringify({ row, col }) }),
  claimBingo: (code: string) => req<{ success: boolean; winner: string }>(`/game/room/${code}/bingo`, { method: 'POST' }),
  leaderboard: () => req<{ leaderboard: any[] }>('/game/leaderboard'),
  profile: () => req<{ player: any }>('/player/profile'),
  history: () => req<{ history: any[] }>('/player/history'),
};
