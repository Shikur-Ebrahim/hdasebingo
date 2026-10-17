-- 021_room_is_private.sql
-- Add is_private column to rooms table (default false = public room)
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 8;
