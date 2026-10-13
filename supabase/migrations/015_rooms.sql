-- 015_rooms.sql
-- Agent Rooms Management Table

-- 1. Ensure users_role_check includes 'agent'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (
  role = ANY (ARRAY['admin'::text, 'worker'::text, 'agent'::text, 'user'::text])
);

-- 2. Create rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name TEXT NOT NULL,
  agent_id TEXT NOT NULL UNIQUE,
  agent_name TEXT,
  total_players INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop stake column if it exists
ALTER TABLE public.rooms DROP COLUMN IF EXISTS stake;

CREATE INDEX IF NOT EXISTS idx_rooms_agent_id ON public.rooms(agent_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);

-- Disable RLS so backend and frontend can interact smoothly
ALTER TABLE public.rooms DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.rooms TO anon, authenticated, service_role;
