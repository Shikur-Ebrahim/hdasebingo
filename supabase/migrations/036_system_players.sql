-- Migration 036: System Players (Automated Bots) & Pro Level 1 Room Settings

-- 1. System Players Pool per Room
CREATE TABLE IF NOT EXISTS public.system_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  total_won NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_players_room_id ON public.system_players(room_id);

-- 2. Add System Player & Pro configuration to rooms table
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS system_players_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_players_pro_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_players_pro_expires_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS system_players_schedule_start TEXT DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS system_players_schedule_end TEXT DEFAULT '24:00',
  ADD COLUMN IF NOT EXISTS system_players_stake_configs JSONB DEFAULT '{"stake_1":{"min":4,"max":15},"stake_2":{"min":3,"max":9},"stake_3":{"min":2,"max":5},"stake_4":{"min":2,"max":4}}'::jsonb,
  ADD COLUMN IF NOT EXISTS system_players_risk_percent NUMERIC DEFAULT 25,
  ADD COLUMN IF NOT EXISTS system_players_monthly_price NUMERIC DEFAULT 1000;

-- 3. Track system vs real in bingo_players & widen check constraint up to 1000
ALTER TABLE public.bingo_players
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_player_id UUID NULL REFERENCES public.system_players(id) ON DELETE SET NULL;

ALTER TABLE public.bingo_players DROP CONSTRAINT IF EXISTS bingo_players_cartela_number_check;
ALTER TABLE public.bingo_players ADD CONSTRAINT bingo_players_cartela_number_check CHECK (cartela_number >= 1 AND cartela_number <= 1000);

-- 4. Track system vs real counts & room owner risk in bingo_games
ALTER TABLE public.bingo_games
  ADD COLUMN IF NOT EXISTS real_players_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_players_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS room_owner_risk_amount NUMERIC DEFAULT 0;

-- 5. RLS for system_players
ALTER TABLE public.system_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_system_players" ON public.system_players;
CREATE POLICY "anon_system_players" ON public.system_players FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6. Room Pro Upgrade Transfer Requests
CREATE TABLE IF NOT EXISTS public.pro_upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  room_name TEXT,
  manager_account_id UUID REFERENCES public.manager_accounts(id) ON DELETE SET NULL,
  bank_type TEXT,
  account_name TEXT,
  account_number TEXT,
  amount NUMERIC NOT NULL DEFAULT 1000,
  screenshot_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_upgrade_requests_room_id ON public.pro_upgrade_requests(room_id);
CREATE INDEX IF NOT EXISTS idx_pro_upgrade_requests_status ON public.pro_upgrade_requests(status);

ALTER TABLE public.pro_upgrade_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_pro_upgrade_requests" ON public.pro_upgrade_requests;
CREATE POLICY "anon_pro_upgrade_requests" ON public.pro_upgrade_requests FOR ALL TO anon USING (true) WITH CHECK (true);
