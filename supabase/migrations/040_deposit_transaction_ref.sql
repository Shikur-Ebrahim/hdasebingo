-- Migration 040: Add transaction_ref to deposits
-- Allows users to submit FT / transaction reference number / SMS text as an alternative or alongside screenshots

ALTER TABLE public.deposits 
  ADD COLUMN IF NOT EXISTS transaction_ref TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_deposits_transaction_ref ON public.deposits(transaction_ref);
