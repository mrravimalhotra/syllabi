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
  language: AnswerLanguage;
  /** Study packs: the chapter chosen from My books ("" = use the attached pages). */
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
  if (!q.prompt.trim() && q.photos.length === 0 && q.docs.length === 0) return "Type a question or attach a photo or file first.";
  // Too much is refused with a reason, never cut off quietly (the last pages would be missed).
  return textTooLong(q.prompt.trim(), attachedText(q));
}

const toPhotos = (photos: DownscaledImage[]) => photos.map((p) => ({ data: p.imageBase64, mimeType: p.mimeType, text: p.text }));

/** The request body for the question: a study pack from a chapter, or an answer from the ticked books. */
export function buildRequestBody(q: Question): Record<string, unknown> {
  if (q.task === "study_pack") {
    return {
      documentId: q.packBookId || undefined,
      photos: q.packBookId ? [] : toPhotos(q.photos),
      focus: q.prompt.trim(),
      language: q.language,
    };
  }
  return {
    prompt: q.task === "sample_paper" ? `${q.prompt.trim()}\n\nTotal marks: ${q.totalMarks}`.trim() : q.prompt.trim(),
    documentIds: q.bookIds,
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
