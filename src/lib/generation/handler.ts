import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { runGeneration } from "@/lib/generation/pipeline";
import { withImageUrls } from "@/lib/generation/sources";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuotaExceededError } from "@/lib/quota";
import type { CompletionImage } from "@/lib/llm/types";
import type { GenerationTaskType, SavedSource } from "@/types/database";
import { userMessage } from "@/lib/errors";
import { isUuid } from "@/lib/validate";
import { isAnswerLanguage } from "@/lib/generation/language";
import { levelLine } from "@/lib/generation/level";
import { getLlmSetting } from "@/lib/llm/config";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import { answerKey, findReusable } from "@/lib/generation/reuse";
import type { GeneratedDocumentRow } from "@/types/database";

const MAX_PHOTOS = 12;
// Text of attached Word files, sent with the question.
const MAX_ATTACHED_TEXT_CHARS = 20_000;
// Base64 characters per request across all photos — keeps the body well under
// Vercel's ~4.5 MB request limit. The browser downscales photos before sending.
const MAX_PHOTO_BASE64_CHARS = 3_000_000;
const MAX_PROMPT_CHARS = 8_000;
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DEFAULT_PHOTO_PROMPT: Record<GenerationTaskType, string> = {
  solution: "Solve the question(s) in the attached photo or file step by step.",
  notes: "Make revision notes on the topic shown in the attached photo or file.",
  sample_paper: "Make a sample paper on the topic shown in the attached photo or file.",
  ad_hoc: "Explain what is shown in the attached photo or file.",
  study_pack: "Make a study pack for the chapter in the attached photos or file.",
};

/** Validates the optional `photos` field; returns the photos or an error message. */
function parsePhotos(raw: unknown): CompletionImage[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "photos must be a list";
  if (raw.length > MAX_PHOTOS) return `Attach at most ${MAX_PHOTOS} photos or pages`;

  let totalChars = 0;
  const photos: CompletionImage[] = [];
  for (const p of raw) {
    if (typeof p?.data !== "string" || typeof p?.mimeType !== "string" || !PHOTO_MIME_TYPES.has(p.mimeType)) {
      return "Each photo must be a JPEG, PNG or WebP image";
    }
    totalChars += p.data.length;
    const text = typeof p.text === "string" && p.text.trim() ? p.text.slice(0, MAX_ATTACHED_TEXT_CHARS) : undefined;
    photos.push({ data: p.data, mimeType: p.mimeType, ...(text ? { text } : {}) });
  }
  if (totalChars > MAX_PHOTO_BASE64_CHARS) return "Photos are too large — attach fewer or smaller photos";
  return photos;
}

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
    const student = await getCurrentStudent();
    if (!student || !student.active) {
      return NextResponse.json({ error: "Your session has ended. Please sign in again." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const typedPrompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : "";

    const photos = parsePhotos(body?.photos);
    if (typeof photos === "string") {
      return NextResponse.json({ error: photos }, { status: 400 });
    }
    const attachedText =
      typeof body?.attachedText === "string" ? body.attachedText.trim().slice(0, MAX_ATTACHED_TEXT_CHARS) : "";
    if (!typedPrompt && photos.length === 0 && !attachedText) {
      return NextResponse.json({ error: "Type a question or attach a photo or file" }, { status: 400 });
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

      const result = await runGeneration({ student, taskType, prompt, documentIds, photos, language });
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

      // Give the on-screen result the same source images the PDF embeds, so a
      // diagram/map is visible before the PDF is even opened.
      const sources = await withImageUrls(savedSources);

      return NextResponse.json({
        id: doc?.id ?? null,
        title,
        text: result.text,
        sources,
        usedSearchGrounding: result.usedSearchGrounding,
        searchSuggestionsHtml: result.searchSuggestionsHtml ?? null,
        checks: result.checks,
        // Made on demand from the saved answer (null if saving failed).
        pdfUrl: doc ? `/api/documents/${doc.id}/pdf` : null,
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return NextResponse.json(
          { error: "Monthly token quota exceeded. Contact an admin to raise your limit.", quota: err.status },
          { status: 429 }
        );
      }
      const message = userMessage(
        err,
        `generate ${taskType}`,
        "Couldn't generate an answer right now. Please try again in a minute."
      );
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
