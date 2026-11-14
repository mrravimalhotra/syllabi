// "Solve all exercise questions" over a whole book is too much for one answer (a request may run 5 minutes), so
// the books are cut into parts: the pages that hold questions, a few at a time, in order. Each part is its own
// short request; the answers are put together afterwards (api/documents/combine).

export interface PartChunk {
  document_id: string;
  page_number: number | null;
  content: string;
  source_type: string;
}

export interface SolvePart {
  /** What the person sees: "History Unit 1: pages 12 to 14". */
  label: string;
  /** The request for this part. */
  prompt: string;
}

/** Pages in one part to start with, the most text in one part, and the most parts (more pages go in each when a book is long). */
const PAGES_PER_PART = 3;
const CHARS_PER_PART = 9000;
const MAX_PARTS = 40;
/** A request can name at most this many pages (lib/rag/whole-pages.ts). */
const MOST_PAGES = 12;

/** What a part with no questions answers, so it can be left out of the combined answer. */
const NO_QUESTIONS = "No questions on these pages.";
export const isNoQuestions = (text: string) => /^\W*no questions on (?:these|this) pages?\b/i.test(text.trim());

// "Exercise" counts only as a heading at the start of a line: a story saying "regular exercise" is not an exercise page (14 Nov:
// such pages each became a part that cost a full answer to say "no questions here").
const ASKS = /^\s*(?:#+\s*|\*\*)?exercises?\b|\?\s*$|^\s*(?:Q\.?\s*\d+|\d{1,2}[.)]|\(?[a-z]\)|\(?[ivx]{1,4}\))\s+\S.*\?|\b(?:fill in the blanks?|true or false|match the (?:following|columns?)|answer the following|choose the correct|tick the correct|give reasons?|short answer|long answer|answer in (?:brief|short|detail|one word)|name the following|define the following|warm[- ]?up|source analysis|think and answer|let us (?:recall|revise))/im;

/** Whether a page's text has questions on it (question marks at line ends, numbered questions, the usual exercise headings). */
function hasQuestions(text: string): boolean {
  const marks = (text.match(/\?/g) ?? []).length;
  return marks >= 2 || ASKS.test(text);
}

const pagesText = (from: number, to: number) => (from === to ? `page ${from}` : `pages ${from} to ${to}`);

const HOW =
  "Answer every kind of question asked: fill in the blanks, true or false, multiple choice, assertion and reason, match the following, ordering, " +
  "picture and passage based questions with all their sub-parts, one-word answers, answer in brief or in short, answer in detail (justify, explain, describe, do you think), " +
  "and research or find-out questions. Do not skip or merge any question. Label each answer with its section and number (for example Q3.2). " +
  "Write each answer from the books, in your own words, and as long as the question asks for.";

/** The request for one part of a book (or the whole book, when its pages aren't numbered). */
function partPrompt(book: string, pages: { from: number; to: number } | null): string {
  if (!pages) return `Solve every question of every exercise in "${book}", in order, to the last page, and also the questions inside the lessons (Warm-up, Source Analysis and similar boxes). ${HOW}`;
  return (
    `Solve every question printed on ${pagesText(pages.from, pages.to)} of "${book}", in order: the exercise questions and the questions inside lesson boxes (Warm-up, Source Analysis and similar). ` +
    `${HOW} Answer only the questions printed on ${pages.from === pages.to ? "that page" : "those pages"}: one that starts there and runs onto the next page is answered in full; one that began on an earlier page is left out. ` +
    `If there are no questions there, reply with only: ${NO_QUESTIONS}`
  );
}

/** One book's question pages in runs of at most `perPart` consecutive pages and CHARS_PER_PART of text. */
function runs(pages: { page: number; chars: number }[], perPart: number): { from: number; to: number }[] {
  const out: { from: number; to: number; chars: number; count: number }[] = [];
  for (const p of pages) {
    const last = out[out.length - 1];
    if (last && p.page === last.to + 1 && last.count < perPart && last.chars + p.chars <= CHARS_PER_PART * (perPart / PAGES_PER_PART)) {
      last.to = p.page;
      last.chars += p.chars;
      last.count++;
    } else out.push({ from: p.page, to: p.page, chars: p.chars, count: 1 });
  }
  return out;
}

/**
 * The parts to solve, book by book in the order given, pages in order. A page counts when it is an exercise page or
 * its text has questions; a book where no page does is taken whole, a few pages at a time. A book without page
 * numbers is one part.
 */
export function solveParts(books: { id: string; title: string }[], chunks: PartChunk[]): SolvePart[] {
  const perBook = books.map((book) => {
    const own = chunks.filter((c) => c.document_id === book.id);
    if (own.length === 0) return { book, pages: [] as { page: number; chars: number }[], unnumbered: false };
    if (own.some((c) => c.page_number === null)) return { book, pages: [], unnumbered: true };
    const byPage = new Map<number, { text: string; exercise: boolean }>();
    for (const c of own) {
      const page = byPage.get(c.page_number!) ?? { text: "", exercise: false };
      byPage.set(c.page_number!, { text: `${page.text}\n${c.content}`, exercise: page.exercise || c.source_type === "exercise" });
    }
    const all = [...byPage.entries()].sort((a, b) => a[0] - b[0]);
    const asking = all.filter(([, p]) => p.exercise || hasQuestions(p.text));
    return { book, pages: (asking.length > 0 ? asking : all).map(([page, p]) => ({ page, chars: p.text.length })), unnumbered: false };
  });
  const build = (perPart: number) =>
    perBook.flatMap(({ book, pages, unnumbered }): SolvePart[] =>
      unnumbered
        ? [{ label: book.title, prompt: partPrompt(book.title, null) }]
        : runs(pages, perPart).map((r) => ({ label: `${book.title}: ${pagesText(r.from, r.to)}`, prompt: partPrompt(book.title, r) }))
    );
  let parts = build(PAGES_PER_PART);
  for (let perPart = PAGES_PER_PART * 2; parts.length > MAX_PARTS && perPart <= MOST_PAGES; perPart *= 2) parts = build(perPart);
  return parts;
}
