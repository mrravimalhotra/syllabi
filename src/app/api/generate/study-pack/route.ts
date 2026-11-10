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
import { startRunLog } from "@/lib/generation/run-log";
import { streamWork } from "@/lib/generation/handler";

const PACK_FAILED = "Couldn't make the study pack. Wait a minute and try again. If it keeps happening, tell the person who runs Syllabi.";
import type { StudyPack } from "@/lib/study-pack/types";

// Two long AI calls (run together) for a whole chapter.
export const maxDuration = 300;

/** Saves a new study pack (the answer itself, not a PDF) and describes it for the screen. It is still shown if saving fails. */
async function saveStudyPack(studentId: string, pack: StudyPack, cacheKey: string) {
  const content = packToMarkdown(pack);
  const { data: doc, error } = await createAdminClient()
    .from("generated_documents")
    .insert({
      student_id: studentId,
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
  return {
    id: doc?.id ?? null,
    title: doc?.title ?? `Study pack: ${pack.title}`,
    pack,
    text: content,
    pdfUrl: doc ? `/api/documents/${doc.id}/pdf` : null,
  };
}

/** Makes and saves a study pack for one chapter: a book from My books, or attached pages. */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;

  const body = await request.json().catch(() => null);
  const parsed = parseStudyPackRequest(body, student.answer_language ?? "auto");
  if (!parsed.ok) return apiError(400, parsed.message);
  const { documentId, focus, language, photos, fresh } = parsed.value;
  // The request's progress record (sizes only); its id goes with the reply so the screen can show it with an error.
  const run = startRunLog(student.id, "study_pack", { book: Boolean(documentId), photos: photos.length, focusChars: focus?.trim().length ?? 0, language, fresh: Boolean(fresh) });
  const reply = (response: NextResponse) => {
    response.headers.set("X-Run-Id", run.id);
    return response;
  };

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
      const saved = await findReusable(student.id, cacheKey, documentId ? [documentId] : null);
      if (saved?.pack) {
        run.finish("reused", { documentId: saved.id });
        return reply(NextResponse.json({
          id: saved.id,
          title: saved.title,
          pack: saved.pack,
          text: saved.content ?? "",
          pdfUrl: `/api/documents/${saved.id}/pdf`,
          reusedFrom: saved.created_at,
        }));
      }
    }

    const make = async () => {
      run.stage("writing");
      const pack = await generateStudyPack({ student, documentId, photos: documentId ? undefined : photos, focus, language, onProgress: (stage, details) => run.stage(stage, details) });
      run.stage("saving");
      const saved = await saveStudyPack(student.id, pack, cacheKey);
      run.finish("answered", { documentId: saved.id ?? null });
      return saved;
    };
    // Streamed, the connection is kept alive while the pack is written, and the pack is saved even if the reader goes away.
    if ((body as { stream?: unknown }).stream === true) return streamWork(run, "generate study_pack", PACK_FAILED, make);
    return reply(NextResponse.json(await make()));
  } catch (err) {
    run.finish("failed", { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    return reply(errorResponse(err, "generate study_pack", PACK_FAILED));
  }
}
