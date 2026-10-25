-- A counter on each saved study pack, raised on every edit, so an edit is only saved when nobody
-- else saved the pack in between (two quick edits to different questions then both stay).
alter table generated_documents add column if not exists pack_version int not null default 0;
