-- The school days whose class diary has been added, even when nothing was set that day (every period "Nil"),
-- so the Homework page doesn't keep asking for a diary that is already in.
create table if not exists homework_diary_days (
  owner_id uuid not null references students(id) on delete cascade,
  day date not null,
  added_at timestamptz not null default now(),
  primary key (owner_id, day)
);

alter table homework_diary_days enable row level security;
drop policy if exists homework_diary_days_select_own on homework_diary_days;
create policy homework_diary_days_select_own on homework_diary_days for select using (owner_id = (select auth.uid()));
revoke insert, update, delete on homework_diary_days from anon, authenticated;
