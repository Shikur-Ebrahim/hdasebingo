-- Drop old restrictive CHECK constraints
ALTER TABLE deposit_methods DROP CONSTRAINT IF EXISTS deposit_methods_type_check;
ALTER TABLE withdrawal_methods DROP CONSTRAINT IF EXISTS withdrawal_methods_type_check;

-- Re-add with all new Ethiopian bank/wallet options
ALTER TABLE deposit_methods ADD CONSTRAINT deposit_methods_type_check 
  CHECK (type IN (
    'cbe', 'boa', 'telebirr', 'mpesa',
    'cbebirr', 'ebirr', 'awash', 'dashen',
    'amhara', 'coop', 'amole', 'hello_cash',
    'nib', 'wegagen', 'zemen', 'oromia', 'hibret'
  ));

ALTER TABLE withdrawal_methods ADD CONSTRAINT withdrawal_methods_type_check 
  CHECK (type IN (
    'cbe', 'boa', 'telebirr', 'mpesa',
    'cbebirr', 'ebirr', 'awash', 'dashen',
    'amhara', 'coop', 'amole', 'hello_cash',
    'nib', 'wegagen', 'zemen', 'oromia', 'hibret'
  ));
