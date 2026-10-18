import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError, authenticate } from "@/lib/api";
import { findAnswer } from "@/lib/generation/answers";
import { pdfDisposition } from "@/lib/pdf/disposition";
import { renderGenerationPdf } from "@/lib/pdf/render";
import { loadSourceImages } from "@/lib/rag/retrieve";
import { getSignedUrl } from "@/lib/storage";
import { withoutAnswerKey } from "@/lib/format";
import type { MatchedChunk } from "@/types/database";

// Rendering a long answer with embedded page images can take a few seconds.
export const maxDuration = 60;

// The last few PDFs made by this server instance, so pressing Print or
// Download again (or on a second device) skips the slow drawing step.
const RECENT_LIMIT = 8;
const recent = new Map<string, Uint8Array>();

function remember(key: string, pdf: Uint8Array) {
  recent.delete(key);
  recent.set(key, pdf);
  if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value!);
}

/**
 * The PDF of a saved answer, made on demand (so PDFs aren't stored for answers
 * nobody downloads). Older answers that were stored as PDFs are redirected to
 * their stored copy.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const answer = await findAnswer((await params).id, user);
  if (!answer) return apiError(404, "That answer no longer exists. Open My Documents to find it.");

  if (answer.content === null) {
    if (!answer.storage_path) return apiError(404, "This older answer has no saved file. Ask the question again.");
    try {
      return NextResponse.redirect(await getSignedUrl(answer.storage_path));
    } catch (err) {
      console.error("[documents pdf] stored copy", err);
      return apiError(500, "Couldn't open the saved PDF. Please try again.");
    }
  }

  // ?part=questions: a sample paper without its answer key, for the child to attempt.
  const questionsOnly = new URL(request.url).searchParams.get("part") === "questions";

  // The same answer always gives the same PDF, so the browser can reuse its copy
  // (a rename or edit changes the tag). It must still ask first: the answer is private.
  const etag = `"${createHash("sha256")
    .update(JSON.stringify([answer.id, answer.title, answer.content, answer.sources, user.full_name, user.email, questionsOnly]))
    .digest("hex")
    .slice(0, 32)}"`;
  const baseHeaders = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: baseHeaders });

  try {
    let pdf = recent.get(etag);
    if (!pdf) {
      const sources = (answer.sources ?? []) as unknown as MatchedChunk[];
      const { byPath } = await loadSourceImages(sources);
      pdf = await renderGenerationPdf({
        taskType: answer.task_type,
        title: answer.title,
        preparedBy: user.full_name ?? user.email,
        content: questionsOnly ? withoutAnswerKey(answer.content) : answer.content,
        sources: questionsOnly ? [] : sources,
        sourceImages: byPath,
        usedSearchGrounding: answer.used_search_grounding,
      });
      remember(etag, pdf);
    }
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        ...baseHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfDisposition(questionsOnly ? `${answer.title} (questions)` : answer.title),
      },
    });
  } catch (err) {
    console.error("[documents pdf]", err);
    return apiError(500, "Couldn't make the PDF. Please try again in a moment.");
  }
}
