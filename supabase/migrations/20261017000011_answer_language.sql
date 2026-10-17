-- The language answers are written in by default (Account page): null means
-- "follow the book and question". Each request can still choose another.
alter table students add column if not exists answer_language text
  check (answer_language is null or answer_language in ('en', 'hi', 'mr', 'fr'));
