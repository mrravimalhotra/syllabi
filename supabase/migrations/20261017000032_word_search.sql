-- Exact-word book search, alongside the meaning-based (vector) search.
--
-- A vector search finds passages that mean the same thing, but matches exact
-- references poorly: "Ex 3.2 Q5", a name, or a term the passage spells out. So
-- each passage also keeps its words (with its section label) in a word index,
-- and match_owner_chunks_text finds the passages holding any of the question's
-- key words, best first. The app merges both lists (lib/rag/retrieve.ts).
-- 'simple' keeps every word as written (no English stemming), so references
-- like "3.2" and "q5", and Hindi words, are matched as they are.

alter table chunks
  add column if not exists search_words tsvector
  generated always as (to_tsvector('simple', coalesce(section_label, '') || ' ' || content)) stored;

create index if not exists idx_chunks_search_words on chunks using gin (search_words);

-- Passages of this account's finished books holding any of `query_words`, the most
-- (and closest together) first; `similarity` is their vector similarity to the question.
create or replace function match_owner_chunks_text (
  query_embedding vector(768),
  query_words text[],
  match_owner_id uuid,
  match_document_ids uuid[] default null,
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  section_label text,
  page_number int,
  source_type text,
  image_path text,
  similarity float
)
language plpgsql stable
set search_path = public
as $$
#variable_conflict use_column
declare
  wanted tsquery;
  word text;
  part tsquery;
begin
  foreach word in array coalesce(query_words, '{}') loop
    part := plainto_tsquery('simple', word);
    if numnode(part) > 0 then
      wanted := case when wanted is null then part else wanted || part end;
    end if;
  end loop;
  if wanted is null then
    return;
  end if;

  return query
    select c.id, c.document_id, c.content, c.section_label, c.page_number, c.source_type, c.image_path,
           1 - (c.embedding <=> query_embedding)
      from chunks c
      join documents d on d.id = c.document_id and d.status = 'ready'
     where c.owner_id = match_owner_id
       and (match_document_ids is null or c.document_id = any(match_document_ids))
       and c.search_words @@ wanted
     order by ts_rank_cd(c.search_words, wanted) desc
     limit match_count;
end $$;

revoke execute on function match_owner_chunks_text(vector, text[], uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function match_owner_chunks_text(vector, text[], uuid, uuid[], integer) to service_role;
