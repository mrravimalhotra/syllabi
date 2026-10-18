-- Guest accounts: a login an admin makes for a reviewer, tester or visitor. It
-- works while private testing is on (sign-ups closed), has its own small
-- monthly allowance, and stops working on its own at guest_until.
alter table students add column if not exists guest_until timestamptz;
