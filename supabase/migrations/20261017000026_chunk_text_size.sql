-- How much book text a set of books holds, so the app can pass the books to the AI whole when they fit
-- (instead of only the closest passages). Server only.
create or replace function chunk_text_size(p_owner_id uuid, p_document_ids uuid[] default null)
returns table (chars bigint, chunks bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(char_length(content)), 0)::bigint, count(*)::bigint
    from chunks
   where owner_id = p_owner_id
     and (p_document_ids is null or document_id = any(p_document_ids))
$$;
revoke execute on function chunk_text_size(uuid, uuid[]) from public, anon, authenticated;
grant execute on function chunk_text_size(uuid, uuid[]) to service_role;
