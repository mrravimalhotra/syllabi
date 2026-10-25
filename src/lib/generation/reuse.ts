import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedDocumentRow } from "@/types/database";

export { answerKey } from "@/lib/generation/answer-key";

// Saved answers older than this are made afresh (books and models move on).
const REUSE_DAYS = 7;

/**
 * The newest saved answer with this fingerprint, if recent enough to reuse and
 * made after the books it could draw on were last read. `books` is the chosen
 * books (an empty list means all the account's books); null when no book is used.
 */
export async function findReusable(studentId: string, cacheKey: string, books: string[] | null): Promise<GeneratedDocumentRow | null> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - REUSE_DAYS * 86_400_000).toISOString();
  const { data } = await admin
    .from("generated_documents")
    .select("*")
    .eq("student_id", studentId)
    .eq("cache_key", cacheKey)
    .gte("created_at", since)
    .not("content", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const saved = (data as GeneratedDocumentRow | null) ?? null;
  if (!saved || books === null) return saved;

  // A page read (or re-read) since the answer was made replaces its passages with newer ones: make the answer afresh.
  let newer = admin.from("chunks").select("id").eq("owner_id", studentId).gt("created_at", saved.created_at);
  if (books.length) newer = newer.in("document_id", books);
  const { data: changed, error } = await newer.limit(1);
  return error || changed?.length ? null : saved;
}
