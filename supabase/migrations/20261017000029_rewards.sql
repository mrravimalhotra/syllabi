-- A child's stars and the days they played (for the streak), kept with the account so every
-- device shows the same star chart. Only the server reads and writes it.
create table if not exists rewards (
  student_id uuid primary key references students(id) on delete cascade,
  stars int not null default 0 check (stars >= 0),
  -- YYYY-MM-DD in the child's local time, oldest first; the last 60 are kept.
  days text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table rewards enable row level security;
revoke all on rewards from anon, authenticated;

-- Adds stars and days played in one step (two devices finishing at once both count) and
-- returns the new totals.
create or replace function add_rewards(p_student_id uuid, p_stars int, p_days text[])
returns table (stars int, days text[])
language sql
security definer
set search_path = public
as $$
  insert into rewards as r (student_id, stars, days)
  values (p_student_id, greatest(p_stars, 0), coalesce(p_days, '{}'))
  on conflict (student_id) do update
    set stars = r.stars + greatest(p_stars, 0),
        days = (select coalesce(array_agg(d order by d), '{}')
                  from (select distinct d from unnest(r.days || coalesce(p_days, '{}')) d order by d desc limit 60) recent),
        updated_at = now()
  returning r.stars, r.days
$$;
revoke execute on function add_rewards(uuid, int, text[]) from public, anon, authenticated;
grant execute on function add_rewards(uuid, int, text[]) to service_role;
