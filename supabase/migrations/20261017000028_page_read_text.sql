-- What the AI read from a page picture, kept with its queue entry until the page is saved,
-- so a page whose saving failed (search index or database hiccup) is saved again on a retry
-- without the AI reading it, and paying for it, a second time. Cleared when the page is
-- uploaded again. Only the server reads and writes page_jobs.
alter table page_jobs add column if not exists read_text text;
