-- "Solve all" parts are kept as the book's answer key (reused next time) instead of being deleted once they are put
-- together: each points at the combined answer it is part of, and is hidden from My Documents. Deleting the combined
-- answer deletes its parts too.
alter table generated_documents add column if not exists part_of uuid references generated_documents(id) on delete cascade;
create index if not exists generated_documents_part_of on generated_documents(part_of) where part_of is not null;
