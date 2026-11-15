-- Migration 038: Waiter Player Setup (Agent Balance Backed)
-- Dedicated feature for Pro Level 1 rooms:
-- Default for all stakes is OFF.
-- Default waiter count per stake: 1-2 bots, 1 cartela each.
-- Financial integration:
--   - Stake deducted from Room Owner / Agent Balance on join.
--   - Won Derash credited directly to Agent Balance on win.
--   - Pool total_won updated in system_players table.
--   - Display name chosen randomly from 1,000 pool.

-- 1. Add Waiter Player configuration to rooms table
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS waiter_players_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiter_players_stake_configs JSONB DEFAULT '{"stake_1":{"enabled":false,"min":1,"max":2},"stake_2":{"enabled":false,"min":1,"max":2},"stake_3":{"enabled":false,"min":1,"max":2},"stake_4":{"enabled":false,"min":1,"max":2}}'::jsonb;

-- 2. Track waiter player status and agent backing in bingo_players
ALTER TABLE public.bingo_players
  ADD COLUMN IF NOT EXISTS is_waiter BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiter_agent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS waiter_stake_deducted NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bingo_players_is_waiter ON public.bingo_players(is_waiter);

-- 3. Track waiter stats in bingo_games
ALTER TABLE public.bingo_games
  ADD COLUMN IF NOT EXISTS waiter_players_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiter_total_stake NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiter_won_amount NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bingo_games_waiter_count ON public.bingo_games(waiter_players_count);
