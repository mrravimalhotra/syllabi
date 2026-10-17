-- Worked examples (long division, LCM/HCF...) are worked out by code with no
-- AI; a saved one keeps just its problem, and the steps are recomputed when
-- it is opened.
alter table generated_documents add column if not exists worked jsonb;
