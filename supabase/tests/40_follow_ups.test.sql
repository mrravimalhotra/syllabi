-- Follow-ups on a saved answer (add_follow_up): each is added in one step, up to the limit.
-- Uses the account seeded by 20_search.test.sql. Prints one line per check.

create temp table results (name text, ok boolean, detail text);

insert into generated_documents (id, student_id, task_type, title, content, sources)
values ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000e1', 'solution', 'Q', 'A', '[]');

insert into results
select 'a new answer has no follow-ups', follow_ups = '[]'::jsonb, follow_ups::text
from generated_documents where id = '00000000-0000-0000-0000-0000000000a9';
insert into results
select 'the first follow-up is added', add_follow_up('00000000-0000-0000-0000-0000000000a9', '{"question":"q1","answer":"a1","createdAt":"t"}', 2) = 1, null;
insert into results
select 'the second is added after it', add_follow_up('00000000-0000-0000-0000-0000000000a9', '{"question":"q2","answer":"a2","createdAt":"t"}', 2) = 2, null;
insert into results
select 'over the limit nothing is added', add_follow_up('00000000-0000-0000-0000-0000000000a9', '{"question":"q3","answer":"a3","createdAt":"t"}', 2) is null, null;
insert into results
select 'they are kept in order', follow_ups->0->>'question' = 'q1' and follow_ups->1->>'question' = 'q2' and jsonb_array_length(follow_ups) = 2, follow_ups::text
from generated_documents where id = '00000000-0000-0000-0000-0000000000a9';
insert into results
select 'a missing answer adds nothing', add_follow_up('00000000-0000-0000-0000-0000000000ff', '{}', 2) is null, null;

select case when ok then 'PASS' else 'FAIL' end || '  ' || name || case when ok then '' else '  (' || detail || ')' end
from results;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from results;
