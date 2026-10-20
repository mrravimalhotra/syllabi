// Two numbers shown with every answer, worked out by code from what the answer was made from:
//  1. how sure we are the answers are correct and grounded in the books, without assumptions;
//  2. how much of the answer comes from the books and how much from outside them (general knowledge or the web).
// Shown as "95 : 89" with a red, amber or green colour on each. They are estimates, not guarantees.

import { withoutHandwriting } from "@/lib/rag/handwriting";
import type { AnswerCheck } from "@/types/database";

export type Level = "green" | "amber" | "red";

export interface AnswerConfidence {
  /** 0 to 99: how sure we are the answers are correct and grounded in the books. */
  correct: number;
  /** 0 to 100: the share of the answer that comes from the books (the rest is from outside them). */
  fromBook: number;
  /** Why the numbers are what they are, most important first. */
  reasons: string[];
}

export interface ConfidenceInput {
  text: string;
  /** The passages of the books the answer was written from. */
  context: { content: string }[];
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
const GROUNDED_SHARE = 0.55;
const MIN_WORDS = 4;

/** The percentage (0 to 100) of the answer's content found in the book passages, or null when there is too little to judge. */
export function bookShare(text: string, context: { content: string }[]): number | null {
  const known = new Set(contentWords(context.map((c) => withoutHandwriting(c.content)).join("\n")));
  let grounded = 0;
  let total = 0;
  for (const statement of statements(text)) {
    const words = [...new Set(contentWords(statement))];
    if (words.length < MIN_WORDS) continue;
    total += words.length;
    const found = words.filter((w) => known.has(w)).length / words.length;
    if (found >= GROUNDED_SHARE && !OUTSIDE_NOTE.test(statement)) grounded += words.length;
  }
  return total === 0 ? null : Math.round((grounded / total) * 100);
}

/** Works out both numbers for an answer. */
export function scoreAnswer(input: ConfidenceInput): AnswerConfidence {
  const reasons: string[] = [];
  let fromBook: number;
  if (input.context.length === 0) {
    fromBook = 0;
    reasons.push("No matching pages were found in your books, so this answer is from outside them.");
  } else {
    // Too little in the answer to judge by words (a True, a one-word answer): go by how well the pages matched.
    fromBook = bookShare(input.text, input.context) ?? (input.coverageLow ? 40 : 85);
  }
  if (fromBook < 80 && input.context.length > 0) reasons.push(`About ${100 - fromBook}% of the answer is not found in the pages of your books.`);

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
  if (fromBook < 40) correct = Math.min(correct, 65);
  if (reasons.length === 0) reasons.push("The answer follows the pages of your books, and the automatic checks found nothing wrong.");
  return { correct: Math.max(5, Math.min(99, Math.round(correct))), fromBook, reasons };
}
