-- Syllabi accounts are for adults only: parents and tutors who use the app to
-- prepare study material for their children/students. Students themselves do
-- not get accounts. (The table keeps its original name, `students`; each row is
-- an adult account. `role = 'student'` means a regular non-admin account.)
--
-- account_type records whether the account holder is a parent or a tutor;
-- adult_confirmed_at records when they confirmed at signup that they are 18+
-- and will not let anyone under 18 use their account. Admin rows may leave
-- both null.

alter table students
  add column if not exists account_type text check (account_type in ('parent', 'tutor')),
  add column if not exists adult_confirmed_at timestamptz;
