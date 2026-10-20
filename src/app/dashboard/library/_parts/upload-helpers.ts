import { SOURCE_TYPE_LABELS } from "@/lib/format";
import type { SourceType } from "@/types/database";
import type { BookScan } from "@/lib/ingestion/confidence";

export const SOURCE_TYPE_OPTIONS = (Object.keys(SOURCE_TYPE_LABELS) as SourceType[]).map((value) => ({ value, label: SOURCE_TYPE_LABELS[value] }));

export const MAX_PAGES = 60;
// Pages the AI has to read go one per request, so each request is short, the
// progress bar moves page by page, and one difficult page can't sink others.
// Pages that already have text (Word, digital PDFs) need no AI and go together.
const MAX_TEXT_PAGES_PER_BATCH = 10;
// Requests at once. Two keep the AI free tier's per-minute limit happy while
// halving the wait.
export const PARALLEL_REQUESTS = 2;

// Base64 characters per request. Keeps each request under Vercel's ~4.5 MB
// body limit (JSON overhead included).
const MAX_BATCH_BASE64_CHARS = 3 * 1024 * 1024;

// A page that fails on the server is tried this many times in all, waiting
// longer each time (the AI service's busy spells pass within seconds), unless
// the server says trying again can't help (e.g. the daily allowance is used up).
export const UPLOAD_ATTEMPTS = 3;
export const RETRY_WAIT_MS = 8000;
// A book still "reading" this long after it was started, and not by this tab, didn't finish.
export const STALE_UPLOAD_MS = 15 * 60 * 1000;

export interface PendingPage {
  id: string;
  /** Image pages (scans, photos, PDF pages); empty for text pages. */
  imageBase64: string;
  mimeType: string;
  /** Text pages, read in the browser from Word files. */
  text?: string;
  /** Digital PDF pages: the page's own text (no AI reading needed), sent with its image. */
  pdfText?: string;
  /** For pictures from Word files: where the picture was, for the page reader. */
  hint?: string;
  sourceType: SourceType;
  /** Original file name, shown so pages from a multi-page PDF are still traceable to their source. */
  origin: string;
  /** Set once an upload starts: the book this page goes into, and its page number there. Kept if it fails, so trying again adds it to the same book. */
  bookId?: string;
  pageNumber?: number;
  /** Why the last try failed, shown on the page. */
  failure?: string;
}

/** How far the server has got reading a book's pages in the background. */
export interface PageProgress {
  total: number;
  done: number;
  failed: number;
  problems: string[];
  waitingUntil: string | null;
}

export interface DocumentRowView {
  id: string;
  title: string;
  status: "processing" | "ready" | "failed";
  /** Background reading progress; null for books uploaded before pages were read in the background. */
  pages: PageProgress | null;
  /** How sure we are the scan was read completely (null until pages are scored, or for older books). */
  scan?: BookScan | null;
  source_type: string;
  created_at: string;
  subject: string | null;
  grade: string | null;
}

/**
 * Splits pages by the book they go into: one new book for this upload, plus
 * any books that pages left over from an earlier try belong to. Pages of
 * different kinds (a chapter and its exercises) stay in one book, each page
 * keeping its own kind.
 */
export function groupByBook(pageList: PendingPage[]): PendingPage[][] {
  const groups: PendingPage[][] = [];
  for (const page of pageList) {
    const last = groups.find((g) => g[0].bookId === page.bookId);
    if (last) {
      last.push(page);
    } else {
      groups.push([page]);
    }
  }
  return groups;
}

/**
 * Splits a book's pages into requests: each page the AI has to read on its
 * own; pages that already have text together, while their page numbers run
 * on and the request stays under a size budget.
 */
export function toRequests(pageList: PendingPage[]): PendingPage[][] {
  const batches: PendingPage[][] = [];
  let current: PendingPage[] = [];
  let currentChars = 0;
  const needsReading = (p: PendingPage) => p.text === undefined && p.pdfText === undefined;
  for (const page of pageList) {
    const size = page.text?.length ?? page.imageBase64.length + (page.pdfText?.length ?? 0);
    const last = current[current.length - 1];
    const fits =
      last &&
      !needsReading(page) &&
      !needsReading(last) &&
      current.length < MAX_TEXT_PAGES_PER_BATCH &&
      currentChars + size <= MAX_BATCH_BASE64_CHARS &&
      page.pageNumber === last.pageNumber! + 1;
    if (!fits && current.length > 0) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(page);
    currentChars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** The page as the server expects it. */
export function uploadShape({ imageBase64, mimeType, text, pdfText, hint, sourceType }: PendingPage) {
  const page = text !== undefined ? { text } : pdfText !== undefined ? { text: pdfText, imageBase64, mimeType } : { imageBase64, mimeType, hint };
  return { ...page, sourceType };
}

/** The kind most of a book's pages are, shown as the book's kind. */
export function mainKind(pageList: PendingPage[]): SourceType {
  const counts = new Map<SourceType, number>();
  for (const p of pageList) counts.set(p.sourceType, (counts.get(p.sourceType) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Keeps the phone's screen on while pages upload: a locked screen pauses the
 * page and the upload with it. Returns a release function; does nothing where
 * the browser can't (older phones), which is harmless.
 */
export async function keepScreenOn(): Promise<() => void> {
  try {
    const lock = await navigator.wakeLock?.request("screen");
    return () => void lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}
