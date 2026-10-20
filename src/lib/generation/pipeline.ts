import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { countWeakPages } from "@/lib/ingestion/page-read";
import { scoreAnswer, type AnswerConfidence } from "@/lib/generation/confidence";
import { retrieveContext, formatContext, loadSourceImages } from "@/lib/rag/retrieve";
import { checkQuota, QuotaExceededError } from "@/lib/quota";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import { levelLine } from "@/lib/generation/level";
import type { AnswerLanguage } from "@/lib/generation/language";
import type { CompletionImage } from "@/lib/llm/types";
import type { AnswerCheck, GenerationTaskType, MatchedChunk, Student } from "@/types/database";
import { checkArithmetic } from "@/lib/checks/arithmetic";
import { checkCoverage, checkSamplePaper } from "@/lib/checks/rules";

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
   * used to search the books.
   */
  photos?: CompletionImage[];
  /** Language to answer in; "auto" follows the book and question. */
  language?: AnswerLanguage;
  /** Receives the first draft of the answer piece by piece, so a screen can show it as it is written. */
  onText?: (delta: string) => void;
  /** The draft so far is discarded (the answer starts again). */
  onRestart?: () => void;
}

export interface GenerationOutput {
  text: string;
  sources: MatchedChunk[];
  /** Source image_path → loaded image, so the PDF renderer can attach the right figure to the right citation. */
  sourceImages: Map<string, CompletionImage>;
  usedSearchGrounding: boolean;
  /** Google's Search Suggestions HTML when the answer used web search (must be shown with it). */
  searchSuggestionsHtml?: string;
  /** What Syllabi's own code checked (calculations), shown with the answer. */
  checks: AnswerCheck[];
  /** How sure we are the answer is correct and grounded, and how much of it comes from the books. */
  confidence: AnswerConfidence;
  /** Where the time went, in milliseconds, to find out what is slow. */
  timings: GenerationTimings;
}

interface GenerationTimings {
  /** Reading attached photos (0 when there were none). */
  readingPhotosMs: number;
  /** Finding passages in the books (embedding the question and searching). */
  searchMs: number;
  /** Loading the source page images the answer will cite. */
  loadingImagesMs: number;
  /** From sending the request to the AI until its first words (null when not streamed). */
  firstWordsMs: number | null;
  /** The AI writing the whole first draft. */
  writingMs: number;
  /** Fixing a draft that failed Syllabi's checks (0 when it passed). */
  repairMs: number;
  /** Which service and model wrote the answer. */
  model: string;
}

/** All code checks that apply to this kind of answer. */
function answerChecks(taskType: GenerationTaskType, text: string, questionText: string, prompt: string): AnswerCheck[] {
  const checks = checkArithmetic(text);
  if (taskType === "sample_paper") {
    const total = /Total marks:\s*(\d{1,3})/i.exec(prompt);
    checks.push(...checkSamplePaper(text, total ? Number(total[1]) : null));
  }
  if (taskType === "solution" || taskType === "ad_hoc") checks.push(...checkCoverage(questionText, text));
  return checks;
}

