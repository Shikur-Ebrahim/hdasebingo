-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  avatar_url TEXT,
  total_games INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  host_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER DEFAULT 20,
  chat_id TEXT NOT NULL,
  message_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Room players table
CREATE TABLE IF NOT EXISTS room_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  username TEXT NOT NULL,
  bingo_card JSONB NOT NULL,
  marked_cells JSONB NOT NULL,
  has_bingo BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

-- Called numbers table
CREATE TABLE IF NOT EXISTS called_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number >= 1 AND number <= 75),
  called_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_telegram_id ON room_players(telegram_id);
CREATE INDEX IF NOT EXISTS idx_called_numbers_room_id ON called_numbers(room_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- Enable Realtime
ALTER TABLE called_numbers REPLICA IDENTITY FULL;
ALTER TABLE room_players REPLICA IDENTITY FULL;
ALTER TABLE rooms REPLICA IDENTITY FULL;

-- Increment wins function
CREATE OR REPLACE FUNCTION increment_wins(player_telegram_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE users SET total_wins = total_wins + 1, total_games = total_games + 1, updated_at = NOW()
  WHERE telegram_id = player_telegram_id;
END;
$$ LANGUAGE plpgsql;

-- Increment games function
CREATE OR REPLACE FUNCTION increment_games(player_telegram_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE users SET total_games = total_games + 1, updated_at = NOW()
  WHERE telegram_id = player_telegram_id;
END;
$$ LANGUAGE plpgsql;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE called_numbers ENABLE ROW LEVEL SECURITY;

-- Policies (open access via anon key from our backend)
CREATE POLICY "anon_all" ON users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON rooms FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON room_players FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON called_numbers FOR ALL TO anon USING (true) WITH CHECK (true);
