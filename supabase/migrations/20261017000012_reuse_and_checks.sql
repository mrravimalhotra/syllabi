-- Reusing answers and recording code checks (docs/decisions.md, "minimise AI").
-- cache_key: a fingerprint of everything that shapes an answer (question,
-- attachments, books searched, language, class, model and instructions); the
-- same fingerprint again returns the saved answer with no AI call.
-- checks: what Syllabi's own code verified (calculations, marks, questions
-- answered), shown with the answer.
alter table generated_documents add column if not exists cache_key text;
alter table generated_documents add column if not exists checks jsonb not null default '[]';
create index if not exists idx_generated_documents_reuse
  on generated_documents(student_id, cache_key, created_at desc)
  where cache_key is not null;
