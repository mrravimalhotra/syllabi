import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { fullContextBudget } from "@/lib/rag/budget";
import { countWeakPages } from "@/lib/ingestion/page-read";
import { scoreAnswer, type AnswerConfidence } from "@/lib/generation/confidence";
import { retrieveContext, formatContext, loadSourceImages, type RetrievalResult } from "@/lib/rag/retrieve";
import { checkQuota, QuotaExceededError } from "@/lib/quota";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import { problemForRepair, reviewChecks, verifyAnswer, type VerifyProblem } from "@/lib/generation/verify";
import { disagreements, solveAgain, type FinalAnswer } from "@/lib/generation/second-solve";
import { markAgain, markingDisagreements, type SecondMark } from "@/lib/generation/second-marking";
import { CITING_TASKS, checkCitations, withPageReferences } from "@/lib/generation/citations";
import { levelLine } from "@/lib/generation/level";
import type { AnswerLanguage } from "@/lib/generation/language";
import type { CompletionImage, CompletionResult } from "@/lib/llm/types";
import type { AnswerCheck, GenerationTaskType, MatchedChunk, Student } from "@/types/database";
import { checkArithmetic } from "@/lib/checks/arithmetic";
import { checkPaperMarks, withoutStudentWork } from "@/lib/checks/paper";
import { checkCoverage, checkSamplePaper } from "@/lib/checks/rules";

export interface GenerationInput {
  student: Student;
  taskType: GenerationTaskType;
  prompt: string;
  /** The words that can ask for a whole exercise or named pages (not a long paste or the photos' text); the whole query when omitted. */
  askedFor?: string;
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
  /** The finished draft is being checked, or being fixed after the checks, so a screen can say so. */
  onStage?: (stage: AnswerStage) => void;
}

/** What happens after the first draft is written. */
type AnswerStage = "checking" | "fixing";

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
  confidence: AnswerConfidence | null;
  /** Every page of the selected books was passed to the AI (so the sources are the books, not a few passages). */
  fullContext: boolean;
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
  /** The independent AI check of the draft. */
  reviewMs: number;
  /** Fixing a draft that failed Syllabi's checks, and checking the fix (0 when it passed). */
  repairMs: number;
  /** Which service and model wrote the answer. */
  model: string;
}

/** All code checks that apply to this kind of answer. */
function answerChecks(taskType: GenerationTaskType, text: string, questionText: string, prompt: string): AnswerCheck[] {
  if (taskType === "paper_check") {
    // The teacher's own sums are checked; lines quoting the student's (wrong) working are not, then the marks, total and grade.
    const set = /Marks per question \(set\):\s*(\d+(?:\.\d+)?)/i.exec(prompt);
    return [...checkArithmetic(withoutStudentWork(text)), ...checkPaperMarks(text, set ? Number(set[1]) : null)];
  }
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
  // Marking must be exact and repeatable.
  paper_check: 0.1,
};

// How much the model may think before writing: most for maths and marking, where working the problem
// through first catches mistakes; a little for notes. Study packs are made elsewhere.
const THINKING: Record<GenerationTaskType, number> = {
  solution: 8192,
  paper_check: 8192,
  sample_paper: 4096,
  ad_hoc: 4096,
  notes: 2048,
  study_pack: 0,
};

/** Shown when the independent examiner couldn't read the answer this time. */
const NOT_DOUBLE_CHECKED: AnswerCheck = {
  kind: "review",
  ok: false,
  message: "Not double-checked: the independent check couldn't run this time, so this answer hasn't been read a second time. Check it carefully, or ask again in a minute.",
};

/**
 * What the independent checks say, shown with the answer: what they still find, else a clean result (only when
 * the check really ran), and never an unchecked answer that looks checked. Added after any fix, so it never causes one.
 */
function independentChecks(review: VerifyProblem[] | null, examined: boolean, marking: boolean): AnswerCheck[] {
  if (review?.length) return [...reviewChecks(review), ...(examined ? [] : [NOT_DOUBLE_CHECKED])];
  if (!examined) return [NOT_DOUBLE_CHECKED];
  return [marking ? SECOND_MARKING_AGREED : reviewChecks([])[0]];
}

