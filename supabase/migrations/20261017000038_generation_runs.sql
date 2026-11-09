-- One row per answer request (Solve, Notes, Sample paper, Ask anything, Check a paper, Study pack), updated as it
-- goes: the stage it reached, how long each stage took, the size of the request, and how it ended. A request the
-- hosting stopped at its time limit keeps the last stage it reached, so a stuck or slow answer can be traced
-- without hosting logs. Only the server reads and writes it; it holds no question text, book text or answers.

create table if not exists generation_runs (
  id uuid primary key,
  student_id uuid references students(id) on delete cascade,
  task_type text not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The last stage reached ("started", "reading photos", "finding pages", "writing", "first words", "checking",
  -- "fixing", "saving", "done", "failed").
  stage text not null default 'started',
  -- null while running (or when the hosting stopped it); 'answered', 'reused' or 'failed' when it ended.
  outcome text check (outcome in ('answered', 'reused', 'failed')),
  error text,
  -- Seconds since the start at which each stage was reached, the request's size and what was found in the books.
  details jsonb not null default '{}'::jsonb,
  document_id uuid references generated_documents(id) on delete set null
);
create index if not exists idx_generation_runs_started on generation_runs (started_at desc);

alter table generation_runs enable row level security;
revoke all on generation_runs from anon, authenticated;
grant select, insert, update, delete on generation_runs to service_role;

-- Keeps the table small: nothing older than 30 days, and at most the newest 2000.
create or replace function purge_generation_runs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from generation_runs
  where started_at < now() - interval '30 days'
     or id in (select id from generation_runs order by started_at desc offset 2000);
$$;
revoke execute on function purge_generation_runs() from public, anon, authenticated;
grant execute on function purge_generation_runs() to service_role;