// Lower for answers that must be exact and repeatable (solutions, answer
// keys); a little higher where variety helps (notes, open questions).
const TEMPERATURE: Record<GenerationTaskType, number> = {
  solution: 0.2,
  sample_paper: 0.3,
  notes: 0.3,
  ad_hoc: 0.4,
  study_pack: 0.3,
};

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
  onText,
  onRestart,
}: GenerationInput): Promise<GenerationOutput> {
  // The allowance check runs alongside the (cheap) photo reading and search
  // below instead of before them, and still stops the request before the
  // main AI call.
  const timings: GenerationTimings = {
    readingPhotosMs: 0,
    searchMs: 0,
    loadingImagesMs: 0,
    firstWordsMs: null,
    writingMs: 0,
    repairMs: 0,
    model: "",
  };
  const quotaCheck = checkQuota(student.id);
  quotaCheck.catch(() => {}); // reported where it is awaited below

  // The knowledge-base search needs text, so photos are transcribed first and
  // that text joins the typed prompt as the search query.
  let searchQuery = prompt;
  if (photos.length > 0) {
    // Digital PDF pages bring their own text; only the rest are transcribed.
    const known = photos.filter((p) => p.text).map((p) => p.text!);
    const unread = photos.filter((p) => !p.text);
    if (unread.length > 0) {
      // Reading photos uses the AI, so the allowance is checked first.
      const early = await quotaCheck;
      if (early.overQuota) throw new QuotaExceededError(early);
    }
    const photosStart = Date.now();
    const transcription = unread.length > 0 ? await transcribePhotos(student.id, unread) : "";
    timings.readingPhotosMs = Date.now() - photosStart;
    searchQuery = [prompt, ...known, transcription].join("\n\n").trim().slice(0, MAX_SEARCH_QUERY_CHARS);
  }

  const searchStart = Date.now();
  const retrieval = await retrieveContext(searchQuery, { ownerId: student.id, documentIds });
  timings.searchMs = Date.now() - searchStart;

  const quota = await quotaCheck;
  if (quota.overQuota) throw new QuotaExceededError(quota);

  const imagesStart = Date.now();
  const { images: sourcePageImages, byPath: sourceImages } = await loadSourceImages(retrieval.chunks);
  timings.loadingImagesMs = Date.now() - imagesStart;

  const photoNote =
    photos.length > 0
      ? `\n\n(The first ${photos.length} attached image(s) are photos from the user — the question to work on. Any further images are reference-material pages.)`
      : "";

  const request = {
    taskType,
    systemInstructions: systemInstructionsFor(taskType, levelLine(student), language),
    prompt: `${prompt}${photoNote}`,
    context: formatContext(retrieval.chunks),
    images: [...photos, ...sourcePageImages],
    // Search grounding is opt-in per the RAG-first policy: only fires when
    // coverage from the books is weak.
    allowSearchGrounding: retrieval.coverageLow,
    temperature: TEMPERATURE[taskType],
  };
  const writingStart = Date.now();
  let result = await generateCompletion({
    ...request,
    onText:
      onText &&
      ((delta) => {
        timings.firstWordsMs ??= Date.now() - writingStart;
        onText(delta);
      }),
    onRestart,
  });
  timings.writingMs = Date.now() - writingStart;
  timings.model = `${result.provider} / ${result.model}${result.standInFor ? ` (stand-in: ${result.standInFor} was busy)` : ""}`;
  await recordTokenUsage({
    studentId: student.id,
    taskType,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
  });

  // Code checks every answer: calculations are recomputed, a paper's marks
  // added up and its answer key compared, a worksheet's questions counted.
  // Only when something is wrong is the AI asked (once) to correct it.
  const runChecks = (text: string) => answerChecks(taskType, text, searchQuery, prompt);
  let checks = runChecks(result.text);
  const problems = checks.filter((c) => !c.ok);
  if (problems.length > 0) {
    const repairStart = Date.now();
    const repaired = await generateCompletion({
      ...request,
      prompt:
        `${request.prompt}\n\nYour draft answer below has these problems, found by Syllabi's checks (an exact calculator and a marks counter):\n` +
        problems.map((c) => `- ${c.message}`).join("\n") +
        "\nWrite the complete answer again with these fixed, and anything that follows from them. Keep everything else the same." +
        `\n\nDraft answer:\n${result.text}`,
    });
    await recordTokenUsage({
      studentId: student.id,
      taskType,
      provider: repaired.provider,
      model: repaired.model,
      usage: repaired.usage,
    });
    timings.repairMs = Date.now() - repairStart;
    const recheck = runChecks(repaired.text);
    // Keep the repair only if it really has fewer problems.
    if (recheck.filter((c) => !c.ok).length < problems.length) {
      result = { ...repaired, searchSuggestionsHtml: repaired.searchSuggestionsHtml ?? result.searchSuggestionsHtml };
      checks = recheck;
    }
  }

  const confidence = scoreAnswer({
    text: result.text,
    context: retrieval.chunks,
    checks,
    coverageLow: retrieval.coverageLow,
    usedSearchGrounding: Boolean(result.usedSearchGrounding),
    weakPages: await countWeakPages(retrieval.chunks),
  });

  return {
    text: result.text,
    confidence,
    sources: retrieval.chunks,
    sourceImages,
    usedSearchGrounding: Boolean(result.usedSearchGrounding),
    searchSuggestionsHtml: result.searchSuggestionsHtml,
    checks,
    timings,
  };
}

// Long enough for a whole worksheet; each question is then searched on its own.
const MAX_SEARCH_QUERY_CHARS = 12000;

/** Transcribes attached photos into text for the knowledge-base search, counting the call against the quota. */
async function transcribePhotos(studentId: string, photos: CompletionImage[]): Promise<string> {
  const result = await generateCompletion({
    taskType: "ocr_extraction",
    systemInstructions:
      "Transcribe the text in these photos of study material faithfully, including question numbers and math in plain notation. Transcribe each printed question alone, exactly as printed; put any handwriting (a student's answers, notes) separately as [Handwritten: ...] after its question, never inside the question text. No commentary.",
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
