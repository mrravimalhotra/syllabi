-- "Bring your own book": every document now belongs to the account that
-- uploaded it and is searchable only by that account, the way Claude and
-- Gemini keep a user's uploads private to them. The admin-curated shared
-- library (school/grade/subject taxonomy) is retired: those columns become
-- optional and are no longer written by the app. The schools/grades/subjects
-- tables and students.school_id/grade_id/subject_ids are left in place, unused.

alter table documents
  alter column school_id drop not null,
  alter column grade_id drop not null,
  alter column subject_id drop not null,
  add column if not exists owner_id uuid references students(id) on delete cascade,
  add column if not exists subject text,
  add column if not exists grade text,
  -- When the uploader confirmed they own this copy and will use it only for
  -- their own child's/students' study (required by the upload API).
  add column if not exists rights_confirmed_at timestamptz;

alter table chunks
  alter column school_id drop not null,
  alter column grade_id drop not null,
  alter column subject_id drop not null,
  add column if not exists owner_id uuid references students(id) on delete cascade;

create index if not exists idx_documents_owner on documents(owner_id, created_at desc);
create index if not exists idx_chunks_owner on chunks(owner_id);

-- Each search is limited to one owner's chunks (hundreds to a few thousand
-- rows), where an exact scan is fast and always returns the true top matches.
-- An approximate index over all owners would filter after ranking and could
-- return too few results, so it is dropped.
drop index if exists idx_chunks_embedding;

-- Vector search within one owner's library, optionally limited to chosen documents.
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
  where c.owner_id = match_owner_id
    and (match_document_ids is null or c.document_id = any(match_document_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
