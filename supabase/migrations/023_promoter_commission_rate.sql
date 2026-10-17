-- 023_promoter_commission_rate.sql
-- Add promoter_commission_rate column to rooms table (default 3%)

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS promoter_commission_rate NUMERIC DEFAULT 3;
