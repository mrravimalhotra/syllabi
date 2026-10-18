import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { levelLine } from "@/lib/generation/level";
import { getLlmSetting } from "@/lib/llm/config";
import { answerKey, findReusable } from "@/lib/generation/reuse";
import { QUESTIONS_SYSTEM, WALKTHROUGH_SYSTEM } from "@/lib/study-pack/prompts";
import { generateStudyPack } from "@/lib/study-pack/generate";
import { packToMarkdown } from "@/lib/study-pack/markdown";
import { parseStudyPackRequest } from "@/lib/study-pack/request";

// Two long AI calls (run together) for a whole chapter.
export const maxDuration = 300;

/** Makes and saves a study pack for one chapter: a book from My books, or attached pages. */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;

  const body = await request.json().catch(() => null);
  const parsed = parseStudyPackRequest(body, student.answer_language ?? "auto");
  if (!parsed.ok) return apiError(400, parsed.message);
  const { documentId, focus, language, photos, fresh } = parsed.value;

  try {
    // The same chapter, focus, language, class and model again reuses the saved pack.
    const { provider, model } = await getLlmSetting("study_pack");
    const cacheKey = answerKey({
      v: 1,
      kind: "study_pack",
      documentId: documentId ?? null,
      photos: documentId ? [] : photos.map((p) => p.data),
      focus: focus?.trim() ?? "",
      language,
      level: levelLine(student),
      provider,
      model,
      instructions: [WALKTHROUGH_SYSTEM, QUESTIONS_SYSTEM],
    });
    if (!fresh) {
      const saved = await findReusable(student.id, cacheKey);
      if (saved?.pack) {
        return NextResponse.json({
          id: saved.id,
          title: saved.title,
          pack: saved.pack,
          text: saved.content ?? "",
          pdfUrl: `/api/documents/${saved.id}/pdf`,
          reusedFrom: saved.created_at,
        });
      }
    }

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
        cache_key: cacheKey,
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
    return errorResponse(err, "generate study_pack", "Couldn't make the study pack. Wait a minute and try again. If it keeps happening, tell the person who runs Syllabi.");
  }
}
