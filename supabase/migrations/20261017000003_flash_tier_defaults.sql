-- Updates default model routing for accounts that already ran 20261017000001_init.sql
-- with its original seed values. Two fixes, both idempotent:
--
-- 1. text-embedding-004 has been retired by Google; gemini-embedding-001 is
--    its replacement (the app now requests it truncated to 768 dimensions,
--    matching chunks.embedding's vector(768) column).
-- 2. Pro-tier Gemini models require a billing-enabled Google Cloud project —
--    the free tier grants them zero quota. Defaulting to Flash tier means
--    generation works out of the box on a free API key; upgrade specific
--    task types to a Pro model any time from /admin/llm-settings once
--    billing is enabled — that's a config change, not a code change.
--
-- Only rows still holding the original seed values are touched, so this is
-- safe to run even if an admin has already customized llm_settings.

update llm_settings set model = 'gemini-flash-lite-latest'
  where task_type = 'ocr_extraction' and model = 'gemini-2.5-flash';

update llm_settings set model = 'gemini-embedding-001'
  where task_type = 'embedding' and model = 'text-embedding-004';

update llm_settings set model = 'gemini-flash-latest'
  where task_type in ('solution', 'notes', 'sample_paper') and model = 'gemini-2.5-pro';

update llm_settings set model = 'gemini-flash-lite-latest'
  where task_type in ('ad_hoc', 'coverage_check') and model = 'gemini-2.5-flash';
