// How sure we are that a scanned page was read completely and correctly, from what can be measured:
// the picture (sharp, dark, faded, small), the text that came out (garbled, nearly empty, "[illegible]"),
// and the reader's own rating of the page. Page scores roll up into one score per book.
import type { ImageStats } from "@/lib/ingestion/image-quality";

type PageIssue =
  | "blurry"
  | "slightly_blurry"
  | "too_dark"
  | "faded"
  | "low_resolution"
  | "garbled"
  | "illegible_words"
  | "very_little_text"
  | "blank"
  | "reader_unsure";

// A page scoring under 60 is "weak" (worth scanning again): page_read_summary in migration 23 lists those.

// Measured on real scans (the sample chapter) and on copies of them made blurred, dark, faded and small:
// sharp pages have an edge-to-contrast ratio of about 0.9 to 1.2, a little blur 0.55 to 0.75, real blur under 0.2.
export const BLURRY_RATIO = 0.3;
export const SLIGHTLY_BLURRY_RATIO = 0.62;
export const DARK_BRIGHTNESS = 110;
export const FADED_CONTRAST = 18;
export const LOW_SHORT_SIDE = 450;
export const SMALL_SHORT_SIDE = 650;

const PENALTY: Record<PageIssue, number> = {
  blurry: 45,
  slightly_blurry: 15,
  too_dark: 30,
  faded: 30,
  low_resolution: 30,
  garbled: 25,
  illegible_words: 0, // by count, below
  very_little_text: 25,
  blank: 0, // fixed score, below
  reader_unsure: 0, // a cap, below
};

/** What the reader (the AI that transcribes the page) says about how legible the page was. */
export type Legibility = "clear" | "fair" | "poor";

const LEGIBILITY_LINE = /^\s*\[Legibility:\s*(clear|fair|poor)\s*\]\s*$/im;
const ILLEGIBLE = /\[illegible\]/gi;
/** Letters and digits of any script, spaces, and the usual punctuation and symbols of schoolbooks. */
const NORMAL_CHAR = /[\p{L}\p{N}\p{M}\s.,;:!?'"’‘“”()[\]{}\-–—_/\\+=<>%&*#@^~|°×÷√²³½¼¾₹$€£…•·→←↑↓≤≥≠≈∞π∫∑]/u;

/** Takes the reader's "[Legibility: ...]" line out of the page text. Returns the clean text and the rating (null when it gave none). */
export function takeLegibility(text: string): { text: string; legibility: Legibility | null } {
  const match = LEGIBILITY_LINE.exec(text);
  if (!match) return { text, legibility: null };
  return { text: text.replace(LEGIBILITY_LINE, "").trim(), legibility: match[1].toLowerCase() as Legibility };
}

export interface PageEvidence {
  /** The page text as read. */
  text: string;
  /** The picture measurements; null when the text came with the file (Word, a digital PDF) and no picture was read. */
  image: ImageStats | null;
  legibility: Legibility | null;
}

export interface PageConfidence {
  score: number;
  issues: PageIssue[];
}

function imageIssues(image: ImageStats): PageIssue[] {
  const issues: PageIssue[] = [];
  const ratio = image.contrast > 0 ? image.sharpness / image.contrast : 0;
  if (ratio < BLURRY_RATIO) issues.push("blurry");
  else if (ratio < SLIGHTLY_BLURRY_RATIO) issues.push("slightly_blurry");
  if (image.brightness < DARK_BRIGHTNESS) issues.push("too_dark");
  else if (image.contrast < FADED_CONTRAST) issues.push("faded");
  if (image.shortSide < LOW_SHORT_SIDE) issues.push("low_resolution");
  else if (image.shortSide < SMALL_SHORT_SIDE) issues.push("slightly_blurry");
  return issues;
}

function textIssues(text: string): { issues: PageIssue[]; illegible: number } {
  const issues: PageIssue[] = [];
  const illegible = (text.match(ILLEGIBLE) ?? []).length;
  if (illegible > 0) issues.push("illegible_words");
  const visible = text.replace(ILLEGIBLE, "").replace(/\[(?:Figure|Box|Map|Questions?|Worksheet|Handwritten|Answer space)[^\]]*\]/gi, "").replace(/^Page:.*$/gim, "").replace(/\s+/g, " ").trim();
  const chars = [...visible];
  const odd = chars.filter((c) => !NORMAL_CHAR.test(c) || c === "�").length;
  if (chars.length >= 30 && odd / chars.length > 0.06) issues.push("garbled");
  else if (chars.length < 40) issues.push("very_little_text");
  return { issues, illegible };
}