/** Which independent check found a problem, as told to the writer when it is asked to fix it. */
function foundBy(p: VerifyProblem): string {
  if (p.fromSecondMarking) return "found by marking the paper again independently";
  if (p.fromSecondSolution) return "found by solving the question again independently";
  return "found by an independent examiner reading the answer against the books";
}

/** Shown when a second, independent marking of a checked paper agreed on every question. */
const SECOND_MARKING_AGREED: AnswerCheck = { kind: "review", ok: true, message: "A second, independent marking gave the same marks for every question" };

/** After this long since writing began, the fix and its re-check think less, so the answer is in well within the time limit. */
const LATE_MS = 120_000;
const LATE_THINKING = 1024;

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
  askedFor,
  documentIds,
  photos = [],
  language = "auto",
  onText,
  onRestart,
  onStage,
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
    reviewMs: 0,
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
    // Each part gets its share, so a long typed or attached text cannot push the photos' questions out of the search.
    const share = Math.floor(MAX_SEARCH_QUERY_CHARS / 3);
    searchQuery = [prompt.slice(0, share), transcription.slice(0, share), ...known].join("\n\n").trim().slice(0, MAX_SEARCH_QUERY_CHARS);
  }

  const quota = await quotaCheck;
  if (quota.overQuota) throw new QuotaExceededError(quota);

  const searchStart = Date.now();
  // Marking a paper needs no book: the student's work is the material.
  const retrieval: RetrievalResult =
    taskType === "paper_check"
      ? { chunks: [], coverageLow: false, stats: { mode: "search", books: 0, totalChars: 0, sectionChunks: 0, questions: 0, supportChunks: 0, topSimilarity: null } }
      : await retrieveContext(searchQuery, {
          ownerId: student.id,
          documentIds,
          askedFor,
          // The selected books are passed whole when they fit.
          fullContextChars: fullContextBudget(),
        });
  timings.searchMs = Date.now() - searchStart;

  const imagesStart = Date.now();
  const { images: sourcePageImages, byPath: sourceImages } = await loadSourceImages(retrieval.chunks, retrieval.stats.mode === "search" ? undefined : MAX_PAGE_IMAGES);
  timings.loadingImagesMs = Date.now() - imagesStart;

  const { result, checks } = await writeAndCheck({
    taskType,
    student,
    prompt,
    language,
    chunks: retrieval.chunks,
    coverageLow: retrieval.coverageLow,
    photos,
    sourcePageImages,
    searchQuery,
    timings,
    onText,
    onRestart,
    onStage,
  });

  // How much of a marking comes from the books is not a question: there are no books in it.
  const confidence =
    taskType === "paper_check"
      ? null
      : scoreAnswer({
          text: result.text,
          context: retrieval.chunks,
          retrieval: retrieval.stats,
          checks,
          coverageLow: retrieval.coverageLow,
          usedSearchGrounding: Boolean(result.usedSearchGrounding),
          weakPages: await countWeakPages(retrieval.chunks),
        });

  return {
    text: result.text,
    confidence,
    fullContext: retrieval.stats.mode === "full",
    sources: retrieval.chunks,
    sourceImages,
    usedSearchGrounding: Boolean(result.usedSearchGrounding),
    searchSuggestionsHtml: result.searchSuggestionsHtml,
    checks,
    timings,
  };
}

// Page pictures sent when books are passed whole or an exercise is answered (the exercise pages come first).
const MAX_PAGE_IMAGES = 10;

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


/**
 * Writes the answer from the passages found and checks it (see checkAndRepair): the core of every answer,
 * also run by the quality test set (scripts/quality) on fixed questions and passages.
 */
