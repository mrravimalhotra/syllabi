import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { checkQuota, QuotaExceededError } from "@/lib/quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserError } from "@/lib/errors";
import type { CompletionImage } from "@/lib/llm/types";
import type { Student } from "@/types/database";
import { QUESTIONS_SCHEMA, QUESTIONS_SYSTEM, WALKTHROUGH_SCHEMA, WALKTHROUGH_SYSTEM } from "@/lib/study-pack/prompts";
import { evidenceFound } from "@/lib/study-pack/verify";
import { autoKeyFor } from "@/lib/study-pack/auto-key";
import { levelLine } from "@/lib/generation/level";
import { languageLine, type AnswerLanguage } from "@/lib/generation/language";
import type { PackQuestion, StudyPack, VocabularyItem, WalkthroughPart } from "@/lib/study-pack/types";

// About 40 dense textbook pages; longer books should be split into chapters.
const MAX_CHAPTER_CHARS = 150_000;
const MAX_FOCUS_CHARS = 1_000;

interface Chapter {
  text: string;
  source: string;
}

/** A book from the user's library, put back together in reading order. */
export async function loadBook(documentId: string, ownerId: string): Promise<Chapter> {
  const admin = createAdminClient();
  const { data: book } = await admin
    .from("documents")
    .select("id, title, status")
    .eq("id", documentId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!book) throw new UserError("That book wasn't found in My books.");
  if (book.status !== "ready") throw new UserError("That book is still being read. Try again when it shows Ready.");

  const { data: chunks, error } = await admin
    .from("chunks")
    .select("content, page_number, chunk_index, created_at")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true, nullsFirst: false })
    .order("chunk_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw error;
  if (!chunks?.length) throw new UserError("No text was found in that book. Try uploading it again.");

  let text = "";
  let lastPage: number | null = null;
  for (const chunk of chunks) {
    if (chunk.page_number !== lastPage) {
      text += `\n\n[Page ${chunk.page_number ?? "?"}]\n`;
      lastPage = chunk.page_number;
    }
    text += `${chunk.content}\n\n`;
  }
  const pages = chunks.map((c) => c.page_number).filter((n): n is number => typeof n === "number");
  const range = pages.length ? ` (pages ${Math.min(...pages)}-${Math.max(...pages)})` : "";
  return { text: text.trim(), source: `${book.title}${range}` };
}

/**
 * Attached pages of a chapter as text, so both calls (and the quote check) can
 * use it: digital PDF pages bring their own text; only photos and scans are
 * transcribed, once.
 */
