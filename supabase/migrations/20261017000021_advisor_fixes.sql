-- Fixes for what Supabase's Security and Performance advisors reported.
-- No behaviour changes: the same people can read and write the same rows.

-- 1. Functions with a fixed search_path (so a look-alike object in another
--    schema can never be picked up by mistake).
alter function set_updated_at() set search_path = public;
alter function claim_page_job(int, interval) set search_path = public;

-- 2. "Auth RLS initialization plan": call auth.uid() once per query, not once
--    per row, by wrapping it in a sub-select.
drop policy if exists students_select_own on students;
create policy students_select_own on students
  for select using (id = (select auth.uid()) or is_admin());

drop policy if exists token_usage_select_own on token_usage;
create policy token_usage_select_own on token_usage
  for select using (student_id = (select auth.uid()) or is_admin());

drop policy if exists generated_documents_select_own on generated_documents;
create policy generated_documents_select_own on generated_documents
  for select using (student_id = (select auth.uid()) or is_admin());

-- 3. "Multiple permissive policies": one policy per action.
--    The read rule was the same as the admin rule, and the admin "all" policy
--    already covers reading, so the extra read policy goes.
drop policy if exists documents_select_all on documents;
drop policy if exists chunks_select_all on chunks;
drop policy if exists llm_settings_select_all on llm_settings;

-- 4. Indexes for foreign keys that had none.
create index if not exists error_log_student_id_idx on error_log (student_id);
create index if not exists llm_settings_updated_by_idx on llm_settings (updated_by);
