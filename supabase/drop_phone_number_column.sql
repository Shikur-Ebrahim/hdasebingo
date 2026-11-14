-- ========================================================
-- DROP phone_number COLUMN FROM public.users
-- Phone numbers are saved directly in telegram_id
-- ========================================================

-- 1. Drop index if exists
DROP INDEX IF EXISTS public.idx_users_phone_number;

-- 2. Drop phone_number column
ALTER TABLE public.users 
DROP COLUMN IF EXISTS phone_number;
