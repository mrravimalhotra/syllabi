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

-- Saved answers no longer need a stored PDF (generated on demand).
create function pg_temp.check_answer_row() returns void language plpgsql as $$
begin
  perform pg_temp.check('answer saved without a stored PDF', 'service_role', null,
    format('insert into generated_documents (student_id, task_type, title, content, sources) values (%L, %L, %L, %L, %L::jsonb)',
           '00000000-0000-0000-0000-0000000000b1', 'solution', 'Q', '# Answer', '[]'), '1');
  perform pg_temp.check('study pack saved with its pack', 'service_role', null,
    format('insert into generated_documents (student_id, task_type, title, content, pack) values (%L, %L, %L, %L, %L::jsonb)',
           '00000000-0000-0000-0000-0000000000b1', 'study_pack', 'Study pack: Ch 1', '# Pack', '{"version":1}'), '1');
  perform pg_temp.check('unknown answer kinds are still refused', 'service_role', null,
    format('insert into generated_documents (student_id, task_type, title, content) values (%L, %L, %L, %L)',
           '00000000-0000-0000-0000-0000000000b1', 'essay', 'X', 'x'), 'error');
  perform pg_temp.check('class and board can be saved', 'service_role', null,
    format('update students set class_level = %L, board = %L where id = %L', 'Class 6', 'CBSE', '00000000-0000-0000-0000-0000000000b1'), '1');
  perform pg_temp.check('answer saved with a reuse key and checks', 'service_role', null,
    format('insert into generated_documents (student_id, task_type, title, content, cache_key, checks) values (%L, %L, %L, %L, %L, %L::jsonb)',
           '00000000-0000-0000-0000-0000000000b1', 'solution', 'Q', '# A', 'abc123', '[{"kind":"marks","ok":true,"message":"Marks add up to 80"}]'), '1');
  perform pg_temp.check('study packs have a model setting', 'service_role', null,
    format('select 1 from llm_settings where task_type = %L', 'study_pack'), '1');
end $$;

-- Background page reading: only the server sees jobs and the runner token,
-- and at most `max_working` pages are handed out at once.
create function pg_temp.check_page_jobs() returns void language plpgsql as $$
declare
  p1 uuid := '00000000-0000-0000-0000-0000000000b1';
  book uuid := '00000000-0000-0000-0000-0000000000d3';
begin
  insert into page_jobs (document_id, owner_id, page_number, page_text)
  select book, p1, n, 'page ' || n from generate_series(1, 3) n;
  perform pg_temp.check('user cannot read page jobs', 'authenticated', p1, 'select * from page_jobs', 'error');
  perform pg_temp.check('anon cannot read the job runner token', 'anon', null, 'select * from job_runner', 'error');
  perform pg_temp.check('user cannot read the job runner token', 'authenticated', p1, 'select * from job_runner', 'error');
  perform pg_temp.check('user cannot claim page jobs', 'authenticated', p1, 'select * from claim_page_job(2)', 'error');
  perform pg_temp.check('the job runner has a token', 'service_role', null, 'select 1 from job_runner where length(token) >= 32', '1');
  perform pg_temp.check('server claims a page', 'service_role', null, 'select * from claim_page_job(2)', '1');
  perform pg_temp.check('server claims a second page', 'service_role', null, 'select * from claim_page_job(2)', '1');
  perform pg_temp.check('no third page while two are being read', 'service_role', null, 'select * from claim_page_job(2)', '0');
  perform pg_temp.check('a stopped reader''s page is handed out again', 'service_role', null,
    'update page_jobs set locked_at = now() - interval ''10 minutes'' where status = ''working''; select * from claim_page_job(2)', '1');
  perform pg_temp.check('jobs go when their book is deleted', 'service_role', null,
    format('delete from documents where id = %L; select 1 from page_jobs where document_id = %L', book, book), '0');
end $$;

-- Scan-quality scores per page: server only, summed per book by the database.
create function pg_temp.check_page_reads() returns void language plpgsql as $$
declare
  p1 uuid := '00000000-0000-0000-0000-0000000000b1';
  book uuid := '00000000-0000-0000-0000-0000000000d4';
