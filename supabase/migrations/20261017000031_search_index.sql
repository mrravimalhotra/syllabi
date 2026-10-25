-- Faster book search for large libraries, without ever returning worse matches.
--
-- Every search looks only inside one account's books. An approximate index
-- (HNSW) ranks passages from every account and filters afterwards, so on its own
-- it can return too few of this account's passages; that is why the first index
-- was dropped (migration 6). So:
--   * a search over up to 50,000 passages (today, every library) stays an exact
--     scan of that account's passages: always the true best matches;
--   * only a bigger search uses the index, and keeps walking it until it has
--     enough of this account's passages (pgvector 0.8 "iterative scan"; on an
--     older pgvector that setting is skipped). If the index still finds fewer
--     matches than the account has, the exact scan is used after all.
-- The limit can be lowered for a test with: set syllabi.exact_search_limit = 10.

create index if not exists idx_chunks_embedding_hnsw on chunks using hnsw (embedding vector_cosine_ops);

create or replace function match_owner_chunks (
  query_embedding vector(768),
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
  passages bigint;
  indexed bigint;
  exact_limit bigint := coalesce(nullif(current_setting('syllabi.exact_search_limit', true), '')::bigint, 50000);
begin
  select count(*) into passages
    from chunks c
    join documents d on d.id = c.document_id and d.status = 'ready'
   where c.owner_id = match_owner_id
     and (match_document_ids is null or c.document_id = any(match_document_ids));

  if passages > exact_limit then
    begin
      perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
      perform set_config('hnsw.ef_search', '200', true);
    exception when others then
      null; -- pgvector before 0.8: no iterative scan
    end;
    select count(*) into indexed from (
      select 1
        from chunks c
        join documents d on d.id = c.document_id and d.status = 'ready'
       where c.owner_id = match_owner_id
         and (match_document_ids is null or c.document_id = any(match_document_ids))
       order by c.embedding <=> query_embedding
       limit match_count
    ) found;
  end if;

  -- A small library, or an index search that came up short: the exact scan.
  if passages <= exact_limit or indexed < least(match_count, passages) then
    -- "+ 0" keeps the planner off the approximate index: an exact scan of this account's passages.
    return query
      select c.id, c.document_id, c.content, c.section_label, c.page_number, c.source_type, c.image_path,
             1 - (c.embedding <=> query_embedding)
        from chunks c
        join documents d on d.id = c.document_id and d.status = 'ready'
       where c.owner_id = match_owner_id
         and (match_document_ids is null or c.document_id = any(match_document_ids))
       order by (c.embedding <=> query_embedding) + 0
       limit match_count;
    return;
  end if;

  -- relaxed_order can return matches slightly out of order: sort them again.
  return query
    select m.* from (
      select c.id, c.document_id, c.content, c.section_label, c.page_number, c.source_type, c.image_path,
             1 - (c.embedding <=> query_embedding) as similarity
        from chunks c
        join documents d on d.id = c.document_id and d.status = 'ready'
       where c.owner_id = match_owner_id
         and (match_document_ids is null or c.document_id = any(match_document_ids))
       order by c.embedding <=> query_embedding
       limit match_count
    ) m
    order by m.similarity desc;
end $$;

revoke execute on function match_owner_chunks(vector, uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function match_owner_chunks(vector, uuid, uuid[], integer) to service_role;
