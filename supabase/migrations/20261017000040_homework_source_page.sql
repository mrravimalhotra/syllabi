-- The page of a diary upload an entry was read from (1 for the first), so "See the diary page" shows only the page
-- with that entry instead of every page of the upload. Null for typed-in entries and for entries added before this.
alter table homework_entries add column if not exists source_page integer check (source_page is null or source_page >= 1);
