-- 022_room_promoter_id.sql
-- Add promoter_id column to rooms table to associate rooms with promoters

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS promoter_id TEXT;
CREATE INDEX IF NOT EXISTS idx_rooms_promoter_id ON public.rooms(promoter_id);

-- Ensure users.role can accept 'promoter'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (
  role = ANY (ARRAY['admin'::text, 'worker'::text, 'agent'::text, 'promoter'::text, 'user'::text])
);
