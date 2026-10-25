-- Exact-word book search (match_owner_chunks_text): finds passages by their words, including
-- references like "3.2" and "Q5", from this account's finished books only.
-- Uses the accounts and books seeded by 20_search.test.sql. Prints one line per check.

create temp table results (name text, ok boolean, detail text);

create function pg_temp.towards(angle float) returns vector language sql as $$
  select (array[cos(angle), sin(angle)]::real[] || array_fill(0::real, array[766]))::vector
$$;

insert into chunks (document_id, owner_id, source_type, section_label, content, embedding) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'exercise', 'Exercise 3.2', 'Q5. Find the LCM of 12 and 18.', pg_temp.towards(1.2)),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'exercise', 'Exercise 3.1', 'Q5. Add 3 and 4.', pg_temp.towards(1.3)),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'exercise', 'Exercise 3.2', 'Q5 in a book still being read.', pg_temp.towards(1.2)),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e2', 'exercise', 'Exercise 3.2', 'Q5 in someone else''s book.', pg_temp.towards(1.2)),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'textbook', 'Chapter 4', 'प्रकाश संश्लेषण पौधों में होता है।', pg_temp.towards(1.4));

create temp table found as
select * from match_owner_chunks_text(pg_temp.towards(0), array['3.2', 'q5'], '00000000-0000-0000-0000-0000000000e1', null, 8);
insert into results
select 'the passage holding both "3.2" and "Q5" comes first', (array_agg(content))[1] = 'Q5. Find the LCM of 12 and 18.', string_agg(content, ' | ')
from found;
insert into results
select 'a passage holding only one of them still comes, after it', count(*) = 2, string_agg(content, ' | ')
from found;
insert into results
select 'nothing from a book still being read, or from someone else', count(*) = 0, string_agg(content, ' | ')
from found where content like '%being read%' or content like '%someone else%';
insert into results
select 'each passage carries its closeness by meaning too', bool_and(similarity between 0 and 1), string_agg(similarity::text, ', ')
from found;
insert into results
select 'Hindi words are found', count(*) = 1, null
from match_owner_chunks_text(pg_temp.towards(0), array['संश्लेषण'], '00000000-0000-0000-0000-0000000000e1', null, 8);
insert into results
select 'no usable words: nothing, and no error', count(*) = 0, null
from match_owner_chunks_text(pg_temp.towards(0), array['', '  '], '00000000-0000-0000-0000-0000000000e1', null, 8);

select case when ok then 'PASS' else 'FAIL' end || '  ' || name || case when ok then '' else '  (' || detail || ')' end
from results;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from results;
