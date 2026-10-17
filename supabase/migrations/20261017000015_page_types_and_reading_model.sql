-- One upload is one book, even when its pages are of different kinds (a
-- chapter followed by its exercises): each page keeps its own kind, which
-- goes on its search chunks.
alter table page_jobs add column if not exists source_type text
  check (source_type in ('textbook', 'exercise', 'past_paper', 'notes'));

-- Reading book pages uses the lighter Flash model by default: a 15-page
-- chapter would otherwise spend much of the free daily allowance that answers
-- need. (Each Gemini model has its own allowance; a page the light model
-- declines is offered to the other.) Only the seed value is changed.
update llm_settings
set model = 'gemini-flash-lite-latest', updated_at = now()
where task_type = 'ocr_extraction'
  and provider = 'google'
  and model = 'gemini-flash-latest';
