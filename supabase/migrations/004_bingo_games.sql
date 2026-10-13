CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS bingo_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id TEXT UNIQUE NOT NULL,
  stake NUMERIC(10,2) NOT NULL DEFAULT 0,
  derash NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'calling', 'finished')),
  called_numbers JSONB DEFAULT '[]'::jsonb,
  call_interval_seconds INT NOT NULL DEFAULT 5,
  winner_cartela INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bingo_games_status ON bingo_games(status);
CREATE INDEX IF NOT EXISTS idx_bingo_games_game_id ON bingo_games(game_id);

ALTER TABLE bingo_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON bingo_games;
CREATE POLICY "anon_all" ON bingo_games FOR ALL TO anon USING (true) WITH CHECK (true);

-- Realtime pushes called_numbers updates to all connected players
ALTER TABLE bingo_games REPLICA IDENTITY FULL;
