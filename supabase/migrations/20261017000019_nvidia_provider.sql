-- NVIDIA's free API catalogue (build.nvidia.com) speaks OpenAI's API too: it can
-- stand in when Gemini can't answer, and can be chosen per task in Admin.
alter table llm_settings drop constraint if exists llm_settings_provider_check;
alter table llm_settings add constraint llm_settings_provider_check
  check (provider in ('google', 'anthropic', 'openai', 'groq', 'openrouter', 'mistral', 'nvidia'));
