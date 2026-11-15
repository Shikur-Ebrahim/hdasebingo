-- 033_room_custom_stakes.sql
-- Dynamic room stakes management (Default changed to 5, 10, 20, 35 ETB)

ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS stakes JSONB DEFAULT '[5, 10, 20, 35]'::jsonb;

-- Set default stakes for any existing rooms
UPDATE public.rooms 
SET stakes = '[5, 10, 20, 35]'::jsonb 
WHERE stakes IS NULL;
