import type { DownscaledImage } from "@/lib/downscale-image";
import type { AnswerLanguage } from "@/lib/generation/language";
import { pureProblem, solve } from "@/lib/worked/detect";
import type { GenerationTaskType } from "@/types/database";
import { textTooLong } from "@/lib/generation/attachments";

/** Everything typed, chosen and attached for one question. */
export interface Question {
  task: GenerationTaskType;
  prompt: string;
  /** Sample papers: total marks to aim for. */
  totalMarks: string;
  /** Paper checker: marks for each question ("" = use the marks on the paper, or 5). */
  marksEach: string;
  language: AnswerLanguage;
  /** Study packs: the chapter chosen from My books ("" = none). Attached pages, if any, are used instead. */
  packBookId: string;
  /** Answers search only these books. */
  bookIds: string[];
  photos: DownscaledImage[];
  docs: { name: string; text: string }[];
}

const attachedText = (q: Question) => q.docs.map((d) => `Attached file "${d.name}":\n${d.text}`).join("\n\n");

/** Why the question can't be sent yet (a plain sentence), or null when it can. */
export function questionProblem(q: Question): string | null {
  if (q.task === "study_pack") {
    return !q.packBookId && q.photos.length === 0 ? "Choose the chapter from My books, or attach photos or a PDF of it." : null;
  }
  if (!q.prompt.trim() && q.photos.length === 0 && q.docs.length === 0) {
    return q.task === "paper_check" ? "Attach photos or a PDF of the solved paper first, or type the sums with the student's working." : "Type a question or attach a photo or file first.";
  }
  if (q.task === "paper_check" && q.marksEach.trim() !== "" && !(Number(q.marksEach) > 0 && Number(q.marksEach) <= 100)) return "Marks per question must be a number from 1 to 100, or leave it empty.";
  // Too much is refused with a reason, never cut off quietly (the last pages would be missed).
  return textTooLong(q.prompt.trim(), attachedText(q));
}

const toPhotos = (photos: DownscaledImage[]) => photos.map((p) => ({ data: p.imageBase64, mimeType: p.mimeType, text: p.text }));

/** What is sent as the question: the typed text, with the marks (sample paper) or marks per question (paper checker) added. */
function promptFor(q: Question): string {
  const typed = q.prompt.trim();
  if (q.task === "sample_paper") return `${typed}\n\nTotal marks: ${q.totalMarks}`.trim();
  if (q.task !== "paper_check") return typed;
  const each = Number(q.marksEach);
  const marks = each > 0 && each <= 100 ? `Marks per question (set): ${each}` : "Marks per question: not given (use the marks printed on the paper, or 5 per question when none are printed)";
  return `${typed}\n\n${marks}`.trim();
}

/** The request body for the question: a study pack from a chapter, or an answer from the ticked books. */
export function buildRequestBody(q: Question): Record<string, unknown> {
  if (q.task === "study_pack") {
    // Pages attached for a pack are the chapter the parent means, so they win over a chosen book.
    const fromPages = q.photos.length > 0;
    return {
      documentId: fromPages ? undefined : q.packBookId || undefined,
      photos: fromPages ? toPhotos(q.photos) : [],
      focus: q.prompt.trim(),
      language: q.language,
    };
  }
  return {
    prompt: promptFor(q),
    // Marking a paper needs no book.
    documentIds: q.task === "paper_check" ? [] : q.bookIds,
    language: q.language,
    photos: toPhotos(q.photos),
    attachedText: attachedText(q),
  };
}

/** Why the Generate button is off, so a disabled button is never a mystery; null when it is on. */
export function blockedReason(state: { overQuota: boolean; noBookSelected: boolean; readingFiles: boolean; choosingPages: boolean }): string | null {
  if (state.overQuota) return "Generate is paused: you've used this month's allowance (see the message above).";
  if (state.noBookSelected) return "Generate is off because no book is selected. Under “Search these books”, tap a book, or tap All.";
  if (state.readingFiles) return "Preparing your attachment. Generate turns on when it's ready.";
  if (state.choosingPages) return "Choose which pages of the long PDF to attach (or skip it), then press Generate.";
  return null;
}

/**
 * A question that is only a calculation ("Divide 5255 by 5", "LCM of 12, 18 and 30") is answered by code:
 * exact, instant, and no AI used. Returns the worked example, or null when the question needs the AI.
 */
export function calculationAnswer(q: Question) {
  if ((q.task !== "solution" && q.task !== "ad_hoc") || q.photos.length > 0 || q.docs.length > 0) return null;
  const problem = pureProblem(q.prompt, q.language);
  const example = problem ? solve(problem) : null;
  return problem && example ? { problem, example } : null;
}
