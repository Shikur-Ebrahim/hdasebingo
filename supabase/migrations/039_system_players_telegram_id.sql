-- Migration 039: Add sequential telegram_id to system_players
-- System players start from 10000000000 and increment sequentially (+1 per bot, across all rooms)

ALTER TABLE public.system_players
  ADD COLUMN IF NOT EXISTS telegram_id TEXT;

CREATE INDEX IF NOT EXISTS idx_system_players_telegram_id ON public.system_players(telegram_id);
