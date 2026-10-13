-- ================================================================
-- CLEAN BINGO TABLES — Drop old and recreate fresh
-- ================================================================
DROP TABLE IF EXISTS bingo_tickets CASCADE;
DROP TABLE IF EXISTS bingo_players CASCADE;
DROP TABLE IF EXISTS bingo_games CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main game record (one active game at a time)
CREATE TABLE bingo_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id TEXT UNIQUE NOT NULL,
  stake NUMERIC(10,2) NOT NULL DEFAULT 10,
  prize_pool NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'calling', 'finished')),
  called_numbers JSONB NOT NULL DEFAULT '[]',
  winner_telegram_id TEXT,
  winner_cartela INT,
  winner_prize NUMERIC(10,2),
  start_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per player per game
CREATE TABLE bingo_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES bingo_games(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  cartela_number INT NOT NULL CHECK (cartela_number >= 1 AND cartela_number <= 150),
  card_matrix JSONB NOT NULL,   -- 5 x 5 array; 0 = FREE center
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, cartela_number),  -- one player per seat
  UNIQUE(game_id, telegram_id)      -- one seat per player per game
);

CREATE INDEX idx_bingo_games_status   ON bingo_games(status);
CREATE INDEX idx_bingo_players_game   ON bingo_players(game_id);
CREATE INDEX idx_bingo_players_tid    ON bingo_players(telegram_id);

-- RLS
ALTER TABLE bingo_games   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all" ON bingo_games;
DROP POLICY IF EXISTS "anon_all" ON bingo_players;

CREATE POLICY "anon_all" ON bingo_games   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON bingo_players FOR ALL TO anon USING (true) WITH CHECK (true);

-- Realtime — push every UPDATE to subscribed clients
ALTER TABLE bingo_games   REPLICA IDENTITY FULL;
ALTER TABLE bingo_players REPLICA IDENTITY FULL;

-- Atomic prize-pool accumulator (prevents race conditions)
CREATE OR REPLACE FUNCTION bingo_add_to_prize(p_game_id UUID, p_amount NUMERIC)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE bingo_games
  SET prize_pool = prize_pool + p_amount,
      updated_at = NOW()
  WHERE id = p_game_id AND status = 'waiting';
$$;
