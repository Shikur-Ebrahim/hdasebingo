-- Migration 031: Update default settings for welcome bonus, deposit bonuses, and Ethiopia support phone
INSERT INTO settings (key, value, label, description)
VALUES 
  ('welcome_bonus_amount', '0', 'Welcome / Signup Bonus', 'Bonus ETB added to new user account upon signup.'),
  ('first_deposit_bonus_pct', '7', 'First Deposit Bonus', 'Bonus % added to depositor''s bonus balance on their very first approved deposit.'),
  ('second_deposit_bonus_pct', '3', 'Second Deposit Bonus', 'Bonus % added to depositor''s bonus balance on their second approved deposit.'),
  ('support_phone_eth', '+251996598686', 'Ethiopia Support Phone', 'Direct Ethiopian support phone number.')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
