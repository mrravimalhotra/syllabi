import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAnswer } from "@/lib/generation/answers";
import { withImageUrls } from "@/lib/generation/sources";
import { deletePrefix } from "@/lib/storage";
import { userMessage } from "@/lib/errors";
import { cleanText } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

/** One saved answer, with fresh links to its source page images. */
export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const answer = await findAnswer((await params).id, user);
  if (!answer) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
      worked: answer.worked ?? null,
      pdfUrl: `/api/documents/${answer.id}/pdf`,
    },
  });
}

/** Renames a saved answer. */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const answer = await findAnswer((await params).id, user);
  if (!answer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const title = cleanText((await request.json().catch(() => null))?.title, 200);
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("generated_documents").update({ title }).eq("id", answer.id);
  if (error) return NextResponse.json({ error: userMessage(error, "documents PATCH") }, { status: 500 });
  return NextResponse.json({ ok: true, title });
}

/** Deletes a saved answer (and its stored PDF, for older answers). */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const answer = await findAnswer((await params).id, user);
  if (!answer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (answer.storage_path) {
    await deletePrefix(answer.storage_path).catch((err) => console.error("[documents DELETE] stored PDF", err));
  }
  const admin = createAdminClient();
  const { error } = await admin.from("generated_documents").delete().eq("id", answer.id);
  if (error) return NextResponse.json({ error: userMessage(error, "documents DELETE") }, { status: 500 });
  return NextResponse.json({ ok: true });
}
