-- Security regression suite: proves the database itself blocks what the app
-- screens hide, by calling it directly as each kind of user.
-- Runs after all migrations (see scripts/test-db.sh). Prints one line per check.

create temp table results (name text, ok boolean, detail text);
grant all on results to anon, authenticated, service_role;

-- Run `sql` as `who` (anon | authenticated | service_role) with JWT subject `sub`.
-- The statement is executed for real (not wrapped), so function calls and
-- writes actually run. expect: 'ok' (must succeed), 'error' (must raise), or a
-- number (rows returned or affected).
create function pg_temp.check(name text, who text, sub uuid, sql text, expect text)
returns void language plpgsql as $$
declare n bigint; err text;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
    perform set_config('request.jwt.claim.role', who, true);
    execute format('set local role %I', who);
    execute sql;
    get diagnostics n = row_count;
    reset role;
  exception when others then
    reset role;
    err := sqlerrm;
  end;
  insert into results values (
    name,
    case when expect = 'error' then err is not null
         when expect = 'ok' then err is null
         else err is null and n = expect::bigint end,
    coalesce('error: ' || err, 'rows: ' || n));
end $$;

-- Seed (as table owner): two parents/tutors, one admin, one book each.
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'parent1@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'parent2@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'pending@example.com');
insert into students (id, email, role, active) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.com', 'admin', true),
  ('00000000-0000-0000-0000-0000000000b1', 'parent1@example.com', 'student', true),
  ('00000000-0000-0000-0000-0000000000b2', 'parent2@example.com', 'student', true),
  ('00000000-0000-0000-0000-0000000000c1', 'pending@example.com', 'student', false);
insert into documents (id, title, owner_id, source_type, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'Parent 1 book', '00000000-0000-0000-0000-0000000000b1', 'textbook', 'ready'),
  ('00000000-0000-0000-0000-0000000000d2', 'Parent 2 book', '00000000-0000-0000-0000-0000000000b2', 'textbook', 'ready');
insert into chunks (document_id, owner_id, source_type, content, embedding)
select d.id, d.owner_id, 'textbook', 'chunk of ' || d.title, array_fill(0.1::real, array[768])::vector
from documents d;
insert into token_usage (student_id, task_type, provider, model, input_tokens, output_tokens, total_tokens)
values ('00000000-0000-0000-0000-0000000000b1', 'solution', 'google', 'm', 10, 5, 15);

do $$
declare
  admin uuid := '00000000-0000-0000-0000-00000000000a';
  p1 uuid := '00000000-0000-0000-0000-0000000000b1';
  p2 uuid := '00000000-0000-0000-0000-0000000000b2';
  pending uuid := '00000000-0000-0000-0000-0000000000c1';
  vec text := 'array_fill(0.1::real, array[768])::vector';
begin
  -- Anonymous (public key, not signed in): nothing at all.
  perform pg_temp.check('anon cannot read students', 'anon', null, 'select * from students', 'error');
  perform pg_temp.check('anon cannot read documents', 'anon', null, 'select * from documents', 'error');
  perform pg_temp.check('anon cannot read chunks', 'anon', null, 'select * from chunks', 'error');
  perform pg_temp.check('anon cannot read token_usage', 'anon', null, 'select * from token_usage', 'error');
  perform pg_temp.check('anon cannot call student_monthly_usage', 'anon', null,
    format('select student_monthly_usage(%L)', p1), 'error');
  perform pg_temp.check('anon cannot call match_owner_chunks', 'anon', null,
    format('select * from match_owner_chunks(%s, %L)', vec, p1), 'error');

  -- Signed-in parent/tutor: own account row only, no escalation.
  perform pg_temp.check('user reads own account row', 'authenticated', p1, 'select * from students', '1');
  perform pg_temp.check('user cannot make self admin', 'authenticated', p1,
    format('update students set role = %L where id = %L', 'admin', p1), '0');
  perform pg_temp.check('user cannot raise own quota', 'authenticated', p1,
    format('update students set token_quota = 999999999 where id = %L', p1), '0');
  perform pg_temp.check('user cannot create an account row', 'authenticated', p1,
    format('insert into students (id, email) values (%L, %L)', pending, 'x@example.com'), 'error');
  perform pg_temp.check('user cannot read any books directly', 'authenticated', p1, 'select * from documents', '0');
  perform pg_temp.check('user cannot read any chunks directly', 'authenticated', p1, 'select * from chunks', '0');
  perform pg_temp.check('user cannot forge a generated document', 'authenticated', p1,
    format('insert into generated_documents (student_id, task_type, title, storage_path) values (%L, %L, %L, %L)',
           p1, 'solution', 't', 'generated/someone-else/x.pdf'), 'error');
  perform pg_temp.check('user cannot call student_monthly_usage', 'authenticated', p1,
    format('select student_monthly_usage(%L)', p2), 'error');
  perform pg_temp.check('user cannot call match_owner_chunks', 'authenticated', p1,
    format('select * from match_owner_chunks(%s, %L)', vec, p2), 'error');
  perform pg_temp.check('pending user cannot read schools', 'authenticated', pending, 'select * from schools', '0');

  -- Server (service role): search is limited to the owner's own books.
  perform pg_temp.check('search returns only the owner''s chunks', 'service_role', null,
    format('select * from match_owner_chunks(%s, %L)', vec, p1), '1');
  perform pg_temp.check('search ignores other owners'' book ids', 'service_role', null,
    format('select * from match_owner_chunks(%s, %L, array[%L]::uuid[])', vec, p1,
           '00000000-0000-0000-0000-0000000000d2'), '0');
  perform pg_temp.check('server reads monthly usage', 'service_role', null,
    format('select 1 where student_monthly_usage(%L) = 15', p1), '1');

  -- At least one active admin always remains.
  perform pg_temp.check('cannot demote the last admin', 'service_role', null,
    format('update students set role = %L where id = %L', 'student', admin), 'error');
  perform pg_temp.check('cannot deactivate the last admin', 'service_role', null,
    format('update students set active = false where id = %L', admin), 'error');
  perform pg_temp.check('cannot delete the last admin', 'service_role', null,
    format('delete from students where id = %L', admin), 'error');
  perform pg_temp.check('can promote a second admin', 'service_role', null,
    format('update students set role = %L where id = %L', 'admin', p2), '1');
  perform pg_temp.check('then the first admin can be demoted', 'service_role', null,
    format('update students set role = %L where id = %L', 'student', admin), '1');
  perform pg_temp.check('ordinary account edits still work', 'service_role', null,
    format('update students set token_quota = 300000 where id = %L', p1), '1');
end $$;

select case when ok then 'PASS' else 'FAIL' end || '  ' || name || case when ok then '' else '  (' || detail || ')' end
from results;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from results;
