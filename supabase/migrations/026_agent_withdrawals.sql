-- Migration 026: Agent Withdrawals Table (100% separate from user withdrawals)
CREATE TABLE IF NOT EXISTS agent_withdrawals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id          TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  bank_name            TEXT NOT NULL,
  account_holder_name  TEXT NOT NULL,
  account_number       TEXT NOT NULL,
  amount               NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_withdrawals_telegram ON agent_withdrawals(telegram_id);
CREATE INDEX IF NOT EXISTS idx_agent_withdrawals_status   ON agent_withdrawals(status);
