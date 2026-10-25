-- Follow-up questions on a saved answer ("explain step 3 again"), kept with it so they are there
-- when the answer is opened again. Each is {question, answer, createdAt}.
alter table generated_documents add column if not exists follow_ups jsonb not null default '[]'::jsonb;

-- Adds one follow-up in one step (two asked at once both stay), up to p_max per answer.
-- Returns the new number of follow-ups, or null when the answer is gone or already has p_max.
create or replace function add_follow_up(p_id uuid, p_item jsonb, p_max int)
returns int
language sql
security definer
set search_path = public
as $$
  update generated_documents
     set follow_ups = follow_ups || jsonb_build_array(p_item)
   where id = p_id and jsonb_array_length(follow_ups) < p_max
  returning jsonb_array_length(follow_ups)
$$;
revoke execute on function add_follow_up(uuid, jsonb, int) from public, anon, authenticated;
grant execute on function add_follow_up(uuid, jsonb, int) to service_role;
