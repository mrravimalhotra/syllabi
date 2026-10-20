-- Paper checker: a teacher-style marking of a student's solved maths paper (photos or a PDF
-- with several sums): steps and answer marked, a grade, and ways to do better. A new kind of
-- saved answer, with its own model setting so the admin can route it separately.
alter table generated_documents drop constraint if exists generated_documents_task_type_check;
alter table generated_documents add constraint generated_documents_task_type_check
  check (task_type in ('solution', 'notes', 'sample_paper', 'ad_hoc', 'study_pack', 'paper_check'));

alter table llm_settings drop constraint if exists llm_settings_task_type_check;
alter table llm_settings add constraint llm_settings_task_type_check
  check (task_type in ('ocr_extraction', 'embedding', 'solution', 'notes', 'sample_paper', 'ad_hoc', 'study_pack', 'paper_check'));

insert into llm_settings (task_type, provider, model)
values ('paper_check', 'google', 'gemini-flash-latest')
on conflict (task_type) do nothing;
