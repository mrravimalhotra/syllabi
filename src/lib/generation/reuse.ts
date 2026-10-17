import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedDocumentRow } from "@/types/database";

export { answerKey } from "@/lib/generation/answer-key";

// Saved answers older than this are made afresh (books and models move on).
const REUSE_DAYS = 60;

/** The newest saved answer with this fingerprint, if recent enough to reuse. */
export async function findReusable(studentId: string, cacheKey: string): Promise<GeneratedDocumentRow | null> {
  const since = new Date(Date.now() - REUSE_DAYS * 86_400_000).toISOString();
  const { data } = await createAdminClient()
    .from("generated_documents")
    .select("*")
    .eq("student_id", studentId)
    .eq("cache_key", cacheKey)
    .gte("created_at", since)
    .not("content", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as GeneratedDocumentRow | null) ?? null;
}