begin
  insert into documents (id, title, owner_id, source_type, status) values (book, 'Scored book', p1, 'textbook', 'ready');
  insert into page_reads (document_id, page_number, owner_id, confidence, issues) values
    (book, 1, p1, 100, '{}'), (book, 2, p1, 50, '{blurry}'), (book, 3, p1, 90, '{too_dark}');
  perform pg_temp.check('user cannot read page scores', 'authenticated', p1, 'select * from page_reads', 'error');
  perform pg_temp.check('anon cannot read page scores', 'anon', null, 'select * from page_reads', 'error');
  perform pg_temp.check('user cannot write page scores', 'authenticated', p1,
    format('insert into page_reads (document_id, page_number, owner_id, confidence) values (%L, 9, %L, 100)', book, p1), 'error');
  perform pg_temp.check('user cannot call page_read_summary', 'authenticated', p1, format('select * from page_read_summary(%L)', p1), 'error');
  perform pg_temp.check('a score over 100 is refused', 'service_role', null,
    format('insert into page_reads (document_id, page_number, owner_id, confidence) values (%L, 8, %L, 101)', book, p1), 'error');
  perform pg_temp.check('the summary counts pages, averages, and lists weak pages and issues', 'service_role', null,
    format('select 1 from page_read_summary(%L) where pages = 3 and average = 80.0 and weak_pages = %L::int[] and issues = %L::text[]', p1, '{2}', '{blurry,too_dark}'), '1');
  perform pg_temp.check('a page scored again replaces its score', 'service_role', null,
    format('insert into page_reads (document_id, page_number, owner_id, confidence) values (%L, 2, %L, 95) on conflict (document_id, page_number) do update set confidence = 95; select 1 from page_read_summary(%L) where weak_pages = %L::int[]', book, p1, p1, '{}'), '1');
  perform pg_temp.check('scores go when their book is deleted', 'service_role', null,
    format('delete from documents where id = %L; select 1 from page_reads where document_id = %L', book, book), '0');
end $$;

-- Problem reports: server only; numbered; a person's reports go with the person.
create function pg_temp.check_bug_reports() returns void language plpgsql as $$
declare
  p1 uuid := '00000000-0000-0000-0000-0000000000b1';
