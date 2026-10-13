-- Add first_name tracking to bingo games and players
ALTER TABLE bingo_players ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE bingo_games ADD COLUMN IF NOT EXISTS winner_first_name TEXT;
