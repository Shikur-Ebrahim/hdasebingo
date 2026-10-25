-- Migration 031: Update default settings for welcome bonus, deposit bonuses, and Ethiopia support phone
INSERT INTO settings (key, value)
VALUES 
  ('welcome_bonus_amount', '0'),
  ('first_deposit_bonus_pct', '7'),
  ('second_deposit_bonus_pct', '3'),
  ('support_phone_eth', '+251996598686')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Ensure users table default bonus_balance is 0 for newly created accounts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'bonus_balance'
  ) THEN
    ALTER TABLE users ALTER COLUMN bonus_balance SET DEFAULT 0;
  END IF;
END $$;
