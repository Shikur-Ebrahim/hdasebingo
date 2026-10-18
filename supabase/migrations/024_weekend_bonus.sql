-- Weekend Bonus settings
-- weekend_bonus_enabled: 'true' or 'false'
-- weekend_bonus_days: JSON array of day numbers (0=Sunday, 6=Saturday), e.g. '[0,6]'
-- weekend_bonus_pct: percentage as string, e.g. '10'

INSERT INTO settings (key, value, label, description)
VALUES
  ('weekend_bonus_enabled', 'false', 'Weekend Bonus Enabled', 'Enable or disable the weekend deposit bonus.'),
  ('weekend_bonus_days',    '[0,6]', 'Weekend Bonus Days',    'JSON array of day-of-week indices to award the bonus (0=Sun, 1=Mon, ..., 6=Sat).'),
  ('weekend_bonus_pct',    '10',    'Weekend Bonus %',        'Bonus % added to the depositor''s bonus balance when they deposit on a configured weekend day. Applied independently of 1st/2nd deposit bonuses.')
ON CONFLICT (key) DO NOTHING;
