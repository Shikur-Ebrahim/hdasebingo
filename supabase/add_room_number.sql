-- ========================================================
-- ADD AUTO-INCREMENTING room_number COLUMN TO public.rooms
-- ========================================================

-- 1. Add room_number column to rooms table if not exists
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS room_number INTEGER;

-- 2. Create dedicated sequence for room_number
CREATE SEQUENCE IF NOT EXISTS public.rooms_room_number_seq;

-- 3. Sequentially number all existing rooms (1, 2, 3...) based on created_at
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) as rn
  FROM public.rooms
)
UPDATE public.rooms
SET room_number = numbered.rn
FROM numbered
WHERE public.rooms.id = numbered.id
  AND (public.rooms.room_number IS NULL OR public.rooms.room_number = 0);

-- 4. Advance sequence to the next available room number
SELECT setval(
  'public.rooms_room_number_seq',
  COALESCE((SELECT MAX(room_number) FROM public.rooms), 0) + 1,
  false
);

-- 5. Set default value so every new room automatically increments
ALTER TABLE public.rooms 
ALTER COLUMN room_number SET DEFAULT nextval('public.rooms_room_number_seq');

-- 6. Add index for fast lookup and ordering
CREATE INDEX IF NOT EXISTS idx_rooms_room_number ON public.rooms(room_number);
