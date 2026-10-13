-- 012_bingo_players_balance_source.sql
-- Track how much of the stake came from bonus vs main balance so refunds go back to the right wallet
ALTER TABLE bingo_players ADD COLUMN IF NOT EXISTS bonus_used  NUMERIC DEFAULT 0;
ALTER TABLE bingo_players ADD COLUMN IF NOT EXISTS main_used   NUMERIC DEFAULT 0;
