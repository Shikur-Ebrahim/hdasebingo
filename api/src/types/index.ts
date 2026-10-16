export interface User {
  id: string;
  telegram_id: string;
  username: string;
  first_name: string;
  main_balance: number;
  bonus_balance: number;
  role: 'admin' | 'worker' | 'agent' | 'promoter' | 'user';
  total_games: number;
  total_wins: number;
}
