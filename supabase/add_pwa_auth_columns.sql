-- ========================================================
-- ADD PWA AUTHENTICATION COLUMNS TO public.users
-- Allows web & PWA visitors to register with phone and password
-- ========================================================

-- 1. Add phone_number column if not exists
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- 2. Add password_hash column if not exists
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 3. Add fast lookup index on phone_number
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON public.users(phone_number);

-- 4. Ensure telegram_id is indexed (already primary/unique in most setups)
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);
