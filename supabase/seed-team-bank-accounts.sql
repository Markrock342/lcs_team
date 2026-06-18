-- บัญชีทีมเริ่มต้น (Bank + Knott/น็อต)
-- รันหลัง add-team-payouts.sql (รันซ้ำได้)

UPDATE profiles SET
  bank_name = 'กสิกรไทย',
  bank_account_number = '0718161010',
  bank_account_name = 'วงศธร ศรีสถาน'
WHERE lower(username) IN ('bank')
   OR lower(username) LIKE 'bank%';

UPDATE profiles SET
  bank_name = 'กสิกรไทย',
  bank_account_number = '1158754378',
  bank_account_name = 'สนธยา สายวรรณะ'
WHERE lower(username) IN ('knott')
   OR lower(username) LIKE 'knott%';
