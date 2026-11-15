-- Migration 034: Expand cartela_number check constraint from 150 to 1000
ALTER TABLE public.bingo_players 
  DROP CONSTRAINT IF EXISTS bingo_players_cartela_number_check;

ALTER TABLE public.bingo_players 
  ADD CONSTRAINT bingo_players_cartela_number_check 
  CHECK (cartela_number >= 1 AND cartela_number <= 1000);
