import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { retrieveContext, formatContext, loadSourceImages } from "@/lib/rag/retrieve";
import { checkQuota, QuotaExceededError } from "@/lib/quota";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import { levelLine } from "@/lib/generation/level";
import type { AnswerLanguage } from "@/lib/generation/language";
import type { CompletionImage } from "@/lib/llm/types";
import type { GenerationTaskType, MatchedChunk, Student } from "@/types/database";

export interface GenerationInput {
  student: Student;
  taskType: GenerationTaskType;
  prompt: string;
  /** Search only these of the user's own books; all of their books when omitted. */
  documentIds?: string[];
  /**
   * Photos the user attached to this request (e.g. a homework page). They go
   * straight to the model alongside the question — the same way Claude and
   * Gemini chat apps read uploaded photos — and their transcribed text is also
   * used to search the knowledge base.
   */
  photos?: CompletionImage[];
  /** Language to answer in; "auto" follows the book and question. */
  language?: AnswerLanguage;
}

export interface GenerationOutput {
  text: string;
  sources: MatchedChunk[];
  /** Source image_path → loaded image, so the PDF renderer can attach the right figure to the right citation. */
  sourceImages: Map<string, CompletionImage>;
  usedSearchGrounding: boolean;
  /** Google's Search Suggestions HTML when the answer used web search (must be shown with it). */
  searchSuggestionsHtml?: string;
}

/**
 * Shared generation pipeline: quota check → RAG retrieval → LLM call → usage
 * recording. Every generation route (solutions, notes, sample papers, ad-hoc)
 * calls this same function, differing only in taskType (which selects the
 * system prompt and, via llm_settings, the provider/model).
 */
export async function runGeneration({
  student,
  taskType,
  prompt,
  documentIds,
  photos = [],
  language = "auto",
}: GenerationInput): Promise<GenerationOutput> {
  const quota = await checkQuota(student.id);
  if (quota.overQuota) throw new QuotaExceededError(quota);

  // The knowledge-base search needs text, so photos are transcribed first and
  // that text joins the typed prompt as the search query.
  let searchQuery = prompt;
  if (photos.length > 0) {
    const transcription = await transcribePhotos(student.id, photos);
    searchQuery = `${prompt}\n\n${transcription}`.trim().slice(0, MAX_SEARCH_QUERY_CHARS);
  }

  const retrieval = await retrieveContext(searchQuery, { ownerId: student.id, documentIds });

  const { images: sourcePageImages, byPath: sourceImages } = await loadSourceImages(retrieval.chunks);

  const photoNote =
    photos.length > 0
      ? `\n\n(The first ${photos.length} attached image(s) are photos from the user — the question to work on. Any further images are reference-material pages.)`
      : "";

  const result = await generateCompletion({
    taskType,
    systemInstructions: systemInstructionsFor(taskType, levelLine(student), language),
    prompt: `${prompt}${photoNote}`,
    context: formatContext(retrieval.chunks),
    images: [...photos, ...sourcePageImages],
    // Search grounding is opt-in per the RAG-first policy: only fires when
    // coverage from the knowledge base is weak.
    allowSearchGrounding: retrieval.coverageLow,
  });

  await recordTokenUsage({
    studentId: student.id,
    taskType,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
  });

  return {
    text: result.text,
    sources: retrieval.chunks,
    sourceImages,
    usedSearchGrounding: Boolean(result.usedSearchGrounding),
    searchSuggestionsHtml: result.searchSuggestionsHtml,
  };
}

// Long enough for a whole worksheet; each question is then searched on its own.
const MAX_SEARCH_QUERY_CHARS = 12000;

/** Transcribes attached photos into text for the knowledge-base search, counting the call against the quota. */
async function transcribePhotos(studentId: string, photos: CompletionImage[]): Promise<string> {
  const result = await generateCompletion({
    taskType: "ocr_extraction",
    systemInstructions:
      "Transcribe the text in these photos of study material faithfully, including question numbers and math in plain notation. No commentary.",
    prompt: "Transcribe these photos.",
    images: photos,
    temperature: 0,
  });
  await recordTokenUsage({
    studentId,
    taskType: "ocr_extraction",
    provider: result.provider,
    model: result.model,
    usage: result.usage,
  });
  return result.text.trim();
}
