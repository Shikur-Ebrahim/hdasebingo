-- Migration 029: Financial Audit & Reductions Table
-- Stores manual deduction entries by admin against net profit
-- Workers and admins can both view balance; only admin can add entries

CREATE TABLE IF NOT EXISTS audit_reductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  note TEXT DEFAULT '',
  reduced_by TEXT DEFAULT 'admin',   -- admin's name / telegram username
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: anon read (worker sees balance), service_role write
ALTER TABLE audit_reductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_audit" ON audit_reductions;
CREATE POLICY "anon_read_audit" ON audit_reductions FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_insert_audit" ON audit_reductions;
CREATE POLICY "anon_insert_audit" ON audit_reductions FOR INSERT TO anon WITH CHECK (true);
