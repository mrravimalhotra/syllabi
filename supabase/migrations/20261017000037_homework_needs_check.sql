-- A diary photo is read twice; an entry the two readings don't agree on (one found it and the other didn't,
-- or they read its date differently) is kept but marked for the grown-up to check against the diary page.
alter table homework_entries add column if not exists needs_check boolean not null default false;
