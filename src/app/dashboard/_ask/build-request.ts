import type { DownscaledImage } from "@/lib/downscale-image";
import type { AnswerLanguage } from "@/lib/generation/language";
import type { GenerationTaskType } from "@/types/database";
import { MAX_ATTACHED_TEXT_CHARS } from "@/app/dashboard/_ask/constants";

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

/** Why the question can't be sent yet (a plain sentence), or null when it can. */
export function questionProblem(q: Question): string | null {
  if (q.task === "study_pack") {
    return !q.packBookId && q.photos.length === 0 ? "Choose the chapter from My books, or attach photos or a PDF of it." : null;
  }
  return !q.prompt.trim() && q.photos.length === 0 && q.docs.length === 0 ? "Type a question or attach a photo or file first." : null;
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
    attachedText: q.docs
      .map((d) => `Attached file "${d.name}":\n${d.text}`)
      .join("\n\n")
      .slice(0, MAX_ATTACHED_TEXT_CHARS),
  };
}

/** Why the Generate button is off, so a disabled button is never a mystery; null when it is on. */
export function blockedReason(state: { overQuota: boolean; noBookSelected: boolean; readingFiles: boolean }): string | null {
  if (state.overQuota) return "Generate is paused: you've used this month's allowance (see the message above).";
  if (state.noBookSelected) return "Generate is off because no book is selected. Under “Search these books”, tap a book, or tap All.";
  if (state.readingFiles) return "Preparing your attachment. Generate turns on when it's ready.";
  return null;
}
