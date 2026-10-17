-- Tightens Row Level Security. The publishable (anon) key is public, so any
-- signed-in user can call the Supabase REST API directly; policies must hold
-- up without the app in front of them. All app writes and all knowledge-base
-- reads already go through the service-role client (which bypasses RLS), so
-- these changes do not affect the app itself. Idempotent.
--
-- 1. students: users could update their own row with no column limits
--    (role = 'admin', active = true, token_quota = ...). Writes are now
--    admin-only; users keep read access to their own row.
-- 2. Knowledge base, taxonomy and llm_settings were readable by any
--    authenticated user, including pending/revoked students. Taxonomy now
--    requires an active student; documents, chunks and llm_settings are
--    admin-only (retrieval runs server-side with the service role, so
--    students never need direct access, and this also stops an active
--    student reading another school's materials).
-- 3. generated_documents: users could insert a row pointing at any storage
--    path (e.g. another student's PDF) and download it via the signed-URL
--    route. Inserts are now admin-only (the server uses the service role).

-- Helper: is the current auth user an active student (any role)?
create or replace function is_active_student()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from students
    where id = auth.uid() and active = true
  );
$$;

-- 1. students
drop policy if exists students_update_own on students;
drop policy if exists students_update_admin on students;
create policy students_update_admin on students
  for update using (is_admin()) with check (is_admin());

drop policy if exists students_insert_admin on students;
create policy students_insert_admin on students
  for insert with check (is_admin());

-- 2. Reads limited to active students (taxonomy) or admins (everything else)
drop policy if exists schools_select_all on schools;
create policy schools_select_all on schools for select using (is_active_student());

drop policy if exists grades_select_all on grades;
create policy grades_select_all on grades for select using (is_active_student());

drop policy if exists subjects_select_all on subjects;
create policy subjects_select_all on subjects for select using (is_active_student());

drop policy if exists llm_settings_select_all on llm_settings;
create policy llm_settings_select_all on llm_settings for select using (is_admin());

drop policy if exists documents_select_all on documents;
create policy documents_select_all on documents for select using (is_admin());

drop policy if exists chunks_select_all on chunks;
create policy chunks_select_all on chunks for select using (is_admin());

-- 3. generated_documents
drop policy if exists generated_documents_insert_own on generated_documents;
drop policy if exists generated_documents_insert_admin on generated_documents;
create policy generated_documents_insert_admin on generated_documents
  for insert with check (is_admin());
