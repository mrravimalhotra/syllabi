-- How sure we are an answer is correct and grounded in the books, and how much of it
-- comes from the books: two numbers worked out by code when the answer is made,
-- kept with it so a reopened answer shows them too. Answers made earlier have none.
alter table generated_documents add column if not exists confidence jsonb;
