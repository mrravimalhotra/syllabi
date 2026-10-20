// Two numbers shown with every answer, worked out by code from what the answer was made from:
//  1. how sure we are the answers are correct and grounded in the books, without assumptions;
//  2. how much of the answer comes from the books and how much from outside them (general knowledge or the web).
// Shown as "95 : 89" with a red, amber or green colour on each. They are estimates, not guarantees.

import { splitAnswerBlocks } from "@/lib/generation/blocks";
import { withoutHandwriting } from "@/lib/rag/handwriting";
import type { AnswerCheck } from "@/types/database";

export type Level = "green" | "amber" | "red";

/** A statement of the answer that was not found in the book passages, for finding out why. */
interface OutsideStatement {
  text: string;
  /** Percent of its meaningful words found in the book passages. */
  found: number;
  /** Some of the words that were not found. */
  missing: string[];
}

/** What the numbers were worked out from: kept with the answer so a low score can be traced to its cause. */
interface ConfidenceDetails {
  /** Statements of the answer judged, and how many were found in the books. */
  statements: number;
  grounded: number;
  /** The book passages the answer was written from. */
  passages: number;
  passageChars: number;
  /** Where they came from: "exercise p1-p10 (10), textbook p1 (1)". */
  pages: string;
  /** How they were found. */
  retrieval: string;
  topSimilarity: number | null;
  coverageLow: boolean;
  usedSearchGrounding: boolean;
  weakPages: number;
  failedChecks: number;
  /** The statements furthest from the books (at most 6). */
  outside: OutsideStatement[];
}

/** An answer of the exercise that should be checked by a person: it is mostly not in the books. */
interface ReviewItem {
  /** Which block of the answer (see splitAnswerBlocks). */
  index: number;
  /** "Q3.2". */
  label: string;
  /** Percent of the answer's words found in the book passages. */
  found: number;
  level: "amber" | "red";
  reason: string;
}

export interface AnswerConfidence {
  /** 0 to 99: how sure we are the answers are correct and grounded in the books. */
  correct: number;
  /** 0 to 100: the share of the answer that comes from the books (the rest is from outside them). */
  fromBook: number;
  /** Why the numbers are what they are, most important first. */
  reasons: string[];
  /** The facts behind the numbers (answers made before these were kept have none). */
  details?: ConfidenceDetails;
  /** Answers worth checking by a person, for an exercise answered question by question. */
  review?: ReviewItem[];
}

interface ConfidencePassage {
  content: string;
  source_type?: string;
  page_number?: number | null;
  similarity?: number;
}

/** How the passages were found (see RetrievalStats). */
interface RetrievalNote {
  mode: "search" | "exercise" | "full";
  books: number;
  totalChars: number;
  sectionChunks: number;
  questions: number;
  supportChunks: number;
  topSimilarity: number | null;
}

export interface ConfidenceInput {
  text: string;
  /** The passages of the books the answer was written from. */
  context: ConfidencePassage[];
  retrieval?: RetrievalNote;
  checks: AnswerCheck[];
  /** The best passage matched the question only weakly. */
  coverageLow: boolean;
  usedSearchGrounding: boolean;
  /** Pages the answer relied on that were hard to read when scanned. */
  weakPages: number;
}

/** Green from 80, amber from 60, red below: the same for both numbers. */
export function levelOf(score: number): Level {
  return score >= 80 ? "green" : score >= 60 ? "amber" : "red";
}

const STOPWORDS = new Set(
  (
    "a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours " +
    "answer ans question explain describe following given also like called known one two three many much make made used use using may might must shall"
  ).split(" ")
);

/** A word reduced to its root, so "farms", "farming" and "farmed" match. */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 4 || !/^[a-z]+$/.test(w)) return w;
  return w.replace(/(?:ing|edly|ed|es|ly|s)$/, "") || w;
}

/** The meaningful words of a text, as roots: no filler words, no one-letter words. Hindi and Marathi words are kept whole. */
function contentWords(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  return words.filter((w) => (/^[a-z]+$/.test(w) ? w.length > 2 && !STOPWORDS.has(w) : w.length > 1)).map(stem);
}

