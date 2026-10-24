import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAnswer } from "@/lib/generation/answers";
import { withImageUrls } from "@/lib/generation/sources";
import { deletePrefix } from "@/lib/storage";
import { cleanText } from "@/lib/validate";

const GONE = "That answer no longer exists. Open My Documents to find it.";

type Params = { params: Promise<{ id: string }> };

/** One saved answer, with fresh links to its source page images. */
export async function GET(_request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const answer = await findAnswer((await params).id, user);
  if (!answer) return apiError(404, GONE);

  return NextResponse.json({
    answer: {
      id: answer.id,
      title: answer.title,
      taskType: answer.task_type,
      createdAt: answer.created_at,
      text: answer.content,
      sources: await withImageUrls(answer.sources ?? []),
      usedSearchGrounding: answer.used_search_grounding,
      searchSuggestionsHtml: answer.search_suggestions_html,
      pack: answer.pack ?? null,
      checks: answer.checks ?? [],
      confidence: answer.confidence ?? null,
      worked: answer.worked ?? null,
      pdfUrl: `/api/documents/${answer.id}/pdf`,
    },
  });
}

/** Renames a saved answer. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const answer = await findAnswer((await params).id, user);
  if (!answer) return apiError(404, GONE);

  const title = cleanText((await request.json().catch(() => null))?.title, 200);
  if (!title) return apiError(400, "Type a title for the answer. It can't be empty.");

  const admin = createAdminClient();
  const { error } = await admin.from("generated_documents").update({ title }).eq("id", answer.id);
  if (error) return errorResponse(error, "documents PATCH", "Couldn't rename this answer. Try again in a moment.");
  return NextResponse.json({ ok: true, title });
}

/** Deletes a saved answer (and its stored PDF, for older answers). */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const answer = await findAnswer((await params).id, user);
  if (!answer) return apiError(404, GONE);

  // The row goes first: if that fails, nothing is lost and the stored PDF is still there.
  const admin = createAdminClient();
  const { error } = await admin.from("generated_documents").delete().eq("id", answer.id);
  if (error) return errorResponse(error, "documents DELETE", "Couldn't delete this answer. Nothing was deleted. Try again in a moment.");
  if (answer.storage_path) {
    await deletePrefix(answer.storage_path).catch((err) => console.error("[documents DELETE] stored PDF", err));
  }
  return NextResponse.json({ ok: true });
}
