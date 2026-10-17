-- Study packs: a whole-chapter study guide (walkthrough, textbook Q&A, practice
-- test, glossary) saved with the other answers. See docs/study-pack.md.

-- 1. A new kind of saved answer, holding its structured pack.
alter table generated_documents drop constraint if exists generated_documents_task_type_check;
alter table generated_documents add constraint generated_documents_task_type_check
  check (task_type in ('solution', 'notes', 'sample_paper', 'ad_hoc', 'study_pack'));

alter table generated_documents add column if not exists pack jsonb;

-- 2. Its own model setting, so the admin can route it separately.
alter table llm_settings drop constraint if exists llm_settings_task_type_check;
alter table llm_settings add constraint llm_settings_task_type_check
  check (task_type in (
    'ocr_extraction', 'embedding', 'solution', 'notes',
    'sample_paper', 'ad_hoc', 'coverage_check', 'study_pack'
  ));

insert into llm_settings (task_type, provider, model)
values ('study_pack', 'google', 'gemini-flash-latest')
on conflict (task_type) do nothing;

-- 3. Keep the order of passages within a page, so a whole chapter can be
--    put back together in reading order. Older rows have no index and sort
--    after indexed ones on the same page.
alter table chunks add column if not exists chunk_index integer;
create index if not exists idx_chunks_document_order on chunks(document_id, page_number, chunk_index);
