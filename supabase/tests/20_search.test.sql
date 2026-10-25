-- Book search (match_owner_chunks): always this account's true best passages, from finished books
-- only, whether the library is searched exactly or through the approximate index.
-- Runs after all migrations (see scripts/test-db.sh). Prints one line per check.

create temp table results (name text, ok boolean, detail text);

-- A passage whose embedding points `angle` radians away from the question's (smaller is closer).
create function pg_temp.towards(angle float) returns vector language sql as $$
  select (array[cos(angle), sin(angle)]::real[] || array_fill(0::real, array[766]))::vector
$$;

-- The plan for the ranking the index is meant for (all accounts' passages, closest first).
create function pg_temp.plan() returns setof text language plpgsql as $$
begin
  return query execute 'explain select id from chunks order by embedding <=> ' || quote_literal(pg_temp.towards(0)::text) || '::vector limit 8';
end $$;

insert into auth.users values
  ('00000000-0000-0000-0000-0000000000e1', 'search1@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'search2@example.com');
insert into students (id, email, role, active) values
  ('00000000-0000-0000-0000-0000000000e1', 'search1@example.com', 'student', true),
  ('00000000-0000-0000-0000-0000000000e2', 'search2@example.com', 'student', true);
insert into documents (id, title, owner_id, source_type, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'Mine', '00000000-0000-0000-0000-0000000000e1', 'textbook', 'ready'),
  ('00000000-0000-0000-0000-0000000000f2', 'Mine, still being read', '00000000-0000-0000-0000-0000000000e1', 'textbook', 'processing'),
  ('00000000-0000-0000-0000-0000000000f3', 'Someone else''s', '00000000-0000-0000-0000-0000000000e2', 'textbook', 'ready');
-- My 300 passages, between 0.2 and 0.5 radians from the question; my unfinished book is closer still;
-- someone else's 3,000 passages are all closer than mine (the case an approximate index gets wrong).
insert into chunks (document_id, owner_id, source_type, content, embedding)
select '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'textbook', 'mine ' || i, pg_temp.towards(0.2 + i * 0.001)
from generate_series(0, 299) i;
insert into chunks (document_id, owner_id, source_type, content, embedding)
select '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'textbook', 'unfinished ' || i, pg_temp.towards(0.01 * i / 100.0)
from generate_series(0, 49) i;
insert into chunks (document_id, owner_id, source_type, content, embedding)
select '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e2', 'textbook', 'theirs ' || i, pg_temp.towards(0.15 * i / 3000.0)
from generate_series(0, 2999) i;
analyze chunks;

create temp table exact as
select * from match_owner_chunks(pg_temp.towards(0), '00000000-0000-0000-0000-0000000000e1', null, 8);
insert into results
select 'exact search: 8 of my own passages, the closest first',
       count(*) = 8 and bool_and(content like 'mine %') and (array_agg(content order by similarity desc))[1] = 'mine 0',
       string_agg(content, ', ' order by similarity desc)
from exact;
insert into results
select 'exact search: nothing from a book still being read, or from someone else', count(*) = 0, string_agg(content, ', ')
from exact where content not like 'mine %';

-- The same search as for a big library, through the approximate index.
set syllabi.exact_search_limit = 10;
create temp table indexed as
select * from match_owner_chunks(pg_temp.towards(0), '00000000-0000-0000-0000-0000000000e1', null, 8);
insert into results
select 'big-library search: the same 8 best passages as the exact search, in order',
       (select array_agg(content order by similarity desc) from indexed) = (select array_agg(content order by similarity desc) from exact),
       (select string_agg(content, ', ' order by similarity desc) from indexed);
insert into results
select 'big-library search: limited to the chosen book',
       count(*) = 8 and bool_and(document_id = '00000000-0000-0000-0000-0000000000f1'), count(*)::text
from match_owner_chunks(pg_temp.towards(0), '00000000-0000-0000-0000-0000000000e1', array['00000000-0000-0000-0000-0000000000f1'::uuid], 8);
-- Forcing the planner onto the index: whatever the index returns, the result is still the true best 8.
set enable_seqscan = off;
insert into results
select 'big-library search through the index: still the same 8 best passages',
       (select array_agg(content order by similarity desc) from match_owner_chunks(pg_temp.towards(0), '00000000-0000-0000-0000-0000000000e1', null, 8))
         = (select array_agg(content order by similarity desc) from exact),
       null;
insert into results
select 'the planner can use the index for the ranking query', plan::text like '%idx_chunks_embedding_hnsw%', left(plan::text, 300)
from (select json_agg(p) plan from (select * from pg_temp.plan()) p) x;
reset enable_seqscan;
reset syllabi.exact_search_limit;

insert into results
select 'the approximate index exists', count(*) = 1, null from pg_indexes where indexname = 'idx_chunks_embedding_hnsw';

select case when ok then 'PASS' else 'FAIL' end || '  ' || name || case when ok then '' else '  (' || detail || ')' end
from results;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from results;
