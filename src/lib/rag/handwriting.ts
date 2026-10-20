// Pages of a workbook often have a student's handwritten answers on them. The page reader marks them
// [Handwritten: ...]. They are never part of a question or of the book: searches use the printed text only,
// and an answer is written fresh from the book, with the handwriting kept for reference.

/** "[Handwritten: ...]" or "[Handwritten answer to Q2: ...]", over several lines. */
const HANDWRITTEN = /\[Handwritten[^\]]*\]/gi;

/** The text without its handwritten parts, with the gaps tidied. */
export function withoutHandwriting(text: string): string {
  return text
    .replace(HANDWRITTEN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** What the handwritten parts say, without their markers. */
export function handwritingIn(text: string): string[] {
  return (text.match(HANDWRITTEN) ?? []).map((m) => m.replace(/^\[Handwritten[^:\]]*:?\s*/i, "").replace(/\]$/, "").trim()).filter(Boolean);
}
