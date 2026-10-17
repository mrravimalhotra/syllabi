-- The child's class and school board, set on the Account page and passed to
-- every answer and study pack ("write for a Class 6 CBSE student").
alter table students add column if not exists class_level text
  check (class_level is null or char_length(class_level) <= 40);
alter table students add column if not exists board text
  check (board is null or char_length(board) <= 40);
