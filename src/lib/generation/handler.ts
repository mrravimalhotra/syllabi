import { notifyOwner, type Notification } from "@/lib/push";
import { NextResponse, after } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { runGeneration, type GenerationInput } from "@/lib/generation/pipeline";
import { withImageUrls } from "@/lib/generation/sources";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationTaskType, SavedSource } from "@/types/database";
import { levelLine } from "@/lib/generation/level";
import { getLlmSetting } from "@/lib/llm/config";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import { answerKey, findReusable } from "@/lib/generation/reuse";
import { parseGenerationRequest, type GenerationRequest } from "@/lib/generation/request";
import { parseFollowUps } from "@/lib/generation/follow-up";
import { startRunLog, type RunLog } from "@/lib/generation/run-log";
import type { GeneratedDocumentRow, Student } from "@/types/database";

/** How a streamed answer reports its progress: draft pieces, a restart, and the checking stages. */
type StreamHooks = Pick<GenerationInput, "onText" | "onRestart" | "onStage">;

const GENERATE_FAILED = "Couldn't make your answer. Wait a minute and try again. If it keeps happening, tell the person who runs Syllabi.";

/** A saved answer, returned as if just generated; marked as reused (no AI call) unless `reused` is false. */
export async function savedAnswerResponse(saved: GeneratedDocumentRow, reused = true) {
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
    followUps: parseFollowUps(saved.follow_ups),
    ...(reused ? { reusedFrom: saved.created_at } : {}),
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
  run: RunLog,
  hooks: StreamHooks = {}
) {
  const { onText } = hooks;
  let wrote = false;
  const result = await runGeneration({
    student,
    taskType,
    prompt: req.prompt,
    askedFor: req.askedFor,
    documentIds: req.documentIds,
    photos: req.photos,
    language: req.language,
    // Each step is also written to the request's progress record.
    onText:
      onText &&
      ((delta) => {
        if (!wrote) run.stage("first words");
        wrote = true;
        onText(delta);
      }),
    onRestart: () => {
      run.stage("started again (model busy)");
      hooks.onRestart?.();
    },
    onStage: (stage) => {
      run.stage(stage);
      hooks.onStage?.(stage);
    },
    onProgress: (stage, details) => run.stage(stage, details),
  });
  run.stage("saving");
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
  run.finish("answered", { documentId: doc?.id ?? null, timings });
  // A paper takes minutes to mark, and the phone is often in another app meanwhile: say when it is ready.
  if (taskType === "paper_check") await notifyOwner(student.id, paperMarked(result.text, doc?.id ?? null));

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

const errorText = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

/** The progress record's id goes with every reply, so the screen can show it with an error. */
function withRunId(response: Response, run: RunLog): Response {
  response.headers.set("X-Run-Id", run.id);
  return response;
}

/**
 * Streaming: the first draft is sent piece by piece as it is written (one JSON
 * object per line), then a final "done" line with the checked answer. Errors
 * after this point arrive as an "error" line.
 */
function streamAnswer(taskType: GenerationTaskType, run: RunLog, produce: (hooks: StreamHooks) => Promise<unknown>): Response {
  return streamWork(run, `generate ${taskType}`, GENERATE_FAILED, produce);
}

/** How often a line is sent while nothing else is, so a phone network doesn't drop a connection that looks idle. */
const PING_MS = 10_000;

/**
 * Runs `produce` and streams what it reports, one JSON object per line: draft text, stages, a "ping" while it is
 * quiet, then "done" with the answer or "error". If the reader goes away (a dropped connection, a locked phone) the
 * work carries on to the end and is saved, and the reader can ask how it went (api/generate/runs/[id]).
 */
export function streamWork(run: RunLog, context: string, failedMessage: string, produce: (hooks: StreamHooks) => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (line: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // The reader has gone: keep working, stop sending.
          open = false;
        }
      };
      const ping = setInterval(() => send({ type: "ping" }), PING_MS);
      const job = (async () => {
        try {
          const payload = await produce({
            onText: (delta) => send({ type: "text", delta }),
            onRestart: () => send({ type: "reset" }),
            onStage: (stage) => send({ type: "stage", stage }),
          });
          send({ type: "done", answer: payload });
        } catch (err) {
          run.finish("failed", { error: errorText(err) });
          const failure = errorResponse(err, context, failedMessage);
          send({ type: "error", status: failure.status, ...(await failure.json()) });
        } finally {
          clearInterval(ping);
          try {
            controller.close();
          } catch {
            // Already closed by the reader going away.
          }
        }
      })();
      // The server stays up until the work is done, whether or not anyone is still reading.
      try {
        after(() => job);
      } catch {
        // Outside a request (tests): the work simply runs on.
      }
    },
  });
  const response = new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
  response.headers.set("X-Run-Id", run.id);
  return response;
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
    // Sizes only: no question text goes into the progress record.
    const run = startRunLog(student.id, taskType, {
      promptChars: req.prompt.length,
      photos: req.photos.length,
      books: req.documentIds?.length ?? "all",
      language: req.language,
      streamed: Boolean(req.stream),
      fresh: Boolean(req.fresh),
    });

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
        const saved = await findReusable(student.id, cacheKey, req.documentIds ?? []);
        if (saved) {
          run.finish("reused", { documentId: saved.id });
          return withRunId(NextResponse.json(await savedAnswerResponse(saved)), run);
        }
      }

      const produce = (hooks?: StreamHooks) => makeAndSaveAnswer(taskType, student, req, cacheKey, requestStart, run, hooks);
      return withRunId(req.stream ? streamAnswer(taskType, run, produce) : NextResponse.json(await produce()), run);
    } catch (err) {
      run.finish("failed", { error: errorText(err) });
      return withRunId(errorResponse(err, `generate ${taskType}`, GENERATE_FAILED), run);
    }
  };
}

/** "Your paper is marked: 48 / 50 (96%), grade A+": opens the marked paper. */
function paperMarked(report: string, documentId: string | null): Notification {
  const total = /Total:\s*([^*\n]+?)\s*(?:\*\*|$)/m.exec(report)?.[1]?.trim();
  return {
    title: "Your paper is marked",
    body: total ? `${total.replace(/\s*·\s*Grade:\s*/, ", grade ")}. Tap to see the marks.` : "Tap to see the marks.",
    url: documentId ? `/dashboard/documents/${documentId}` : "/dashboard?tool=paper_check",
    tag: "paper-marked",
  };
}
