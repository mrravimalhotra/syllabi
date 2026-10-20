import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { runGeneration } from "@/lib/generation/pipeline";
import { withImageUrls } from "@/lib/generation/sources";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationTaskType, SavedSource } from "@/types/database";
import { levelLine } from "@/lib/generation/level";
import { getLlmSetting } from "@/lib/llm/config";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import { answerKey, findReusable } from "@/lib/generation/reuse";
import { parseGenerationRequest, type GenerationRequest } from "@/lib/generation/request";
import type { GeneratedDocumentRow, Student } from "@/types/database";

const GENERATE_FAILED = "Couldn't make your answer. Wait a minute and try again. If it keeps happening, tell the person who runs Syllabi.";

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
    confidence: saved.confidence ?? null,
    reusedFrom: saved.created_at,
  };
}

/** A short one-line title for the saved answer. */
function titleFor(typedPrompt: string, hasAttachedText: boolean, taskType: GenerationTaskType): string {
  if (taskType === "paper_check") return "Paper check" + (typedPrompt ? `: ${typedPrompt.replace(/\s+/g, " ").slice(0, 60)}` : "");
  if (!typedPrompt) return hasAttachedText ? "Attached worksheet" : "Photo question";
  const oneLine = typedPrompt.replace(/\s+/g, " ");
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
}

/** Makes the answer, saves it (not a PDF: it can be reopened, printed, and turned into a PDF on demand, so a PDF problem can never lose it) and describes it for the screen. */
async function makeAndSaveAnswer(
  taskType: GenerationTaskType,
  student: Student,
  req: GenerationRequest,
  cacheKey: string,
  requestStart: number,
  onText?: (delta: string) => void,
  onRestart?: () => void
) {
  const result = await runGeneration({
    student,
    taskType,
    prompt: req.prompt,
    documentIds: req.documentIds,
    photos: req.photos,
    language: req.language,
    onText,
    onRestart,
  });
  const title = titleFor(req.typedPrompt, req.hasAttachedText, taskType);
  const savedSources: SavedSource[] = result.sources.map((s) => ({
    id: s.id,
    document_id: s.document_id,
    section_label: s.section_label,
    page_number: s.page_number,
    source_type: s.source_type,
    // When whole books were passed, only the pages whose pictures were sent keep their picture (a thumbnail for every page would be a wall).
    image_path: result.fullContext && s.image_path && !result.sourceImages.has(s.image_path) ? null : s.image_path,
    similarity: s.similarity,
    book: s.book,
  }));
  const savingStart = Date.now();
  const { data: doc, error } = await createAdminClient()
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
      confidence: result.confidence,
    })
    .select("id")
    .single();
  // The answer is still shown even if saving it failed.
  if (error) console.error("[generate] saving answer", error);
  const timings = { ...result.timings, totalMs: Date.now() - requestStart, savedMs: Date.now() - savingStart };
  console.log(`[generate:timing] ${JSON.stringify({ taskType, ...timings, answerChars: result.text.length })}`);

  return {
    id: doc?.id ?? null,
    title,
    text: result.text,
    // The same source images the PDF embeds, so a diagram or map is visible before the PDF is even opened.
    sources: await withImageUrls(savedSources),
    usedSearchGrounding: result.usedSearchGrounding,
    searchSuggestionsHtml: result.searchSuggestionsHtml ?? null,
    checks: result.checks,
    confidence: result.confidence,
    timings,
    // Made on demand from the saved answer (null if saving failed).
    pdfUrl: doc ? `/api/documents/${doc.id}/pdf` : null,
  };
}

/**
 * Streaming: the first draft is sent piece by piece as it is written (one JSON
 * object per line), then a final "done" line with the checked answer. Errors
 * after this point arrive as an "error" line.
 */
function streamAnswer(
  taskType: GenerationTaskType,
  produce: (onText: (delta: string) => void, onRestart: () => void) => Promise<unknown>
): Response {
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

    const parsed = parseGenerationRequest(await request.json().catch(() => null), taskType, student.answer_language ?? "auto");
    if (!parsed.ok) return apiError(400, parsed.message);
    const req = parsed.value;

    try {
      // The same question again (same attachments, books, language, class, model and instructions) gets its saved answer back:
      // instant, identical, and no AI used. "Make a new answer" sends fresh: true.
      const { provider, model } = await getLlmSetting(taskType);
      const cacheKey = answerKey({
        v: 1,
        taskType,
        prompt: req.prompt,
        photos: req.photos.map((p) => p.data),
        documentIds: [...(req.documentIds ?? [])].sort(),
        language: req.language,
        provider,
        model,
        instructions: systemInstructionsFor(taskType, levelLine(student), req.language),
      });
      if (!req.fresh) {
        const saved = await findReusable(student.id, cacheKey);
        if (saved) return NextResponse.json(await savedAnswerResponse(saved));
      }

      const produce = (onText?: (delta: string) => void, onRestart?: () => void) =>
        makeAndSaveAnswer(taskType, student, req, cacheKey, requestStart, onText, onRestart);
      return req.stream ? streamAnswer(taskType, produce) : NextResponse.json(await produce());
    } catch (err) {
      return errorResponse(err, `generate ${taskType}`, GENERATE_FAILED);
    }
  };
}
