// Checks that a quote the AI gives as "evidence" really is in the chapter.
// Invented quotes are the worst failure for a study tool, so every quote is
// marked "found" or "check this" on screen and in the PDF.

/** Lower case, letters and digits only, single spaces; curly quotes and dashes don't matter. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    // \p{M}: Devanagari vowel signs (matras) are marks, not letters.
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

const SHINGLE = 4;

function shingles(words: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(" "));
  return out;
}

// One chapter is checked many times in a row: keep its normalised form.
let cached: { source: string; text: string; grams: Set<string> | null } | null = null;

function chapter(chapterText: string) {
  if (cached?.source !== chapterText) cached = { source: chapterText, text: normalise(chapterText), grams: null };
  return cached;
}

/**
 * True if the quote appears in the chapter: exactly (ignoring case and
 * punctuation), or nearly (at least 80% of its four-word runs appear, which
 * allows for OCR slips and a dropped word or two).
 */
export function evidenceFound(quote: string, chapterText: string): boolean {
  // "A... B" quotes two passages: each part must be found.
  const parts = quote.split(/\.\.\.|…/).map(normalise).filter(Boolean);
  return parts.length > 0 && parts.every((part) => partFound(part, chapterText));
}

function partFound(q: string, chapterText: string): boolean {
  const entry = chapter(chapterText);
  if (entry.text.includes(q)) return true;

  const words = q.split(" ");
  if (words.length < SHINGLE) return false;
  entry.grams ??= shingles(entry.text.split(" "));
  const quoteGrams = [...shingles(words)];
  const hits = quoteGrams.filter((g) => entry.grams!.has(g)).length;
  return hits / quoteGrams.length >= 0.8;
}
