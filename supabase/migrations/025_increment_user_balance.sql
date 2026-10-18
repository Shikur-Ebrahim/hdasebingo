-- Migration 025: Create increment_user_balance function for user balance increments
CREATE OR REPLACE FUNCTION public.increment_user_balance(p_amount numeric, p_telegram_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET main_balance = COALESCE(main_balance, 0) + p_amount,
      updated_at = NOW()
  WHERE telegram_id = p_telegram_id;
END;
$$;

-- Overload with (p_telegram_id text, p_amount numeric)
CREATE OR REPLACE FUNCTION public.increment_user_balance(p_telegram_id text, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET main_balance = COALESCE(main_balance, 0) + p_amount,
      updated_at = NOW()
  WHERE telegram_id = p_telegram_id;
END;
$$;
