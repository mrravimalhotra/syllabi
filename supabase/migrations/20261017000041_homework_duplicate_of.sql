-- A diary entry that looks like one already in the list (the same diary day added again, read a little differently):
-- it points at the entry it resembles, so the grown-up can merge the two or keep both. Clear repeats are not stored at all.
alter table homework_entries add column if not exists duplicate_of uuid references homework_entries(id) on delete set null;
