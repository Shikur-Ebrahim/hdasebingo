-- Migration 030: Manager Accounts & Worker Balance Transfers
-- 1. Manager receiving accounts (CBE, BOA, Telebirr, etc.)
CREATE TABLE IF NOT EXISTS manager_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_type TEXT NOT NULL, -- 'cbe', 'boa', 'telebirr'
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: allow backend API access
ALTER TABLE manager_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_manager_accounts" ON manager_accounts;
CREATE POLICY "anon_all_manager_accounts" ON manager_accounts FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. Worker balance transfers to manager
CREATE TABLE IF NOT EXISTS worker_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_telegram_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  manager_account_id UUID REFERENCES manager_accounts(id) ON DELETE SET NULL,
  bank_type TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  screenshot_url TEXT NOT NULL,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: allow backend API access
ALTER TABLE worker_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_worker_transfers" ON worker_transfers;
CREATE POLICY "anon_all_worker_transfers" ON worker_transfers FOR ALL TO anon USING (true) WITH CHECK (true);