/** The statements of an answer: its sentences, without headings, question lines, code and table rules. */
function statements(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^[|\s:-]+$/.test(l))
    // A bold line is the question being answered, restated.
    .filter((l) => !/^\*\*[^*]+\*\*:?$/.test(l))
    .flatMap((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/^\*\*Ans(?:wer)?:?\*\*:?\s*/i, "").replace(/[*_`>|]/g, "").split(/(?<=[.!?।])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

const OUTSIDE_NOTE = /not from the book|general knowledge|outside the book|not in the book|from the web|web search/i;
/** A statement is "from the book" when this share of its meaningful words are found in the book passages. */
export const GROUNDED_SHARE = 0.55;
const MIN_WORDS = 4;

interface Analysis {
  /** Percent of the answer's words that are in statements found in the book, or null when there is too little to judge. */
  share: number | null;
  statements: number;
  grounded: number;
  outside: OutsideStatement[];
}

const knownWords = (context: { content: string }[]) => new Set(contentWords(context.map((c) => withoutHandwriting(c.content)).join("\n")));

/** Judges each statement of the answer against the book passages. */
function analyse(text: string, context: { content: string }[], known = knownWords(context)): Analysis {
  let groundedWords = 0;
  let totalWords = 0;
  let statementCount = 0;
  let groundedCount = 0;
  const outside: OutsideStatement[] = [];
  for (const statement of statements(text)) {
    const words = [...new Set(contentWords(statement))];
    if (words.length < MIN_WORDS) continue;
    totalWords += words.length;
    statementCount++;
    const missing = words.filter((w) => !known.has(w));
    const found = (words.length - missing.length) / words.length;
    if (found >= GROUNDED_SHARE && !OUTSIDE_NOTE.test(statement)) {
      groundedWords += words.length;
      groundedCount++;
    } else {
      outside.push({ text: statement.slice(0, 160), found: Math.round(found * 100), missing: missing.slice(0, 8) });
    }
  }
  outside.sort((a, b) => a.found - b.found);
  return { share: totalWords === 0 ? null : Math.round((groundedWords / totalWords) * 100), statements: statementCount, grounded: groundedCount, outside: outside.slice(0, 6) };
}

/** Below this share of its words found in the books, an answer is flagged for review (below the second number, red). */
export const REVIEW_BELOW = 60;
export const REVIEW_RED_BELOW = 40;
/** An exercise has to be answered question by question for answers to be flagged. */
const MIN_BLOCKS = 2;

/** The answers (one per question) that are mostly not in the books, so a person can check them first. */
function reviewItems(text: string, context: { content: string }[]): ReviewItem[] {
  const blocks = splitAnswerBlocks(text);
  if (blocks.filter((b) => b.label !== null).length < MIN_BLOCKS || context.length === 0) return [];
  const known = knownWords(context);
  const items: ReviewItem[] = [];
  blocks.forEach((block, index) => {
    if (block.label === null) return;
    const own = analyse(block.text, context, known);
    // A short answer (True, a word) has too little to judge: judge the question it answers instead.
    const found = own.share ?? analyse(block.text.replace(/\*\*/g, " ").replace(/\bAns(?:wer)?:/gi, ". "), context, known).share;
    if (found === null || found >= REVIEW_BELOW) return;
    const general = OUTSIDE_NOTE.test(block.text);
    items.push({
      index,
      label: block.label,
      found,
      level: found < REVIEW_RED_BELOW ? "red" : "amber",
      reason: general ? "From general knowledge, not from your books." : `Only ${found}% of this answer's words are in your books.`,
    });
  });
  return items;
}

/** The percentage (0 to 100) of the answer's content found in the book passages, or null when there is too little to judge. */
export function bookShare(text: string, context: { content: string }[]): number | null {
  return analyse(text, context).share;
}

/** "exercise p1-p10 (10), textbook p1 (1)": which kinds of page the passages came from. */
function pagesSummary(context: ConfidencePassage[]): string {
  const groups = new Map<string, { pages: Set<number>; count: number }>();
  for (const c of context) {
    const g = groups.get(c.source_type ?? "unknown") ?? { pages: new Set<number>(), count: 0 };
    g.count++;
    if (c.page_number) g.pages.add(c.page_number);
    groups.set(c.source_type ?? "unknown", g);
  }
  return [...groups]
    .map(([kind, g]) => {
      const pages = [...g.pages].sort((a, b) => a - b);
      const list = pages.length === 0 ? "" : pages.length > 3 ? ` p${pages[0]}-p${pages[pages.length - 1]}` : ` ${pages.map((p) => `p${p}`).join(", ")}`;
      return `${kind}${list} (${g.count})`;
    })
    .join(", ");
}

function retrievalSummary(r: RetrievalNote | undefined): string {
  if (!r) return "not recorded";
  if (r.mode === "full") return `every page of the selected books was passed (${r.books} book${r.books === 1 ? "" : "s"}, ${r.totalChars.toLocaleString("en-IN")} characters)`;
  if (r.mode === "exercise") return `whole exercise: ${r.sectionChunks} exercise passages added; ${r.questions} questions searched in the books, ${r.supportChunks} lesson passages added`;
  return `closest passages only${r.sectionChunks > 0 ? `, ${r.sectionChunks} added whole` : ""}${r.totalChars > 0 ? ` (the selected books hold ${r.totalChars.toLocaleString("en-IN")} characters: too much to pass whole)` : ""}`;
}