/** Scores one page, 0 to 100, with the reasons it lost points. */
export function scorePage(evidence: PageEvidence): PageConfidence {
  const text = evidence.text.trim();
  // A page the reader found empty is probably blank or a cover; we can't be sure, so it counts a little below fair.
  if (text === "" || text === "[EMPTY PAGE]") return { score: 55, issues: ["blank"] };

  const { issues: fromText, illegible } = textIssues(text);
  const issues = [...new Set([...(evidence.image ? imageIssues(evidence.image) : []), ...fromText])];
  // A short page in a good picture is probably a heading page or a diagram; only call it weak when something else is wrong too.
  if (issues.length === 1 && issues[0] === "very_little_text") return { score: 85, issues };

  let score = 100 - issues.reduce((sum, i) => sum + PENALTY[i], 0) - Math.min(40, illegible * 8);
  if (evidence.legibility === "poor") {
    score = Math.min(score, 45);
    issues.push("reader_unsure");
  } else if (evidence.legibility === "fair") {
    score = Math.min(score, 82);
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), issues };
}

/** One book's saved page scores, summed up in the database. */
export interface PageReadSummary {
  pages: number;
  /** Average page score of the pages read. */
  average: number;
  weak_pages: number[];
  issues: PageIssue[];
}

type ScanLevel = "high" | "medium" | "low";

export interface BookScan {
  /** 0 to 100: the average page score, counting pages that could not be read as 0. */
  score: number;
  level: ScanLevel;
  pages: number;
  /** Pages worth scanning again (weak score), in page order. */
  weakPages: number[];
  /** Pages that could not be read at all. */
  failedPages: number;
  /** What looked wrong, in plain words. */
  problems: string[];
  /** What to do, or null when nothing is needed. */
  advice: string | null;
}

const ISSUE_WORDS: Record<PageIssue, string> = {
  blurry: "out of focus",
  slightly_blurry: "a little blurry or small",
  too_dark: "too dark",
  faded: "faded, with little contrast",
  low_resolution: "very low resolution",
  garbled: "text came out garbled",
  illegible_words: "some words could not be made out",
  very_little_text: "very little text found",
  blank: "looks blank",
  reader_unsure: "hard to read",
};

export const MEDIUM_SCORE = 80;
export const LOW_SCORE = 65;
/** When this share of the pages (or more) are weak the book as a whole is called low. */
export const WEAK_SHARE_FOR_LOW = 0.3;

const listPages = (pages: number[]) => (pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.slice(0, 8).join(", ")}${pages.length > 8 ? " and more" : ""}`);

/**
 * The confidence in a whole book. `total` and `failed` come from the reading queue (pages queued, pages that could not be read):
 * a page that could not be read pulls the score down as a page scoring 0 would.
 */
export function summariseBook(summary: PageReadSummary, queue: { total: number; failed: number } | null): BookScan {
  const failed = queue?.failed ?? 0;
  const counted = summary.pages + failed;
  const score = counted === 0 ? 0 : Math.round((summary.average * summary.pages) / counted);
  const weakPages = summary.weak_pages;
  const weakShare = counted === 0 ? 0 : (weakPages.length + failed) / counted;

  const level: ScanLevel = score < LOW_SCORE || weakShare >= WEAK_SHARE_FOR_LOW ? "low" : score < MEDIUM_SCORE || weakPages.length > 0 || failed > 0 ? "medium" : "high";
  const problems = summary.issues.map((i) => ISSUE_WORDS[i]).filter(Boolean);

  const tips = "Scan it flat, in bright even light, holding the phone straight above the page and steady, with no shadows or fingers over the text.";
  const where = weakPages.length > 0 ? listPages(weakPages) : null;
  const advice =
    level === "low"
      ? `Low confidence: some of this book may be missing or wrong in answers. Re-scan ${where ? `${where}${failed ? " and the pages that could not be read" : ""}` : "the book"} and upload a new copy. ${tips}`
      : level === "medium" && (where || failed)
        ? `${where ? `${where[0].toUpperCase()}${where.slice(1)} ${weakPages.length === 1 ? "is" : "are"} unclear` : `${failed} page${failed === 1 ? "" : "s"} could not be read`}. For the best answers, re-scan ${where ? "it" : "them"} and upload a new copy. ${tips}`
        : null;

  return { score, level, pages: counted, weakPages, failedPages: failed, problems, advice };
}
