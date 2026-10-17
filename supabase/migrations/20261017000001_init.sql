-- Syllabi initial schema
-- Postgres + pgvector serving as both relational store and RAG vector store.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────
-- Taxonomy: schools, grades, subjects
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null, -- e.g. "Grade 9"
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null, -- e.g. "Physics"
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Students (profile linked 1:1 to Supabase Auth user)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists students (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  role text not null default 'student' check (role in ('student', 'admin')),
  school_id uuid references schools(id) on delete set null,
  grade_id uuid references grades(id) on delete set null,
  subject_ids uuid[] not null default '{}',
  active boolean not null default true,
  token_quota integer not null default 200000, -- monthly quota, tokens
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_students_school on students(school_id);
create index if not exists idx_students_active on students(active);

-- ─────────────────────────────────────────────────────────────────────────
-- LLM settings: admin-configurable provider/model routing per task type
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists llm_settings (
  task_type text primary key check (task_type in (
    'ocr_extraction', 'embedding', 'solution', 'notes',
    'sample_paper', 'ad_hoc', 'coverage_check'
  )),
  provider text not null default 'google' check (provider in ('google', 'anthropic', 'openai')),
  model text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references students(id) on delete set null
);

insert into llm_settings (task_type, provider, model) values
  ('ocr_extraction', 'google', 'gemini-flash-lite-latest'),
  ('embedding',      'google', 'gemini-embedding-001'),
  ('solution',       'google', 'gemini-flash-latest'),
  ('notes',          'google', 'gemini-flash-latest'),
  ('sample_paper',   'google', 'gemini-flash-latest'),
  ('ad_hoc',         'google', 'gemini-flash-lite-latest'),
  ('coverage_check', 'google', 'gemini-flash-lite-latest')
on conflict (task_type) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- Documents + chunks (RAG knowledge base, hierarchically tagged)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  school_id uuid not null references schools(id) on delete cascade,
  grade_id uuid not null references grades(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  source_type text not null check (source_type in ('textbook', 'exercise', 'past_paper', 'notes')),
  storage_path text, -- original uploaded file in Supabase Storage
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  uploaded_by uuid references students(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_taxonomy on documents(school_id, grade_id, subject_id);

-- text-embedding-004 produces 768-dim vectors; adjust if the configured
-- embedding model changes (see llm_settings.embedding).
create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  grade_id uuid not null references grades(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  source_type text not null,
  page_number integer,
  section_label text, -- e.g. "Chapter 3 > Question 4"
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists idx_chunks_taxonomy on chunks(school_id, grade_id, subject_id);
create index if not exists idx_chunks_document on chunks(document_id);

-- ANN index for cosine similarity search, scoped by the taxonomy filters above.
create index if not exists idx_chunks_embedding on chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Vector search RPC: filtered by taxonomy first, then ranked by similarity.
create or replace function match_chunks (
  query_embedding vector(768),
  match_school_id uuid,
  match_grade_id uuid,
  match_subject_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  section_label text,
  page_number int,
  source_type text,
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
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.school_id = match_school_id
    and c.grade_id = match_grade_id
    and c.subject_id = match_subject_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Token usage (quota enforcement)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists token_usage (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  task_type text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_token_usage_student on token_usage(student_id, created_at);

-- Sum of a student's usage for the current calendar month.
create or replace function student_monthly_usage(p_student_id uuid)
returns integer
language sql stable
as $$
  select coalesce(sum(total_tokens), 0)::integer
  from token_usage
  where student_id = p_student_id
    and created_at >= date_trunc('month', now());
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Generated documents (PDF exports)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists generated_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  task_type text not null check (task_type in ('solution', 'notes', 'sample_paper', 'ad_hoc')),
  title text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_generated_documents_student on generated_documents(student_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at trigger for students
-- ─────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_students_updated_at on students;
create trigger trg_students_updated_at
  before update on students
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────

alter table schools enable row level security;
alter table grades enable row level security;
alter table subjects enable row level security;
alter table students enable row level security;
alter table llm_settings enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
alter table token_usage enable row level security;
alter table generated_documents enable row level security;

-- Helper: is the current auth user an active admin?
create or replace function is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from students
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- students: a student can read/update their own row; admins can read/update all.
drop policy if exists students_select_own on students;
create policy students_select_own on students
  for select using (id = auth.uid() or is_admin());
drop policy if exists students_update_own on students;
create policy students_update_own on students
  for update using (id = auth.uid() or is_admin());
drop policy if exists students_insert_admin on students;
create policy students_insert_admin on students
  for insert with check (id = auth.uid() or is_admin());
drop policy if exists students_delete_admin on students;
create policy students_delete_admin on students
  for delete using (is_admin());

-- taxonomy: readable by any authenticated active student, writable by admins only.
drop policy if exists schools_select_all on schools;
create policy schools_select_all on schools for select using (auth.role() = 'authenticated');
drop policy if exists schools_write_admin on schools;
create policy schools_write_admin on schools for all using (is_admin()) with check (is_admin());

drop policy if exists grades_select_all on grades;
create policy grades_select_all on grades for select using (auth.role() = 'authenticated');
drop policy if exists grades_write_admin on grades;
create policy grades_write_admin on grades for all using (is_admin()) with check (is_admin());

drop policy if exists subjects_select_all on subjects;
create policy subjects_select_all on subjects for select using (auth.role() = 'authenticated');
drop policy if exists subjects_write_admin on subjects;
create policy subjects_write_admin on subjects for all using (is_admin()) with check (is_admin());

-- llm_settings: readable by authenticated users (needed by server routes), writable by admins only.
drop policy if exists llm_settings_select_all on llm_settings;
create policy llm_settings_select_all on llm_settings for select using (auth.role() = 'authenticated');
drop policy if exists llm_settings_write_admin on llm_settings;
create policy llm_settings_write_admin on llm_settings for all using (is_admin()) with check (is_admin());

-- documents/chunks: readable by any active student (filtered app-side by taxonomy), writable by admins only.
drop policy if exists documents_select_all on documents;
create policy documents_select_all on documents for select using (auth.role() = 'authenticated');
drop policy if exists documents_write_admin on documents;
create policy documents_write_admin on documents for all using (is_admin()) with check (is_admin());

drop policy if exists chunks_select_all on chunks;
create policy chunks_select_all on chunks for select using (auth.role() = 'authenticated');
drop policy if exists chunks_write_admin on chunks;
create policy chunks_write_admin on chunks for all using (is_admin()) with check (is_admin());

-- token_usage: a student can read their own usage; admins can read/write all; inserts happen via service role from server routes.
drop policy if exists token_usage_select_own on token_usage;
create policy token_usage_select_own on token_usage
  for select using (student_id = auth.uid() or is_admin());
drop policy if exists token_usage_write_admin on token_usage;
create policy token_usage_write_admin on token_usage
  for insert with check (is_admin());

-- generated_documents: a student can see and create their own; admins can see all.
drop policy if exists generated_documents_select_own on generated_documents;
create policy generated_documents_select_own on generated_documents
  for select using (student_id = auth.uid() or is_admin());
drop policy if exists generated_documents_insert_own on generated_documents;
create policy generated_documents_insert_own on generated_documents
  for insert with check (student_id = auth.uid() or is_admin());
