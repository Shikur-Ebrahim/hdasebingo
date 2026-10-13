CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS bingo_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id TEXT UNIQUE NOT NULL,
  stake NUMERIC(10,2) NOT NULL DEFAULT 10,
  prize_pool NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'calling', 'finished')),
  called_numbers JSONB DEFAULT '[]'::jsonb,
  winner_telegram_id TEXT,
  winner_cartela INT,
  start_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bingo_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID REFERENCES bingo_games(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  cartela_number INT NOT NULL CHECK (cartela_number >= 1 AND cartela_number <= 150),
  card_matrix JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, cartela_number),
  UNIQUE(game_id, telegram_id)
);

ALTER TABLE bingo_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all" ON bingo_games;
CREATE POLICY "anon_all" ON bingo_games FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all" ON bingo_tickets;
CREATE POLICY "anon_all" ON bingo_tickets FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE bingo_games REPLICA IDENTITY FULL;
ALTER TABLE bingo_tickets REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION increment_prize_pool(g_id UUID, amount NUMERIC)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE bingo_games SET prize_pool = prize_pool + amount WHERE id = g_id;
$$;
