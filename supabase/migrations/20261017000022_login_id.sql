-- A short user ID (like "guest") that can be typed instead of an email on the
-- sign-in page. Only the sign-in page uses it: it looks the ID up and signs in
-- with the account's real login.
alter table students add column if not exists login_id text;

alter table students drop constraint if exists students_login_id_format;
alter table students add constraint students_login_id_format
  check (login_id is null or login_id ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

create unique index if not exists students_login_id_key on students (login_id) where login_id is not null;
