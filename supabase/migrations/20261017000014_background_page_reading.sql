-- Books are read in the background: the phone only sends the page images
-- (seconds), and the server reads each page with the AI afterwards, so an
-- upload finishes even if the app is closed or the phone locks.

-- One row per page to read.
create table if not exists page_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  owner_id uuid not null,
  page_number int not null check (page_number between 1 and 10000),
  -- A page image in storage (scans, photos, PDF pages); text pages may have none.
  image_path text,
  mime_type text,
  -- Text already read on the phone (Word files, digital PDFs): no AI needed.
  page_text text,
  hint text,
  status text not null default 'pending' check (status in ('pending', 'working', 'done', 'failed')),
  attempts int not null default 0,
  error text,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, page_number)
);
create index if not exists idx_page_jobs_due on page_jobs (status, next_attempt_at);
create index if not exists idx_page_jobs_owner on page_jobs (owner_id);

-- Only the server reads and writes jobs.
alter table page_jobs enable row level security;
revoke all on page_jobs from anon, authenticated;

-- The app's address and a random token: the database's timer calls the app
-- with it, and the app checks it. Generated here, so no secret is in the code.
create table if not exists job_runner (
  id int primary key default 1 check (id = 1),
  app_url text,
  token text not null default encode(gen_random_bytes(24), 'hex')
);
insert into job_runner (id) values (1) on conflict (id) do nothing;
alter table job_runner enable row level security;
revoke all on job_runner from anon, authenticated;

-- Hands out the next page to read, keeping at most `max_working` pages being
-- read at once across the app (the AI's free tier allows few requests a
-- minute). A page whose reader stopped (server time limit) is handed out again.
create or replace function claim_page_job(max_working int, stale_after interval default interval '6 minutes')
returns setof page_jobs language plpgsql as $$
declare
  job_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('claim_page_job'));
  if (select count(*) from page_jobs where status = 'working' and locked_at > now() - stale_after) >= max_working then
    return;
  end if;
  select id into job_id from page_jobs
   where (status = 'pending' and next_attempt_at <= now())
      or (status = 'working' and locked_at <= now() - stale_after)
   order by created_at, page_number
   limit 1
   for update skip locked;
  if job_id is null then
    return;
  end if;
  return query
    update page_jobs set status = 'working', locked_at = now(), attempts = attempts + 1
     where id = job_id
    returning *;
end $$;
revoke execute on function claim_page_job(int, interval) from public, anon, authenticated;
grant execute on function claim_page_job(int, interval) to service_role;

-- A timer every minute restarts reading when pages are waiting (e.g. after the
-- AI's daily allowance resets, or if the server stopped). Needs pg_cron and
-- pg_net (both on Supabase); skipped where they aren't available, as in tests.
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      create extension if not exists pg_cron;
      create extension if not exists pg_net;
      perform cron.unschedule(jobid) from cron.job where jobname = 'read-book-pages';
      perform cron.schedule('read-book-pages', '* * * * *', $cron$
        select net.http_post(
          url := r.app_url || '/api/jobs/pages',
          headers := jsonb_build_object('x-job-token', r.token, 'content-type', 'application/json'),
          body := '{}'::jsonb
        )
        from job_runner r
        where r.app_url is not null
          and exists (
            select 1 from page_jobs
             where (status = 'pending' and next_attempt_at <= now())
                or (status = 'working' and locked_at <= now() - interval '6 minutes'))
      $cron$);
    exception when others then
      raise notice 'Background reading timer not set up: %', sqlerrm;
    end;
  end if;
end $outer$;

-- For the admin health check: is the timer in place?
create or replace function background_timer_ready() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return exists (select 1 from cron.job where jobname = 'read-book-pages');
exception when others then
  return false;
end $$;
revoke execute on function background_timer_ready() from public, anon, authenticated;
grant execute on function background_timer_ready() to service_role;
