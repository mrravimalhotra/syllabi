-- A small log of problems the app hit (server failures and screens that
-- crashed in someone's browser), so the admin can see what broke without
-- needing hosting logs, which free plans keep for only an hour.
-- Only the server reads and writes it; it holds no book text or answers.

create table if not exists error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('server', 'browser')),
  context text not null,
  message text not null,
  path text,
  student_id uuid references students(id) on delete set null
);
create index if not exists idx_error_log_created on error_log (created_at desc);

alter table error_log enable row level security;
revoke all on error_log from anon, authenticated;
grant select, insert, delete on error_log to service_role;

-- Keeps the log small: nothing older than 30 days, and at most the newest 500.
create or replace function purge_error_log()
returns void
language sql
security definer
set search_path = public
as $$
  delete from error_log
  where created_at < now() - interval '30 days'
     or id in (select id from error_log order by created_at desc offset 500);
$$;
revoke execute on function purge_error_log() from public, anon, authenticated;
grant execute on function purge_error_log() to service_role;