begin
  insert into bug_reports (student_id, title) values (p1, 'First'), (p1, 'Second');
  perform pg_temp.check('user cannot read problem reports', 'authenticated', p1, 'select * from bug_reports', 'error');
  perform pg_temp.check('anon cannot read problem reports', 'anon', null, 'select * from bug_reports', 'error');
  perform pg_temp.check('user cannot write problem reports', 'authenticated', p1,
    format('insert into bug_reports (student_id, title) values (%L, %L)', p1, 'sneaky'), 'error');
  perform pg_temp.check('server saves a report and it is numbered', 'service_role', null,
    format('insert into bug_reports (student_id, title) values (%L, %L); select 1 from bug_reports where title = %L and number > 0', p1, 'Third', 'Third'), '1');
  perform pg_temp.check('numbers go up', 'service_role', null,
    'select 1 from bug_reports a, bug_reports b where a.title = ''First'' and b.title = ''Second'' and b.number > a.number', '1');
  perform pg_temp.check('a report needs a title', 'service_role', null, format('insert into bug_reports (student_id, title) values (%L, %L)', p1, ''), 'error');
  perform pg_temp.check('a status must be a known one', 'service_role', null, format('insert into bug_reports (student_id, title, status) values (%L, %L, %L)', p1, 'x', 'banana'), 'error');
  perform pg_temp.check('server can resolve a report', 'service_role', null,
    'update bug_reports set status = ''fixed'', resolution = ''done'', resolved_at = now() where title = ''First''; select 1 from bug_reports where status = ''fixed''', '1');
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
-- Parent 1 also has an upload that stopped midway: it must never be searched.
insert into documents (id, title, owner_id, source_type, status) values
  ('00000000-0000-0000-0000-0000000000d3', 'Parent 1 unfinished upload', '00000000-0000-0000-0000-0000000000b1', 'textbook', 'processing');
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
  perform pg_temp.check('the retired schools table is gone', 'service_role', null, 'select * from schools', 'error');
  perform pg_temp.check('the retired subjects table is gone', 'service_role', null, 'select * from subjects', 'error');
  perform pg_temp.check('users cannot replace page chunks', 'authenticated', p1,
    format('select replace_page_chunks(%L, %L, %L, 1, null, %L::jsonb)', '00000000-0000-0000-0000-0000000000d3', p1, 'textbook', '[]'), 'error');
  perform pg_temp.check('users cannot read page job counts', 'authenticated', p1, format('select * from page_job_counts(%L)', p1), 'error');
  perform pg_temp.check('a page is saved atomically', 'service_role', null,
    format('select replace_page_chunks(%L, %L, %L, 7, null, %L::jsonb)', '00000000-0000-0000-0000-0000000000d3', p1, 'textbook',
      jsonb_build_array(jsonb_build_object('section_label', 'A', 'chunk_index', 0, 'content', 'hello', 'embedding', (select jsonb_agg(0.1) from generate_series(1, 768))))::text), 'ok');
  perform pg_temp.check('saving a page again replaces it, not adds', 'service_role', null,
    format('select replace_page_chunks(%L, %L, %L, 7, null, %L::jsonb); select 1 from chunks where document_id = %L and page_number = 7',
      '00000000-0000-0000-0000-0000000000d3', p1, 'textbook',
      jsonb_build_array(jsonb_build_object('section_label', 'B', 'chunk_index', 0, 'content', 'again', 'embedding', (select jsonb_agg(0.2) from generate_series(1, 768))))::text,
      '00000000-0000-0000-0000-0000000000d3'), '1');

  -- Server (service role): search is limited to the owner's own books.
  perform pg_temp.check('search returns only the owner''s chunks', 'service_role', null,
    format('select * from match_owner_chunks(%s, %L)', vec, p1), '1');
  perform pg_temp.check('search ignores other owners'' book ids', 'service_role', null,
    format('select * from match_owner_chunks(%s, %L, array[%L]::uuid[])', vec, p1,
           '00000000-0000-0000-0000-0000000000d2'), '0');
  perform pg_temp.check('search skips unfinished uploads even when asked for them', 'service_role', null,
    format('select * from match_owner_chunks(%s, %L, array[%L]::uuid[])', vec, p1,
           '00000000-0000-0000-0000-0000000000d3'), '0');
  perform pg_temp.check('server reads monthly usage', 'service_role', null,
    format('select 1 where student_monthly_usage(%L) = 15', p1), '1');
  perform pg_temp.check('server reads everyone''s monthly usage in one query', 'service_role', null,
    format('select 1 from monthly_usage_all() where student_id = %L and used = 15', p1), '1');
  perform pg_temp.check('user cannot call monthly_usage_all', 'authenticated', p1,
    'select * from monthly_usage_all()', 'error');
  perform pg_temp.check('anon cannot call monthly_usage_all', 'anon', null,
    'select * from monthly_usage_all()', 'error');
  perform pg_temp.check_answer_row();
  perform pg_temp.check_page_jobs();
  perform pg_temp.check_page_reads();
  perform pg_temp.check_bug_reports();
  perform pg_temp.check('user cannot call chunk_text_size', 'authenticated', p1, format('select * from chunk_text_size(%L, null)', p1), 'error');
  perform pg_temp.check('server reads the size of a set of books', 'service_role', null, format('select 1 from chunk_text_size(%L, null) where chars >= 0 and chunks >= 0', p1), '1');
  perform pg_temp.check('an answer keeps its confidence', 'service_role', null,
    'update generated_documents set confidence = ''{"correct": 95, "fromBook": 89, "reasons": []}''::jsonb where id = (select id from generated_documents limit 1); select 1 from generated_documents where (confidence->>''correct'')::int = 95', '1');
  perform pg_temp.check('user cannot read the error log', 'authenticated', p1, 'select * from error_log', 'error');
  perform pg_temp.check('user cannot write the error log', 'authenticated', p1,
    'insert into error_log (source, context, message) values (''browser'', ''x'', ''x'')', 'error');
  perform pg_temp.check('anon cannot read the error log', 'anon', null, 'select * from error_log', 'error');
  perform pg_temp.check('server can write the error log', 'service_role', null,
    'insert into error_log (source, context, message) values (''server'', ''test'', ''boom'')', '1');
  perform pg_temp.check('server can purge the error log', 'service_role', null, 'select purge_error_log()', '1');
  perform pg_temp.check('user cannot purge the error log', 'authenticated', p1, 'select purge_error_log()', 'error');

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
  perform pg_temp.check('a user ID can be set', 'service_role', null,
    format('update students set login_id = %L where id = %L', 'guest', p1), '1');
  perform pg_temp.check('a badly formed user ID is refused', 'service_role', null,
    format('update students set login_id = %L where id = %L', 'Bad ID', p2), 'error');
  perform pg_temp.check('a user ID cannot be used twice', 'service_role', null,
    format('update students set login_id = %L where id = %L', 'guest', p2), 'error');
end $$;

-- Advisor regressions: every function has a fixed search_path, and no table
-- has two permissive policies for the same action.
insert into results
select 'functions have a fixed search_path', count(*) = 0, string_agg(proname, ', ')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.proconfig is null
  and p.proname in ('set_updated_at', 'claim_page_job', 'is_admin');
insert into results
select 'one permissive policy per table and action', count(*) = 0, string_agg(tablename || ' ' || cmd, ', ')
from (
  select tablename, c.cmd
  from pg_policies pp
  cross join lateral (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) c(cmd)
  where pp.schemaname = 'public' and pp.permissive = 'PERMISSIVE' and (pp.cmd = c.cmd or pp.cmd = 'ALL')
  group by tablename, c.cmd having count(*) > 1
) dup;

select case when ok then 'PASS' else 'FAIL' end || '  ' || name || case when ok then '' else '  (' || detail || ')' end
from results;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from results;
