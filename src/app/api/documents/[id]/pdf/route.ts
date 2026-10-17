import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { findAnswer } from "@/lib/generation/answers";
import { renderGenerationPdf } from "@/lib/pdf/render";
import { loadSourceImages } from "@/lib/rag/retrieve";
import { getSignedUrl } from "@/lib/storage";
import type { MatchedChunk } from "@/types/database";

// Rendering a long answer with embedded page images can take a few seconds.
export const maxDuration = 60;

/**
 * The PDF of a saved answer, made on demand (so PDFs aren't stored for answers
 * nobody downloads). Older answers that were stored as PDFs are redirected to
 * their stored copy.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const answer = await findAnswer((await params).id, user);
  if (!answer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (answer.content === null) {
    if (!answer.storage_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.redirect(await getSignedUrl(answer.storage_path));
  }

  try {
    const sources = (answer.sources ?? []) as unknown as MatchedChunk[];
    const { byPath } = await loadSourceImages(sources);
    const pdf = await renderGenerationPdf({
      taskType: answer.task_type,
      title: answer.title,
      studentName: user.full_name ?? user.email,
      content: answer.content,
      sources,
      sourceImages: byPath,
      usedSearchGrounding: answer.used_search_grounding,
    });
    const fileName = answer.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "Syllabi answer";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[documents pdf]", err);
    return NextResponse.json({ error: "Couldn't make the PDF. Please try again." }, { status: 500 });
  }
}
