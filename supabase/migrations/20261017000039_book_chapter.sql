-- The chapter a book belongs to ("Unit 2 Lithosphere"), so the Solve screen can narrow a long list of books by
-- class, subject and chapter, and pick a chapter's textbook and exercises together. Typed by the owner; existing
-- books are given a first guess from their title (the subject at the start and the kind of book at the end taken
-- off), which the owner can correct in My books.

alter table documents add column if not exists chapter text;

update documents
set chapter = nullif(
  trim(regexp_replace(
    regexp_replace(title, '^\s*' || regexp_replace(coalesce(subject, ''), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\s*[:,-]?\s*', '', 'i'),
    '\s*[-:,(]?\s*(text\s*book|exercises?|work\s*book|notes|past\s*papers?|test\s*papers?)\)?\s*$', '', 'i'
  )),
  '')
where chapter is null and coalesce(subject, '') <> '';
