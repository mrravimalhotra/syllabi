// Checks pages sent by the browser for upload and turns them into pages to
// ingest. Pages arrive as images (photos, scans, PDF pages), as text (Word
// files), or as text with the page image (digital PDF pages).

import type { IngestPage } from "@/lib/ingestion/ingest";

export const MAX_PAGES_PER_REQUEST = 30;
const PAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// One page image, base64. The browser downscales pages to ~1600 px JPEGs, far below this.
const MAX_PAGE_BASE64_CHARS = 3 * 1024 * 1024;
// One text page from a Word file; the browser splits documents into ~3,000-character pages.
const MAX_PAGE_TEXT_CHARS = 20_000;

const SOURCE_TYPES = new Set(["textbook", "exercise", "past_paper", "notes"]);
export type SourceType = "textbook" | "exercise" | "past_paper" | "notes";

/** A page as the browser sends it; `sourceType` is the page's own kind within its book. */
export type UploadPage = (
  | { imageBase64: string; mimeType: string; hint?: string }
  | { text: string; imageBase64?: string; mimeType?: string }
) & { sourceType?: SourceType };

function isImage(page: { imageBase64?: unknown; mimeType?: unknown }): boolean {
  return (
    typeof page.imageBase64 === "string" &&
    page.imageBase64.length > 0 &&
    page.imageBase64.length <= MAX_PAGE_BASE64_CHARS &&
    typeof page.mimeType === "string" &&
    PAGE_MIME_TYPES.has(page.mimeType)
  );
}

function isValidPage(p: unknown): boolean {
  const page = p as { imageBase64?: unknown; mimeType?: unknown; text?: unknown; hint?: unknown; sourceType?: unknown } | null;
  if (!page) return false;
  if (page.sourceType !== undefined && !SOURCE_TYPES.has(page.sourceType as string)) return false;
  if (typeof page.text === "string") {
    const textOk = page.text.trim().length > 0 && page.text.length <= MAX_PAGE_TEXT_CHARS;
    // A digital PDF page may carry its image too.
    return textOk && (page.imageBase64 === undefined || isImage(page));
  }
  return isImage(page) && (page.hint === undefined || (typeof page.hint === "string" && page.hint.length <= 500));
}

/** The pages, or a message saying what is wrong with them. */
export function checkPages(pages: unknown): { pages: UploadPage[] } | { error: string } {
  if (!Array.isArray(pages) || pages.length === 0) return { error: "At least one page is required" };
  if (pages.length > MAX_PAGES_PER_REQUEST) return { error: `Upload at most ${MAX_PAGES_PER_REQUEST} pages per request` };
  const bad = pages.findIndex((p) => !isValidPage(p));
  if (bad !== -1) return { error: `Page ${bad + 1} isn't a JPEG, PNG or WebP image or Word text, or is too large.` };
  return { pages: pages as UploadPage[] };
}

/** Pages numbered from `startPageNumber`, ready to ingest. */
export function toIngestPages(pages: UploadPage[], startPageNumber: number): IngestPage[] {
  return pages.map((p, i) => {
    const pageNumber = startPageNumber + i;
    if ("text" in p) {
      return p.imageBase64 && p.mimeType ? { pageNumber, text: p.text, imageBase64: p.imageBase64, mimeType: p.mimeType } : { pageNumber, text: p.text };
    }
    return { pageNumber, imageBase64: p.imageBase64, mimeType: p.mimeType, hint: p.hint };
  });
}

export function isPageNumber(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 10_000;
}
