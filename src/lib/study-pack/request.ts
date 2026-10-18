import { parsePhotos } from "@/lib/generation/attachments";
import { isAnswerLanguage, type AnswerLanguage } from "@/lib/generation/language";
import { isUuid } from "@/lib/validate";

type Photos = Exclude<ReturnType<typeof parsePhotos>, string>;

export interface StudyPackRequest {
  /** The chapter: a book from My books. */
  documentId: string | undefined;
  /** Capped before it is used to find a saved copy, so what is remembered is what was sent to the AI. */
  focus: string | undefined;
  language: AnswerLanguage;
  /** Attached pages, used when no book is chosen. */
  photos: Photos;
  /** Ask for a new pack even if a saved one matches. */
  fresh: boolean;
}

/** Checks a request for a study pack and returns it cleaned up, or the message to show. */
export function parseStudyPackRequest(body: unknown, defaultLanguage: AnswerLanguage): { ok: true; value: StudyPackRequest } | { ok: false; message: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, message: "Your request couldn't be read. It may be too large (try fewer or smaller attachments) or the connection dropped. Try again." };
  }
  const b = body as Record<string, unknown>;
  const given = b.documentId;
  if (given !== undefined && given !== null && given !== "" && !(typeof given === "string" && isUuid(given))) {
    return { ok: false, message: "That book wasn't recognised. Reload the page and choose it again." };
  }
  const documentId = typeof given === "string" && given !== "" ? given : undefined;
  const photos = parsePhotos(b.photos);
  if (typeof photos === "string") return { ok: false, message: photos };
  if (!documentId && photos.length === 0) {
    return { ok: false, message: "Choose a book under “Search these books”, or attach photos or a PDF of the chapter, then press Generate." };
  }
  return {
    ok: true,
    value: {
      documentId,
      focus: typeof b.focus === "string" ? b.focus.trim().slice(0, 1_000) : undefined,
      language: isAnswerLanguage(b.language) ? b.language : defaultLanguage,
      photos,
      fresh: b.fresh === true,
    },
  };
}
