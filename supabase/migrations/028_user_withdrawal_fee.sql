-- Migration 028: User Withdrawal Fee Settings and Withdrawal Fee Tracking
-- Default: <= 2000 ETB (3%), 2001-10000 ETB (2%), > 10000 ETB (1%)
-- Strictly for regular users (Agent and Promoter withdrawals are 0% exempt)

CREATE TABLE IF NOT EXISTS withdrawal_fee_settings (
  id INT PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN DEFAULT TRUE,
  tier1_max_amount NUMERIC DEFAULT 2000,
  tier1_fee_percent NUMERIC DEFAULT 3,
  tier2_max_amount NUMERIC DEFAULT 10000,
  tier2_fee_percent NUMERIC DEFAULT 2,
  tier3_fee_percent NUMERIC DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO withdrawal_fee_settings (id, is_enabled, tier1_max_amount, tier1_fee_percent, tier2_max_amount, tier2_fee_percent, tier3_fee_percent)
VALUES (1, TRUE, 2000, 3, 10000, 2, 1)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE withdrawal_fee_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_withdrawal_fee" ON withdrawal_fee_settings;
CREATE POLICY "anon_all_withdrawal_fee" ON withdrawal_fee_settings FOR ALL TO anon USING (true) WITH CHECK (true);

-- Add tracking columns to withdrawals table
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_amount NUMERIC DEFAULT 0;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_percent NUMERIC DEFAULT 0;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS net_amount NUMERIC DEFAULT 0;
