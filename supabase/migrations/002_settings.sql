-- Settings table for global application config (e.g., bonus percentages)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  label TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings if they don't exist
INSERT INTO settings (key, value, label, description)
VALUES 
  ('first_deposit_bonus_pct', '20', 'First Deposit Bonus', 'Bonus % added to depositor''s bonus balance on their very first approved deposit.'),
  ('invitation_reward_pct', '10', 'Invitation Reward', 'Bonus % added to the inviter''s bonus balance when their invited friend makes a first deposit.'),
  ('support_username', 'adwabingo_admin', 'Support Team Username', 'Telegram username for the support team (with or without @).'),
  ('channel_link', 'https://t.me/adwabingo', 'Channel Link', 'Full HTTPS link to the official Telegram channel.')
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (since our backend uses it)
CREATE POLICY "anon_all" ON settings FOR ALL TO anon USING (true) WITH CHECK (true);
