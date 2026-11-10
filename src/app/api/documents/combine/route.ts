import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { savedAnswerResponse } from "@/lib/generation/handler";
import { isNoQuestions } from "@/lib/generation/solve-parts";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanText, isUuid } from "@/lib/validate";
import type { GeneratedDocumentRow } from "@/types/database";

const MAX_PARTS = 60;

/**
 * Puts the answers of "Solve all exercise questions", made one part at a time, together as one saved answer:
 * each part under its own heading, in order, with their sources and checks. The parts themselves are then removed
 * from My Documents (parts with no questions are simply dropped). Body: { title, parts: [{ id, label }] }.
 */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { title?: unknown; parts?: unknown } | null;
  const asked = (Array.isArray(body?.parts) ? body.parts : [])
    .map((p) => p as { id?: unknown; label?: unknown })
    .filter((p): p is { id: string; label: unknown } => typeof p.id === "string" && isUuid(p.id))
    .slice(0, MAX_PARTS)
    .map((p) => ({ id: p.id, label: cleanText(p.label, 200) ?? "Part" }));
  if (asked.length === 0) return apiError(400, "There is nothing to put together yet.");
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("generated_documents").select("*").eq("student_id", auth.account.id).in("id", asked.map((p) => p.id));
    if (error) throw error;
    const rows = new Map(((data ?? []) as GeneratedDocumentRow[]).map((r) => [r.id, r]));
    const parts = asked.flatMap((p) => (rows.has(p.id) ? [{ label: p.label, row: rows.get(p.id)! }] : []));
    const answered = parts.filter((p) => !isNoQuestions(p.row.content ?? ""));
    if (answered.length === 0) return apiError(400, "No questions were found on the pages of the chosen books.");

    const seen = new Set<string>();
    const sources = answered.flatMap((p) => p.row.sources ?? []).filter((s) => !seen.has(s.id) && Boolean(seen.add(s.id)));
    // The least sure part speaks for the whole answer.
    const confidence = answered.map((p) => p.row.confidence).filter((c) => c !== null).sort((a, b) => a.correct - b.correct)[0] ?? null;
    const { data: saved, error: saveError } = await admin
      .from("generated_documents")
      .insert({
        student_id: auth.account.id,
        task_type: "solution",
        title: cleanText(body?.title, 200) ?? "All exercise questions",
        content: answered.map((p) => `## ${p.label}\n\n${(p.row.content ?? "").trim()}`).join("\n\n---\n\n"),
        sources,
        used_search_grounding: answered.some((p) => p.row.used_search_grounding),
        search_suggestions_html: answered.map((p) => p.row.search_suggestions_html).find(Boolean) ?? null,
        checks: answered.flatMap((p) => (p.row.checks ?? []).map((c) => (c.ok ? c : { ...c, message: `${p.label}: ${c.message}` }))),
        confidence,
      })
      .select("*")
      .single();
    if (saveError) throw saveError;
    // Only once the whole answer is saved do its parts go.
    const { error: removeError } = await admin.from("generated_documents").delete().eq("student_id", auth.account.id).in("id", parts.map((p) => p.row.id));
    if (removeError) console.error("[combine] removing the parts", removeError.message);
    return NextResponse.json(await savedAnswerResponse(saved as GeneratedDocumentRow, false));
  } catch (err) {
    return errorResponse(err, "documents combine", "Couldn't put the answers together. They are each saved in My Documents. Try again in a moment.");
  }
}
