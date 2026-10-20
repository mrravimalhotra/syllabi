-- How sure we are that each scanned page was read completely (0 to 100), saved
-- when the page is read, so a book can show a scan-quality score and ask for a
-- re-scan when it is low. Only the server reads and writes it.
create table if not exists page_reads (
  document_id uuid not null references documents(id) on delete cascade,
  page_number int not null check (page_number between 1 and 10000),
  owner_id uuid not null references students(id) on delete cascade,
  confidence int not null check (confidence between 0 and 100),
  -- Why points were lost: blurry, too_dark, faded, low_resolution, garbled, ...
  issues text[] not null default '{}',
  read_at timestamptz not null default now(),
  primary key (document_id, page_number)
);
create index if not exists idx_page_reads_owner on page_reads (owner_id);

alter table page_reads enable row level security;
revoke all on page_reads from anon, authenticated;

-- One row per book: pages scored, their average, the weak pages (under 60), and every issue seen.
create or replace function page_read_summary(p_owner_id uuid)
returns table (document_id uuid, pages int, average numeric, weak_pages int[], issues text[])
language sql
stable
security definer
set search_path = public
as $$
  select r.document_id,
         count(*)::int,
         round(avg(r.confidence), 1),
         coalesce(array_agg(r.page_number order by r.page_number) filter (where r.confidence < 60), '{}'::int[]),
         coalesce((select array_agg(distinct i order by i) from page_reads r2, unnest(r2.issues) i where r2.document_id = r.document_id), '{}'::text[])
    from page_reads r
   where r.owner_id = p_owner_id
   group by r.document_id
$$;
revoke execute on function page_read_summary(uuid) from public, anon, authenticated;
grant execute on function page_read_summary(uuid) to service_role;
