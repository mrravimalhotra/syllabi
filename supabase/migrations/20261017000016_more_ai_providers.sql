-- Free AI services that speak OpenAI's API can serve any task from the admin
-- AI settings (and stand in when Gemini can't): Groq, OpenRouter, Mistral.
alter table llm_settings drop constraint if exists llm_settings_provider_check;
alter table llm_settings add constraint llm_settings_provider_check
  check (provider in ('google', 'anthropic', 'openai', 'groq', 'openrouter', 'mistral'));
