// The photos, pages and file text a person attaches to a question, checked
// before anything is sent to an AI. Shared by every generation route so the
// limits (and what is said when one is hit) are the same everywhere.

import type { CompletionImage } from "@/lib/llm/types";
import { IMAGE_MIME_TYPES, looksLikeImage } from "@/lib/image-check";

const MAX_PHOTOS = 12;
// Base64 characters per request across all photos: keeps the body under
// Vercel's ~4.5 MB request limit. The browser shrinks photos before sending.
const MAX_PHOTO_BASE64_CHARS = 3_000_000;
// Typed question, text of an attached Word file, and text found in PDF pages:
// each capped, and the text of all attachments together capped too, so one
// request can't carry a huge amount of text to be paid for.
export const MAX_PROMPT_CHARS = 8_000;
const MAX_ATTACHED_TEXT_CHARS = 20_000;
const MAX_TOTAL_ATTACHED_TEXT_CHARS = 40_000;

/** The attached photos, or a message saying what is wrong with them (to show the person). */
export function parsePhotos(raw: unknown): CompletionImage[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "The attached photos weren't sent correctly. Attach them again.";
  if (raw.length > MAX_PHOTOS) return `A question takes up to ${MAX_PHOTOS} photos or pages. Remove some, or ask in two parts.`;

  let totalChars = 0;
  let totalText = 0;
  const photos: CompletionImage[] = [];
  for (const p of raw) {
    if (typeof p?.data !== "string" || typeof p?.mimeType !== "string" || !IMAGE_MIME_TYPES.has(p.mimeType)) {
      return "Each attachment must be a JPEG, PNG or WebP image. Remove the file that isn't, or attach it as a PDF or Word file.";
    }
    if (!looksLikeImage(p.data, p.mimeType)) {
      return "One of the attached pictures is damaged or isn't really a picture. Attach it again.";
    }
    totalChars += p.data.length;
    const text = typeof p.text === "string" && p.text.trim() ? p.text.slice(0, MAX_ATTACHED_TEXT_CHARS) : undefined;
    totalText += text?.length ?? 0;
    photos.push({ data: p.data, mimeType: p.mimeType, ...(text ? { text } : {}) });
  }
  if (totalChars > MAX_PHOTO_BASE64_CHARS) return "The attached photos are too large together. Attach fewer or smaller photos, or ask in two parts.";
  if (totalText > MAX_TOTAL_ATTACHED_TEXT_CHARS) return "The attached pages contain too much text for one question. Attach fewer pages, or ask in two parts.";
  return photos;
}

/** Text of attached Word files, trimmed to the limit. */
export function parseAttachedText(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, MAX_ATTACHED_TEXT_CHARS) : "";
}
