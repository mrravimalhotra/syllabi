-- The homework and classwork tracker (handoff: Homework Tracker into Syllabi): entries read from the
-- class diary (PDF pages or photos). Each period's classwork (CW) becomes a "classwork" entry and its
-- reinforcement a "homework" entry, its text kept word for word. Only the person marks an entry done.
create table if not exists homework_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references students(id) on delete cascade,
  kind text not null check (kind in ('classwork', 'homework')),
  subject text not null,
  title text not null,
  topic text,
  sub_topic text,
  -- The submission date, when the diary gives one.
  due_date date,
  -- The diary date it was set.
  given_date date not null,
  done boolean not null default false,
  done_at timestamptz,
  -- The stored diary pages it came from (R2 prefix), for looking back at the original.
  source_file text,
  -- The same entry read again (a diary uploaded twice, a CW repeated over two periods) is kept once.
  dedup_key text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, dedup_key)
);
create index if not exists idx_homework_owner on homework_entries (owner_id, done, given_date desc);

-- Each person sees and changes only their own entries; the server (service role) does the reading.
alter table homework_entries enable row level security;
drop policy if exists homework_select_own on homework_entries;
create policy homework_select_own on homework_entries for select using (owner_id = (select auth.uid()));
drop policy if exists homework_update_own on homework_entries;
create policy homework_update_own on homework_entries for update using (owner_id = (select auth.uid()));
revoke insert, delete on homework_entries from anon, authenticated;