async function transcribe(studentId: string, photos: CompletionImage[]): Promise<Chapter> {
  const source = `${photos.length} attached page${photos.length > 1 ? "s" : ""}`;
  if (photos.every((p) => p.text)) return { text: photos.map((p) => p.text).join("\n\n"), source };
  const result = await generateCompletion({
    taskType: "ocr_extraction",
    systemInstructions:
      "Transcribe these photos of a book chapter faithfully and completely, in page order: headings, every paragraph, " +
      "captions, boxes, and all exercise questions with their numbers, options and marks. Describe figures in one line " +
      "as [Figure: ...] and mark handwriting as [Handwritten: ...]. Plain text, no commentary.",
    prompt: "Transcribe these pages.",
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
  return { text: result.text.trim(), source: `${photos.length} attached page${photos.length > 1 ? "s" : ""}` };
}

/** Parses a JSON reply, tolerating code fences or text around it (providers without structured output). */
function parseJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

const str = (v: unknown, max = 4000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function vocabulary(v: unknown): VocabularyItem[] {
  const seen = new Set<string>();
  return list(v, 8)
    .map(record)
    .map((x) => ({ word: str(x.word, 120), meaning: str(x.meaning, 400) }))
    .filter((x) => x.word && x.meaning && !seen.has(x.word.toLowerCase()) && seen.add(x.word.toLowerCase()));
}

function question(v: unknown, chapterText: string | null, practice: boolean): PackQuestion | null {
  const x = record(v);
  const q = str(x.question);
  const answer = str(x.answer, 6000);
  if (!q || !answer) return null;
  const evidence = str(x.evidence, 600);
  const difficulty = x.difficulty === "easy" || x.difficulty === "medium" || x.difficulty === "hard" ? x.difficulty : null;
  const type = str(x.type, 60);
  const options = list(x.options, 8).map((o) => str(o, 300)).filter(Boolean);
  const autoKey = autoKeyFor(q, type, options, answer);
  const marks = typeof x.marks === "number" && x.marks > 0 && x.marks <= 20 ? Math.round(x.marks) : null;
  return {
    number: practice ? "" : str(x.number, 40),
    question: q,
    type,
    marks,
    options,
    hint: str(x.hint, 400),
    evidence,
    evidenceFound: evidence && chapterText ? evidenceFound(evidence, chapterText) : null,
    answer,
    narration: str(x.narration, 3000),
    difficulty: practice ? (difficulty ?? "medium") : null,
    skill: practice ? str(x.skill, 300) : "",
    autoKey,
  };
}

/** Turns the two model replies into a clean pack, checking every quote against the chapter. */
function buildPack(
  walk: Record<string, unknown>,
  qa: Record<string, unknown>,
  chapterText: string | null,
  source: string,
  sourceDocumentId: string | null = null
): StudyPack {
  const kind = walk.kind === "story" ? "story" : "information";
  const walkthrough: WalkthroughPart[] = list(walk.walkthrough, 10)
    .map(record)
    .map((p) => ({
      title: str(p.title, 120),
      summary: str(p.summary),
      whyItMatters: str(p.whyItMatters),
      feelings: kind === "story" ? str(p.feelings) || null : null,
      vocabulary: vocabulary(p.vocabulary),
      narration: str(p.narration),
    }))
    .filter((p) => p.title && p.summary);

  // Every vocabulary word once, alphabetically.
  const glossary = new Map<string, VocabularyItem>();
  for (const item of walkthrough.flatMap((p) => p.vocabulary)) {
    const key = item.word.toLowerCase();
    if (!glossary.has(key)) glossary.set(key, item);
  }

  return {
    version: 1,
    title: str(walk.title, 200) || "Chapter study pack",
    subject: str(walk.subject, 100),
    kind,
    language: /^[a-z]{2}$/.test(str(walk.language, 5)) ? str(walk.language, 5) : "en",
    overview: str(walk.overview, 1000),
    themes: list(walk.themes, 6).map((t) => str(t, 200)).filter(Boolean),
    characters:
      kind === "story"
        ? list(walk.characters, 20)
            .map(record)
            .map((c) => ({ name: str(c.name, 100), role: str(c.role, 200) }))
            .filter((c) => c.name)
        : [],
    walkthrough,
    textbookQuestions: list(qa.textbookQuestions, 80)
      .map((q) => question(q, chapterText, false))
      .filter((q): q is PackQuestion => q !== null),
    textbookQuestionsWritten: qa.textbookQuestionsWritten === true,
    practiceQuestions: list(qa.practiceQuestions, 15)
      .map((q) => question(q, chapterText, true))
      .filter((q): q is PackQuestion => q !== null),
    glossary: [...glossary.values()].sort((a, b) => a.word.localeCompare(b.word)),
    source,
    sourceDocumentId,
  };
}

/**
 * Makes a study pack for one chapter: from a book in My books (preferred: no
 * re-reading, and quotes can be checked) or from attached photos. The
 * walkthrough and the questions are two calls made at the same time.
 */
export async function generateStudyPack(input: {
  student: Student;
  documentId?: string;
  photos?: CompletionImage[];
  focus?: string;
  language?: AnswerLanguage;
}): Promise<StudyPack> {
  const quota = await checkQuota(input.student.id);
  if (quota.overQuota) throw new QuotaExceededError(quota);

  const chapter = input.documentId
    ? await loadBook(input.documentId, input.student.id)
    : input.photos?.length
      ? await transcribe(input.student.id, input.photos)
      : null;
  if (!chapter || chapter.text.length < 200) {
    throw new UserError("Choose a book from My books, or attach photos or a PDF of the chapter.");
  }
  if (chapter.text.length > MAX_CHAPTER_CHARS) {
    throw new UserError("That book is too long for one study pack. Upload one chapter as its own book and try again.");
  }

  const focus = input.focus?.trim().slice(0, MAX_FOCUS_CHARS);
  const level = levelLine(input.student);
  const prompt =
    `Chapter text:\n"""\n${chapter.text}\n"""` +
    (level ? `\n\n${level}` : "") +
    `\n\n${languageLine(input.language ?? "auto")}` +
    (focus ? `\n\nThe parent or tutor adds: ${focus}` : "") +
    "\n\nReturn the JSON object now.";

  const call = (systemInstructions: string, jsonSchema: Record<string, unknown>) =>
    generateCompletion({
      taskType: "study_pack",
      systemInstructions,
      prompt,
      jsonSchema,
      temperature: 0.3,
    });

  const [walkResult, qaResult] = await Promise.all([
    call(WALKTHROUGH_SYSTEM, WALKTHROUGH_SCHEMA),
    call(QUESTIONS_SYSTEM, QUESTIONS_SCHEMA),
  ]);
  for (const result of [walkResult, qaResult]) {
    await recordTokenUsage({
      studentId: input.student.id,
      taskType: "study_pack",
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    });
  }

  let walk: Record<string, unknown>;
  let qa: Record<string, unknown>;
  try {
    walk = parseJson(walkResult.text);
    qa = parseJson(qaResult.text);
  } catch (err) {
    console.error("[study-pack] unreadable reply", err, walkResult.truncated, qaResult.truncated);
    throw new UserError(
      walkResult.truncated || qaResult.truncated
        ? "This chapter made a pack too long to finish. Upload a shorter part of it as its own book and try again."
        : "The AI's reply couldn't be read. Please try again."
    );
  }

  const pack = buildPack(walk, qa, chapter.text, chapter.source, input.documentId ?? null);
  if (pack.walkthrough.length === 0 && pack.textbookQuestions.length === 0) {
    throw new UserError("The AI couldn't make a pack from this chapter. Check the pages are readable and try again.");
  }
  return pack;
}
