-- Migration 041: Robust System Players & Waiter Config per Room (Min/Max Database Storage)
-- Ensures all rooms have proper JSONB columns for stake tiers (min, max, enabled)
-- and proper defaults with zero hardcoded constraints.

-- 1. Ensure all columns exist on rooms table with standard defaults
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS system_players_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_players_pro_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_players_pro_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS system_players_schedule_start TEXT DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS system_players_schedule_end TEXT DEFAULT '24:00',
  ADD COLUMN IF NOT EXISTS system_players_stake_configs JSONB DEFAULT '{
    "stake_1": {"min": 4, "max": 15, "enabled": true},
    "stake_2": {"min": 3, "max": 9, "enabled": true},
    "stake_3": {"min": 2, "max": 5, "enabled": true},
    "stake_4": {"min": 2, "max": 4, "enabled": true}
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS waiter_players_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiter_players_stake_configs JSONB DEFAULT '{
    "stake_1": {"enabled": false, "min": 1, "max": 2},
    "stake_2": {"enabled": false, "min": 1, "max": 2},
    "stake_3": {"enabled": false, "min": 1, "max": 2},
    "stake_4": {"enabled": false, "min": 1, "max": 2}
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS system_players_risk_percent NUMERIC DEFAULT 25,
  ADD COLUMN IF NOT EXISTS system_players_monthly_price NUMERIC DEFAULT 1000;

-- 2. Indexes for fast room and system player lookups
CREATE INDEX IF NOT EXISTS idx_rooms_sys_enabled ON public.rooms(system_players_enabled);
CREATE INDEX IF NOT EXISTS idx_rooms_sys_pro_level ON public.rooms(system_players_pro_level);

-- 3. Ensure Official Platform Room (HDASE BINGO) is permanent Pro Level 1 and 24/7 active
UPDATE public.rooms
SET 
  system_players_enabled = true,
  system_players_pro_level = 1,
  system_players_schedule_start = COALESCE(system_players_schedule_start, '00:00'),
  system_players_schedule_end = COALESCE(system_players_schedule_end, '24:00'),
  updated_at = NOW()
WHERE id = 'd7c9114a-e112-426f-8f9b-13c00050279c' OR room_name = 'HDASE BINGO';
