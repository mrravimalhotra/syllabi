-- Notices from the diary's "Additional Information" (bring chart paper, a test date, a PTM) are kept as
-- entries of their own kind, ticked off like the rest.
alter table homework_entries drop constraint if exists homework_entries_kind_check;
alter table homework_entries add constraint homework_entries_kind_check check (kind in ('classwork', 'homework', 'note'));
