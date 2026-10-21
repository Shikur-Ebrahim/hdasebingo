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

-- RLS: allow backend API access (secured by API route middleware requireAdmin)
ALTER TABLE audit_reductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_audit" ON audit_reductions;
CREATE POLICY "anon_all_audit" ON audit_reductions FOR ALL TO anon USING (true) WITH CHECK (true);
