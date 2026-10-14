-- Remove the game_id column from bingo_games
-- The UUID id column is used directly; first 9 chars displayed as game identifier

DROP INDEX IF EXISTS idx_bingo_games_game_id;
ALTER TABLE public.bingo_games DROP COLUMN IF EXISTS game_id;
