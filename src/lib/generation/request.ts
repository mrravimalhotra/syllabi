import { parseAttachedText, parsePhotos, textTooLong } from "@/lib/generation/attachments";
import { isAnswerLanguage, type AnswerLanguage } from "@/lib/generation/language";
import { isUuid } from "@/lib/validate";
import type { CompletionImage } from "@/lib/llm/types";
import type { GenerationTaskType } from "@/types/database";

const DEFAULT_PHOTO_PROMPT: Record<GenerationTaskType, string> = {
  solution: "Solve the question(s) in the attached photo or file step by step.",
  notes: "Make revision notes on the topic shown in the attached photo or file.",
  sample_paper: "Make a sample paper on the topic shown in the attached photo or file.",
  ad_hoc: "Explain what is shown in the attached photo or file.",
  study_pack: "Make a study pack for the chapter in the attached photos or file.",
  paper_check: "Check the solved maths paper in the attached photos or file: mark every sum.",
};

export interface GenerationRequest {
  /** What the person typed (may be empty when a photo or file is attached). */
  typedPrompt: string;
  /** Whether a Word file's text came with the question. */
  hasAttachedText: boolean;
  /** The question sent to the AI: the typed text (or a default for photos) plus the attached file's text. */
  prompt: string;
  photos: CompletionImage[];
  /** Which of the person's own books to search; undefined means all. */
  documentIds: string[] | undefined;
  language: AnswerLanguage;
  /** Ask for a new answer even if a saved one matches. */
  fresh: boolean;
  /** Send the first draft piece by piece as it is written. */
  stream: boolean;
}

/** Checks a request for an answer and returns it cleaned up, or the message to show. */
export function parseGenerationRequest(
  body: unknown,
  taskType: GenerationTaskType,
  defaultLanguage: AnswerLanguage
): { ok: true; value: GenerationRequest } | { ok: false; message: string } {
  // A body that can't be read is almost always one that was too big or cut off.
  if (body === null || typeof body !== "object") {
    return {
      ok: false,
      message:
        "Your question couldn't be read. It may be too large (try fewer or smaller attachments) or the connection dropped. Try again.",
    };
  }
  const b = body as Record<string, unknown>;
  const typedPrompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const photos = parsePhotos(b.photos);
  if (typeof photos === "string") return { ok: false, message: photos };
  const attachedText = parseAttachedText(b.attachedText);
  const tooLong = textTooLong(typedPrompt, attachedText);
  if (tooLong) return { ok: false, message: tooLong };
  if (!typedPrompt && photos.length === 0 && !attachedText) {
    return { ok: false, message: "Type a question, or attach a photo, PDF or Word file, then press Generate." };
  }
  const ask = typedPrompt || DEFAULT_PHOTO_PROMPT[taskType];
  return {
    ok: true,
    value: {
      typedPrompt,
      hasAttachedText: Boolean(attachedText),
      // The attached file's text (e.g. a worksheet's questions) travels with the request, so each question in it is also searched for separately.
      prompt: attachedText ? `${ask}\n\n---\n${attachedText}` : ask,
      photos,
      // Retrieval is always limited to the caller's library, so ids of other people's books match nothing.
      documentIds: Array.isArray(b.documentIds) ? b.documentIds.filter(isUuid).slice(0, 200) : undefined,
      language: isAnswerLanguage(b.language) ? b.language : defaultLanguage,
      fresh: b.fresh === true,
      stream: b.stream === true,
    },
  };
}