/** The first number: starts from the book share, then points are added and taken off, each with its reason. */
function correctness(input: ConfidenceInput, fromBook: number, reasons: string[]): number {
  const failed = input.checks.filter((c) => !c.ok);
  const calculations = input.checks.filter((c) => c.kind === "calculation");
  let correct = 55 + 0.4 * fromBook;
  if (failed.length > 0) {
    correct -= Math.min(40, 20 * failed.length);
    reasons.unshift(`${failed.length} automatic check${failed.length === 1 ? "" : "s"} found a problem: ${failed[0].message}.`);
  } else if (calculations.length > 0) {
    correct += 5;
    reasons.push("Every calculation was checked by an exact calculator.");
  }
  if (input.checks.some((c) => c.kind === "coverage" && c.ok)) correct += 3;
  if (input.coverageLow && input.context.length > 0) {
    correct -= 10;
    reasons.push("Your books matched the question only weakly.");
  }
  if (input.usedSearchGrounding) {
    correct -= 8;
    reasons.push("A web search was used: its facts were not checked against your books.");
  }
  if (input.weakPages > 0) {
    correct -= Math.min(15, 5 * input.weakPages);
    reasons.push(`${input.weakPages} page${input.weakPages === 1 ? "" : "s"} it relied on ${input.weakPages === 1 ? "was" : "were"} hard to read when scanned.`);
  }
  // An answer mostly from outside the books can't be called well grounded.
  return fromBook < 40 ? Math.min(correct, 65) : correct;
}

/** Works out both numbers for an answer. */
export function scoreAnswer(input: ConfidenceInput): AnswerConfidence {
  const reasons: string[] = [];
  const analysis = analyse(input.text, input.context);
  let fromBook: number;
  if (input.context.length === 0) {
    fromBook = 0;
    reasons.push("No matching pages were found in your books, so this answer is from outside them.");
  } else {
    // Too little in the answer to judge by words (a True, a one-word answer): go by how well the pages matched.
    fromBook = analysis.share ?? (input.coverageLow ? 40 : 85);
  }
  if (fromBook < 80 && input.context.length > 0) reasons.push(`About ${100 - fromBook}% of the answer is not found in the pages of your books.`);

  const correct = correctness(input, fromBook, reasons);
  const review = reviewItems(input.text, input.context);
  if (review.length > 0) reasons.push(`${review.length} answer${review.length === 1 ? "" : "s"} should be checked: ${review.slice(0, 5).map((r) => r.label).join(", ")}${review.length > 5 ? " and more" : ""}.`);
  if (reasons.length === 0) reasons.push("The answer follows the pages of your books, and the automatic checks found nothing wrong.");
  const details: ConfidenceDetails = {
    statements: analysis.statements,
    grounded: analysis.grounded,
    passages: input.context.length,
    passageChars: input.context.reduce((sum, c) => sum + c.content.length, 0),
    pages: pagesSummary(input.context),
    retrieval: retrievalSummary(input.retrieval),
    topSimilarity: input.retrieval?.topSimilarity ?? null,
    coverageLow: input.coverageLow,
    usedSearchGrounding: input.usedSearchGrounding,
    weakPages: input.weakPages,
    failedChecks: input.checks.filter((c) => !c.ok).length,
    outside: analysis.outside,
  };
  return { correct: Math.max(5, Math.min(99, Math.round(correct))), fromBook, reasons, details, ...(review.length > 0 ? { review } : {}) };
}

/** The facts behind the two numbers as plain text, to read on screen or paste into a problem report. Empty for answers made before these were kept. */
export function describeDetails(c: AnswerConfidence): string {
  const d = c.details;
  if (!d) return "";
  return [
    `Confidence ${c.correct} : ${c.fromBook} (correct and grounded : from the books)`,
    `Statements judged: ${d.statements}; found in the books: ${d.grounded}; not found: ${d.statements - d.grounded}`,
    `Book passages the answer was written from: ${d.passages} (${d.passageChars.toLocaleString("en-IN")} characters)`,
    `Where they came from: ${d.pages || "none"}`,
    `How they were found: ${d.retrieval}`,
    `Closest match to the request: ${d.topSimilarity === null ? "n/a" : d.topSimilarity.toFixed(2)}${d.coverageLow ? " (weak: the books matched the request only weakly)" : ""}`,
    `Web search used: ${d.usedSearchGrounding ? "yes" : "no"}; hard-to-read pages relied on: ${d.weakPages}; automatic checks failed: ${d.failedChecks}`,
    ...(d.outside.length > 0
      ? ["Statements furthest from the books (percent of their words found in the books, and words not found):", ...d.outside.map((o) => `- ${o.found}%: ${o.text}  [not found: ${o.missing.join(", ")}]`)]
      : ["Every statement judged was found in the books."]),
  ].join("\n");
}
