-- Hardening borrowed from the Next.js + Supabase best-practices checklist.
--
-- 1. Anonymous lockdown. The publishable (anon) key is public, so nothing in
--    this schema should be reachable without signing in. RLS already returns
--    no rows to anon, but anon also had default table privileges and EXECUTE
--    on every function (e.g. student_monthly_usage could be called for any
--    id). The app never queries data as anon: the browser only signs in, the
--    server uses the signed-in user's session or the service role.
-- 2. Signed-in users only get EXECUTE on the helpers their RLS policies need.
--    Everything else runs server-side with the service role.
-- 3. The last active admin can't be demoted, deactivated or deleted, so a
--    misclick in the admin screen can't lock the owner out.
-- 4. Monthly token quotas reset at midnight India time, not UTC.

-- 1 + 2 ------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Used inside RLS policies, which run as the signed-in user.
grant execute on function is_admin() to authenticated;
grant execute on function is_active_student() to authenticated;
-- Trigger function: needs no EXECUTE grant, triggers run regardless.

-- 3 ----------------------------------------------------------------------
create or replace function keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only act when an active admin is losing admin status or access.
  if old.role = 'admin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active) then
    if not exists (
      select 1 from students
      where role = 'admin' and active and id <> old.id
    ) then
      raise exception 'Syllabi needs at least one active admin. Make another account admin first.';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_keep_one_admin on students;
create trigger trg_keep_one_admin
  before update of role, active or delete on students
  for each row execute function keep_one_admin();

revoke execute on function keep_one_admin() from public, anon, authenticated;

-- 4 ----------------------------------------------------------------------
create or replace function student_monthly_usage(p_student_id uuid)
returns integer
language sql stable
set search_path = public
as $$
  select coalesce(sum(total_tokens), 0)::integer
  from token_usage
  where student_id = p_student_id
    and created_at >= (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
$$;

revoke execute on function student_monthly_usage(uuid) from public, anon, authenticated;

-- The server calls these with the service role; grant explicitly so the
-- revokes above can never strip its access.
grant execute on function match_owner_chunks(vector, uuid, uuid[], integer) to service_role;
grant execute on function student_monthly_usage(uuid) to service_role;
