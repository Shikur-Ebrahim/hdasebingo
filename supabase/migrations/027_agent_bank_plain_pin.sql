-- Migration 027: Add plain_pin column to agent_bank_accounts for Admin PIN visibility & management
ALTER TABLE public.agent_bank_accounts 
ADD COLUMN IF NOT EXISTS plain_pin TEXT;
