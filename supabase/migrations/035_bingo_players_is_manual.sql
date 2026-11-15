-- Migration 035: Add is_manual column to bingo_players to track manual vs auto play mode
ALTER TABLE public.bingo_players ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT true;