export async function writeAndCheck(input: {
  taskType: GenerationTaskType;
  student: Pick<Student, "id" | "class_level" | "board">;
  prompt: string;
  language: AnswerLanguage;
  chunks: MatchedChunk[];
  coverageLow: boolean;
  photos: CompletionImage[];
  sourcePageImages: CompletionImage[];
  searchQuery: string;
  timings: GenerationTimings;
  onText?: (delta: string) => void;
  onRestart?: () => void;
  onStage?: (stage: AnswerStage) => void;
}): Promise<{ result: CompletionResult; checks: AnswerCheck[] }> {
  const { taskType, student, prompt, language, chunks, coverageLow, photos, sourcePageImages, searchQuery, timings, onText, onRestart, onStage } = input;
  const photoNote =
    photos.length > 0
      ? `\n\n(The first ${photos.length} attached image(s) are photos from the user — the question to work on. Any further images are reference-material pages.)`
      : "";

  const request = {
    taskType,
    systemInstructions: systemInstructionsFor(taskType, levelLine(student), language),
    prompt: `${prompt}${photoNote}`,
    context: taskType === "paper_check" ? "(No reference material is needed: mark the student's work with your own mathematical knowledge.)" : formatContext(chunks),
    images: [...photos, ...sourcePageImages],
    // Search grounding is opt-in per the RAG-first policy: only fires when
    // coverage from the books is weak.
    allowSearchGrounding: coverageLow,
    temperature: TEMPERATURE[taskType],
    thinking: THINKING[taskType],
  };
  const writingStart = Date.now();
  const result = await generateCompletion({
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

  const checked = await checkAndRepair({ taskType, studentId: student.id, request, result, chunks, photos, searchQuery, prompt, timings, onStage });
  return { result: checked.result, checks: checked.checks };
}

type DraftRequest = Parameters<typeof generateCompletion>[0] & { prompt: string; context: string };

/**
 * Checks a finished draft and fixes it when needed. Every answer is checked twice over: by code (calculations recomputed, a paper's marks added up and its
 * answer key compared, a worksheet's questions counted) and by a second, independent AI reading against
 * the books (wrong facts, missed parts, unsupported claims). Only when something is wrong is the AI asked
 * (once) to correct it; the correction is checked the same way and kept only if it has fewer problems.
 */
async function checkAndRepair(input: {
  taskType: GenerationTaskType;
  studentId: string;
  request: DraftRequest;
  result: CompletionResult;
  /** The passages the answer was written from, for checking its citations. */
  chunks: MatchedChunk[];
  photos: CompletionImage[];
  searchQuery: string;
  prompt: string;
  timings: GenerationTimings;
  onStage?: (stage: AnswerStage) => void;
}): Promise<{ result: CompletionResult; checks: AnswerCheck[] }> {
  const { taskType, studentId, request, chunks, photos, searchQuery, prompt, timings, onStage } = input;
  let result = input.result;
  // Roughly when writing began: the checks and the fix think less once the answer is running late.
  const began = Date.now() - timings.writingMs;
  const late = () => Date.now() - began > LATE_MS;
  const cites = CITING_TASKS.includes(taskType);
  const runChecks = (text: string) => [...answerChecks(taskType, text, searchQuery, prompt), ...(cites ? checkCitations(text, chunks) : [])];
  const runReview = async (text: string): Promise<VerifyProblem[] | null> => {
    // The paper checker's marking is checked by code (lib/checks/paper.ts); it has no book to check against.
    if (taskType === "paper_check") return null;
    const verified = await verifyAnswer({ taskType, question: request.prompt, answer: text, context: request.context, photos, ...(late() ? { thinking: LATE_THINKING } : {}) });
    if (!verified) return null;
    await recordTokenUsage({
      studentId,
      taskType,
      provider: verified.result.provider,
      model: verified.result.model,
      usage: verified.result.usage,
    });
    return verified.problems;
  };
  // Maths (an answer with calculations in it) is also solved a second time, independently; its final answers
  // must match the answer's, and a mismatch is a problem like the examiner's.
  const runSecondSolve = async (): Promise<FinalAnswer[] | null> => {
    const second = await solveAgain({ taskType, question: request.prompt, context: request.context, photos });
    if (!second) return null;
    await recordTokenUsage({ studentId, taskType, provider: second.result.provider, model: second.result.model, usage: second.result.usage });
    return second.finals;
  };
  // A checked paper is marked a second time, independently; a question the two markings disagree on is a problem.
  const runSecondMarking = async (): Promise<SecondMark[] | null> => {
    const second = await markAgain({ question: request.prompt, photos });
    if (!second) return null;
    await recordTokenUsage({ studentId, taskType, provider: second.result.provider, model: second.result.model, usage: second.result.usage });
    return second.marks;
  };
  const reviewStart = Date.now();
  if (taskType !== "paper_check") onStage?.("checking");
  let checks = runChecks(result.text);
  const maths = (taskType === "solution" || taskType === "ad_hoc") && checks.some((c) => c.kind === "calculation");
  const marking = taskType === "paper_check";
  const [firstReview, secondFinals, secondMarks] = await Promise.all([
    runReview(result.text),
    maths ? runSecondSolve() : Promise.resolve(null),
    marking ? runSecondMarking() : Promise.resolve(null),
  ]);
  // The examiner's problems with the second solution's (or second marking's) disagreements added; null only when nothing could check.
  const withSecond = (found: VerifyProblem[] | null, text: string): VerifyProblem[] | null => {
    const mismatches = [...(secondFinals ? disagreements(secondFinals, text) : []), ...(secondMarks ? markingDisagreements(secondMarks, text) : [])];
    return found === null && !secondFinals && !secondMarks ? null : [...(found ?? []), ...mismatches];
  };
  let review = withSecond(firstReview, result.text);
  // Whether the independent reading of the answer shown actually ran (it can fail: busy, or an unreadable reply):
  // the examiner's, or for a checked paper the second marking.
  let examined = marking ? secondMarks !== null : firstReview !== null;
  timings.reviewMs = Date.now() - reviewStart;
  const problems = checks.filter((c) => !c.ok);
  const problemCount = (failed: AnswerCheck[], found: VerifyProblem[] | null) => failed.length + (found?.length ?? 0);
  if (problemCount(problems, review) > 0) {
    const repairStart = Date.now();
    onStage?.("fixing");
    const found = [
      ...problems.map((c) => `- ${c.message} (found by Syllabi's exact calculator or marks counter)`),
      ...(review ?? []).map(
        (p) =>
          `- ${problemForRepair(p)} (${foundBy(p)})`
      ),
    ];
    const repaired = await generateCompletion({
      ...request,
      ...(late() ? { thinking: LATE_THINKING } : {}),
      prompt:
        `${request.prompt}\n\nYour draft answer below has these problems:\n${found.join("\n")}\n` +
        "Check each one against the reference material. Fix every real problem, and anything that follows from it; for a claim the books do not support, " +
        'remove it or mark it "(general knowledge)". If a reported problem is not actually a mistake, keep that part as it is. ' +
        "Write the complete answer again, keeping everything else the same." +
        `\n\nDraft answer:\n${result.text}`,
    });
    await recordTokenUsage({
      studentId,
      taskType,
      provider: repaired.provider,
      model: repaired.model,
      usage: repaired.usage,
    });
    const recheck = runChecks(repaired.text);
    const rereviewed = await runReview(repaired.text);
    const rereview = withSecond(rereviewed, repaired.text);
    timings.repairMs = Date.now() - repairStart;
    // Keep the repair only if it really has fewer problems (a review that could not run counts as unchanged).
    if (
      problemCount(
        recheck.filter((c) => !c.ok),
        rereview ?? review
      ) < problemCount(problems, review)
    ) {
      result = { ...repaired, searchSuggestionsHtml: repaired.searchSuggestionsHtml ?? result.searchSuggestionsHtml };
      checks = recheck;
      review = rereview ?? review;
      if (!marking) examined = rereviewed !== null;
    }
  }
  // What the independent checks still find is shown with the answer, so the parent knows what to look at; a clean
  // result only when the check really ran.
  checks = [...checks, ...independentChecks(review, examined, marking)];
  // The checked "[S2]" marks become page references the parent can follow.
  if (cites) result = { ...result, text: withPageReferences(result.text, chunks) };
  return { result, checks };
}
