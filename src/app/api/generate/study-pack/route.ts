import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuotaExceededError } from "@/lib/quota";
import { userMessage } from "@/lib/errors";
import { isUuid } from "@/lib/validate";
import { isAnswerLanguage } from "@/lib/generation/language";
import { generateStudyPack } from "@/lib/study-pack/generate";
import { packToMarkdown } from "@/lib/study-pack/markdown";
import type { CompletionImage } from "@/lib/llm/types";

// Two long AI calls (run together) for a whole chapter.
export const maxDuration = 300;

const MAX_PHOTOS = 12;
const MAX_PHOTO_BASE64_CHARS = 3_000_000;
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Makes and saves a study pack for one chapter: a book from My books, or attached pages. */
export async function POST(request: Request) {
  const student = await getCurrentStudent();
  if (!student || !student.active) {
    return NextResponse.json({ error: "Your session has ended. Please sign in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const documentId = typeof body?.documentId === "string" && isUuid(body.documentId) ? body.documentId : undefined;
  const focus = typeof body?.focus === "string" ? body.focus : undefined;
  const language = isAnswerLanguage(body?.language) ? body.language : (student.answer_language ?? "auto");

  const photos: CompletionImage[] = [];
  if (Array.isArray(body?.photos)) {
    if (body.photos.length > MAX_PHOTOS) {
      return NextResponse.json({ error: `Attach at most ${MAX_PHOTOS} pages, or add the chapter to My books.` }, { status: 400 });
    }
    let chars = 0;
    for (const p of body.photos) {
      if (typeof p?.data !== "string" || !PHOTO_MIME_TYPES.has(p?.mimeType)) {
        return NextResponse.json({ error: "Each page must be a JPEG, PNG or WebP image" }, { status: 400 });
      }
      chars += p.data.length;
      photos.push({ data: p.data, mimeType: p.mimeType });
    }
    if (chars > MAX_PHOTO_BASE64_CHARS) {
      return NextResponse.json({ error: "Those pages are too large together. Add the chapter to My books instead." }, { status: 400 });
    }
  }
  if (!documentId && photos.length === 0) {
    return NextResponse.json({ error: "Choose a book from My books, or attach the chapter's pages." }, { status: 400 });
  }

  try {
    const pack = await generateStudyPack({ student, documentId, photos: documentId ? undefined : photos, focus, language });
    const content = packToMarkdown(pack);
    const admin = createAdminClient();
    const { data: doc, error } = await admin
      .from("generated_documents")
      .insert({
        student_id: student.id,
        task_type: "study_pack",
        title: `Study pack: ${pack.title}`.slice(0, 200),
        content,
        pack,
        sources: [],
      })
      .select("id, title")
      .single();
    if (error) console.error("[study-pack] saving", error);

    return NextResponse.json({
      id: doc?.id ?? null,
      title: doc?.title ?? `Study pack: ${pack.title}`,
      pack,
      text: content,
      pdfUrl: doc ? `/api/documents/${doc.id}/pdf` : null,
    });
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: "Monthly token quota exceeded. Contact an admin to raise your limit.", quota: err.status },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: userMessage(err, "generate study_pack", "Couldn't make the study pack right now. Please try again in a minute.") },
      { status: 500 }
    );
  }
}
