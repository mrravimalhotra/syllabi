-- Problem reports ("tickets") raised from any screen with the Report a problem box.
-- Each carries what the person typed, and the app's own record of what happened just
-- before: the page, recent clicks, the requests the screen made with what was sent and
-- what came back (private details removed), and any errors. Only the server reads or writes it.
create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  created_at timestamptz not null default now(),
  student_id uuid not null references students(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  path text not null default '' check (char_length(path) <= 300),
  app_build text,
  status text not null default 'open' check (status in ('open', 'working', 'fixed', 'wontfix')),
  -- Claude's or the admin's note on what was done.
  resolution text check (resolution is null or char_length(resolution) <= 5000),
  resolved_at timestamptz,
  -- The captured record (browser, screen size, steps, requests, errors).
  context jsonb not null default '{}'::jsonb
);
create index if not exists idx_bug_reports_created on bug_reports (created_at desc);
create index if not exists idx_bug_reports_student on bug_reports (student_id, created_at desc);

alter table bug_reports enable row level security;
revoke all on bug_reports from anon, authenticated;
grant select, insert, update, delete on bug_reports to service_role;
