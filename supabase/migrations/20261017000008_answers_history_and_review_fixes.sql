-- Fixes and additions from the full app review (2026-10-17).
--
-- 1. Search only finished books. An upload that stopped midway (tab closed,
--    network drop) leaves a "processing" or "failed" book with some pages
--    indexed; those must never feed answers.
-- 2. Saved answers keep their text, sources and Google Search suggestions, so
--    they can be reopened, printed and turned into a PDF on demand. Generated
--    PDFs are no longer stored, so storage_path becomes optional (older rows
--    keep theirs).
-- 3. One query for every account's monthly usage (admin Accounts page), in
--    India time like student_monthly_usage.
-- 4. Page reading and "Ask anything" (checking answers, project help) move
--    from Flash-Lite to Flash for accuracy on handwriting and judgement. Only
--    rows still on the old default change; admin choices are kept.

-- 1 ----------------------------------------------------------------------
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
language sql stable
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.section_label,
    c.page_number,
    c.source_type,
    c.image_path,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id and d.status = 'ready'
  where c.owner_id = match_owner_id
    and (match_document_ids is null or c.document_id = any(match_document_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_owner_chunks(vector, uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function match_owner_chunks(vector, uuid, uuid[], integer) to service_role;

-- 2 ----------------------------------------------------------------------
alter table generated_documents
  alter column storage_path drop not null,
  add column if not exists content text,
  add column if not exists sources jsonb not null default '[]'::jsonb,
  add column if not exists used_search_grounding boolean not null default false,
  -- Google's rendered "Search Suggestions" HTML, which its terms require to be
  -- shown with an answer that used Google Search.
  add column if not exists search_suggestions_html text;

-- 3 ----------------------------------------------------------------------
create or replace function monthly_usage_all()
returns table (student_id uuid, used integer)
language sql stable
set search_path = public
as $$
  select t.student_id, coalesce(sum(t.total_tokens), 0)::integer
  from token_usage t
  where t.created_at >= (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
  group by t.student_id;
$$;

revoke execute on function monthly_usage_all() from public, anon, authenticated;
grant execute on function monthly_usage_all() to service_role;

-- 4 ----------------------------------------------------------------------
update llm_settings
set model = 'gemini-flash-latest', updated_at = now()
where task_type in ('ocr_extraction', 'ad_hoc')
  and provider = 'google'
  and model = 'gemini-flash-lite-latest';
