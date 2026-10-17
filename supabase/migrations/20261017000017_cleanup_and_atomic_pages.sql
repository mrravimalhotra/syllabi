-- 1. Remove what the first version (shared school/grade/subject libraries)
--    left behind. Libraries are private to each account now (migration 6) and
--    nothing reads or writes these.

-- Columns first (they hold foreign keys to the taxonomy tables).
alter table students  drop column if exists school_id,  drop column if exists grade_id, drop column if exists subject_ids;
alter table documents drop column if exists school_id,  drop column if exists grade_id, drop column if exists subject_id,
                      drop column if exists storage_path, drop column if exists uploaded_by;
alter table chunks    drop column if exists school_id,  drop column if exists grade_id, drop column if exists subject_id;

-- The taxonomy itself, and the helpers only its policies used.
drop table if exists subjects cascade;
drop table if exists grades cascade;
drop table if exists schools cascade;
drop function if exists is_active_student();
drop function if exists match_chunks(vector, uuid, uuid, uuid, integer);

-- A model setting that nothing reads ("coverage_check": whether to search the
-- web is decided by code, not by an AI call).
delete from llm_settings where task_type = 'coverage_check';
alter table llm_settings drop constraint if exists llm_settings_task_type_check;
alter table llm_settings add constraint llm_settings_task_type_check
  check (task_type in ('ocr_extraction', 'embedding', 'solution', 'notes', 'sample_paper', 'ad_hoc', 'study_pack'));

-- 2. Saving a page's search entries replaces the old ones in one step. Before,
--    the old entries were deleted first, so a failure while saving the new ones
--    left the page missing from search.
create or replace function replace_page_chunks(
  p_document_id uuid,
  p_owner_id uuid,
  p_source_type text,
  p_page_number int,
  p_image_path text,
  p_chunks jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from chunks where document_id = p_document_id and page_number = p_page_number;
  insert into chunks (document_id, owner_id, source_type, page_number, section_label, chunk_index, content, image_path, embedding)
  select p_document_id, p_owner_id, p_source_type, p_page_number,
         c ->> 'section_label', (c ->> 'chunk_index')::int, c ->> 'content', p_image_path, (c ->> 'embedding')::vector
  from jsonb_array_elements(p_chunks) as c;
end $$;
revoke execute on function replace_page_chunks(uuid, uuid, text, int, text, jsonb) from public, anon, authenticated;
grant execute on function replace_page_chunks(uuid, uuid, text, int, text, jsonb) to service_role;

-- 3. Per-status page counts for a book without reading every job row (a book
--    can have thousands of pages, and API responses stop at 1,000 rows).
create or replace function page_job_counts(p_owner_id uuid)
returns table (document_id uuid, status text, jobs bigint)
language sql
stable
security definer
set search_path = public
as $$
  select document_id, status, count(*) from page_jobs where owner_id = p_owner_id group by document_id, status
$$;
revoke execute on function page_job_counts(uuid) from public, anon, authenticated;
grant execute on function page_job_counts(uuid) to service_role;
