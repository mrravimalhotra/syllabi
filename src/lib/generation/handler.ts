import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { MAX_PROMPT_CHARS, parseAttachedText, parsePhotos } from "@/lib/generation/attachments";
import { runGeneration } from "@/lib/generation/pipeline";
import { withImageUrls } from "@/lib/generation/sources";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationTaskType, SavedSource } from "@/types/database";
import { isUuid } from "@/lib/validate";
import { isAnswerLanguage } from "@/lib/generation/language";
import { levelLine } from "@/lib/generation/level";
import { getLlmSetting } from "@/lib/llm/config";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import { answerKey, findReusable } from "@/lib/generation/reuse";
import type { GeneratedDocumentRow } from "@/types/database";

const GENERATE_FAILED = "Couldn't make your answer. Wait a minute and try again. If it keeps happening, tell the person who runs Syllabi.";

const DEFAULT_PHOTO_PROMPT: Record<GenerationTaskType, string> = {
  solution: "Solve the question(s) in the attached photo or file step by step.",
  notes: "Make revision notes on the topic shown in the attached photo or file.",
  sample_paper: "Make a sample paper on the topic shown in the attached photo or file.",
  ad_hoc: "Explain what is shown in the attached photo or file.",
  study_pack: "Make a study pack for the chapter in the attached photos or file.",
};

/** A saved answer, returned as if just generated, marked as reused (no AI call). */
async function savedAnswerResponse(saved: GeneratedDocumentRow) {
  return {
    id: saved.id,
    title: saved.title,
    text: saved.content ?? "",
    sources: await withImageUrls(saved.sources ?? []),
    usedSearchGrounding: saved.used_search_grounding,
    searchSuggestionsHtml: saved.search_suggestions_html,
    pdfUrl: `/api/documents/${saved.id}/pdf`,
    checks: saved.checks ?? [],
    reusedFrom: saved.created_at,
  };
}

/** A short one-line title for the saved answer. */
function titleFor(typedPrompt: string, hasAttachedText: boolean): string {
  if (!typedPrompt) return hasAttachedText ? "Attached worksheet" : "Photo question";
  const oneLine = typedPrompt.replace(/\s+/g, " ");
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
}

/**
 * Builds a POST handler for one of the four generation routes — same pipeline,
 * different task type. Routes export `maxDuration` too: a whole worksheet can
 * take well over a minute.
 */
export function createGenerationRoute(taskType: GenerationTaskType) {
  return async function POST(request: Request) {
    const requestStart = Date.now();
    const auth = await authenticate();
    if ("response" in auth) return auth.response;
    const student = auth.account;

    // A body that can't be read is almost always one that was too big or cut off.
    const body = await request.json().catch(() => null);
    if (body === null) {
      return apiError(
        400,
        "Your question couldn't be read. It may be too large (try fewer or smaller attachments) or the connection dropped. Try again."
      );
    }
    const typedPrompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : "";

    const photos = parsePhotos(body?.photos);
    if (typeof photos === "string") return apiError(400, photos);
    const attachedText = parseAttachedText(body?.attachedText);
    if (!typedPrompt && photos.length === 0 && !attachedText) {
      return apiError(400, "Type a question, or attach a photo, PDF or Word file, then press Generate.");
    }
    const ask = typedPrompt || DEFAULT_PHOTO_PROMPT[taskType];
    // The attached file's text (e.g. a worksheet's questions) travels with the
    // request, so each question in it is also searched for separately.
    const prompt = attachedText ? `${ask}\n\n---\n${attachedText}` : ask;

    // Optional: which of the user's own books to search. Retrieval is always
    // limited to the caller's library, so ids of other users' books match nothing.
    const documentIds = Array.isArray(body?.documentIds) ? body.documentIds.filter(isUuid).slice(0, 200) : undefined;

    try {
      const language = isAnswerLanguage(body?.language) ? body.language : (student.answer_language ?? "auto");

      // The same question again (same attachments, books, language, class,
      // model and instructions) gets its saved answer back: instant, identical,
      // and no AI used. "Make a new answer" sends fresh: true.
      const level = levelLine(student);
      const { provider, model } = await getLlmSetting(taskType);
      const cacheKey = answerKey({
        v: 1,
        taskType,
        prompt,
        photos: photos.map((p) => p.data),
        documentIds: [...(documentIds ?? [])].sort(),
        language,
        provider,
        model,
        instructions: systemInstructionsFor(taskType, level, language),
      });
      if (body?.fresh !== true) {
        const saved = await findReusable(student.id, cacheKey);
        if (saved) return NextResponse.json(await savedAnswerResponse(saved));
      }

      // Everything after the cache check: make the answer, save it, describe it.
      const produce = async (onText?: (delta: string) => void, onRestart?: () => void) => {
        const result = await runGeneration({ student, taskType, prompt, documentIds, photos, language, onText, onRestart });
        const title = titleFor(typedPrompt, Boolean(attachedText));

        // Save the answer itself (not a PDF): it can be reopened, printed, and
        // turned into a PDF on demand, and a PDF problem can never lose it.
        const savedSources: SavedSource[] = result.sources.map((s) => ({
          id: s.id,
          document_id: s.document_id,
          section_label: s.section_label,
          page_number: s.page_number,
          source_type: s.source_type,
          image_path: s.image_path,
          similarity: s.similarity,
        }));
        const savingStart = Date.now();
        const admin = createAdminClient();
        const { data: doc, error } = await admin
          .from("generated_documents")
          .insert({
            student_id: student.id,
            task_type: taskType,
            title,
            content: result.text,
            sources: savedSources,
            used_search_grounding: result.usedSearchGrounding,
            search_suggestions_html: result.searchSuggestionsHtml ?? null,
            cache_key: cacheKey,
            checks: result.checks,
          })
          .select("id")
          .single();
        // The answer is still shown even if saving it failed.
        if (error) console.error("[generate] saving answer", error);
        const timings = { ...result.timings, totalMs: Date.now() - requestStart, savedMs: Date.now() - savingStart };
        console.log(`[generate:timing] ${JSON.stringify({ taskType, ...timings, answerChars: result.text.length })}`);

        // Give the on-screen result the same source images the PDF embeds, so a
        // diagram/map is visible before the PDF is even opened.
        const sources = await withImageUrls(savedSources);

        return {
          id: doc?.id ?? null,
          title,
          text: result.text,
          sources,
          usedSearchGrounding: result.usedSearchGrounding,
          searchSuggestionsHtml: result.searchSuggestionsHtml ?? null,
          checks: result.checks,
          timings,
          // Made on demand from the saved answer (null if saving failed).
          pdfUrl: doc ? `/api/documents/${doc.id}/pdf` : null,
        };
      };

      // Streaming: the first draft is sent piece by piece as it is written (one
      // JSON object per line), then a final "done" line with the checked answer.
      // Errors after this point arrive as an "error" line.
      if (body?.stream === true) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (line: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
            try {
              const payload = await produce(
                (delta) => send({ type: "text", delta }),
                () => send({ type: "reset" })
              );
              send({ type: "done", answer: payload });
            } catch (err) {
              const failure = errorResponse(err, `generate ${taskType}`, GENERATE_FAILED);
              send({ type: "error", status: failure.status, ...(await failure.json()) });
            }
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
        });
      }

      return NextResponse.json(await produce());
    } catch (err) {
      return errorResponse(err, `generate ${taskType}`, GENERATE_FAILED);
    }
  };
}
