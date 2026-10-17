// Checks the pages the browser sends for upload. Pages arrive as images (photos, scans, PDF pages), as text (Word
// files), or as text with the page image (digital PDF pages).

import { IMAGE_MIME_TYPES, looksLikeImage } from "@/lib/image-check";
import { SOURCE_TYPES, type SourceType } from "@/types/database";

const MAX_PAGES_PER_REQUEST = 30;
// One page image, base64. The browser downscales pages to ~1600 px JPEGs, far below this.
const MAX_PAGE_BASE64_CHARS = 3 * 1024 * 1024;
// One text page from a Word file; the browser splits documents into ~3,000-character pages.
const MAX_PAGE_TEXT_CHARS = 20_000;
// Everything in one request: under the hosting platform's ~4.5 MB request body limit.
const MAX_REQUEST_CHARS = 4_000_000;

/** A page as the browser sends it; `sourceType` is the page's own kind within its book. */
export type UploadPage = (
  | { imageBase64: string; mimeType: string; hint?: string }
  | { text: string; imageBase64?: string; mimeType?: string }
) & { sourceType?: SourceType };

/** What is wrong with one page, or null if it is fine. */
function problemWith(p: unknown): string | null {
  const page = p as { imageBase64?: unknown; mimeType?: unknown; text?: unknown; hint?: unknown; sourceType?: unknown } | null;
  if (!page || typeof page !== "object") return "wasn't sent correctly";
  if (page.sourceType !== undefined && !SOURCE_TYPES.includes(page.sourceType as SourceType)) return "has an unknown kind of material";

  const hasImage = page.imageBase64 !== undefined;
  if (hasImage) {
    if (typeof page.imageBase64 !== "string" || page.imageBase64.length === 0) return "has an empty picture";
    if (page.imageBase64.length > MAX_PAGE_BASE64_CHARS) return "is too large (over 3 MB after shrinking). Add it again as a smaller photo";
    if (typeof page.mimeType !== "string" || !IMAGE_MIME_TYPES.has(page.mimeType)) return "isn't a JPEG, PNG or WebP picture";
    if (!looksLikeImage(page.imageBase64, page.mimeType)) return "is damaged or isn't really a picture";
  }
  if (typeof page.text === "string") {
    if (page.text.trim().length === 0) return "has no text";
    if (page.text.length > MAX_PAGE_TEXT_CHARS) return `has too much text on one page (over ${MAX_PAGE_TEXT_CHARS.toLocaleString("en-IN")} characters)`;
    return null;
  }
  if (!hasImage) return "has neither a picture nor text";
  if (page.hint !== undefined && (typeof page.hint !== "string" || page.hint.length > 500)) return "has a note that is too long";
  return null;
}

/** The pages, or a message saying which page is wrong and why (to show the person). */
export function checkPages(pages: unknown): { pages: UploadPage[] } | { error: string } {
  if (!Array.isArray(pages) || pages.length === 0) return { error: "No pages were sent. Add at least one photo, PDF or Word file." };
  if (pages.length > MAX_PAGES_PER_REQUEST) return { error: `Too many pages at once (${pages.length}). Send at most ${MAX_PAGES_PER_REQUEST} at a time.` };
  for (let i = 0; i < pages.length; i++) {
    const problem = problemWith(pages[i]);
    if (problem) return { error: `Page ${i + 1} ${problem}.` };
  }
  const total = (pages as { imageBase64?: string; text?: string }[]).reduce((sum, p) => sum + (p.imageBase64?.length ?? 0) + (p.text?.length ?? 0), 0);
  if (total > MAX_REQUEST_CHARS) return { error: "These pages are too large to send together. Upload fewer pages at a time." };
  return { pages: pages as UploadPage[] };
}

export function isPageNumber(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 10_000;
}
