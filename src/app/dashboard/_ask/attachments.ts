import { downscaleImageFile, imageFingerprint, type DownscaledImage } from "@/lib/downscale-image";
import { fileReadError } from "@/lib/file-errors";
import { MAX_ATTACHMENT_BASE64_CHARS, MAX_PHOTOS } from "@/app/dashboard/_ask/constants";

/** A PDF with more pages than a question can carry: the person chooses which pages to attach. */
export interface LongPdf {
  file: File;
  total: number;
}

export type AttachmentResult =
  | { error: string }
  | { photos: DownscaledImage[]; docs: { name: string; text: string }[]; notes: string[]; longPdfs: LongPdf[] };

/** How many more photos or pages the question can take. */
export const pagesLeft = (current: DownscaledImage[]) => Math.max(0, MAX_PHOTOS - current.length);

/** Adds images to those already attached, within the number and size a question can carry, skipping repeats. */
function addWithinLimits(current: DownscaledImage[], images: DownscaledImage[]): { photos: DownscaledImage[]; notes: string[] } {
  const kept: DownscaledImage[] = [...current];
  let size = kept.reduce((sum, p) => sum + p.imageBase64.length, 0);
  let dropped = 0;
  // Skip a photo or page that is already attached.
  const seen = new Set(kept.map((p) => imageFingerprint(p.imageBase64)));
  for (const image of images) {
    const fingerprint = imageFingerprint(image.imageBase64);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    if (kept.length < MAX_PHOTOS && size + image.imageBase64.length <= MAX_ATTACHMENT_BASE64_CHARS) {
      kept.push(image);
      size += image.imageBase64.length;
    } else dropped++;
  }
  const notes = dropped
    ? [
        `${dropped} ${dropped === 1 ? "page or photo was" : "pages or photos were"} not attached: a question takes up to ${MAX_PHOTOS} photos or pages, and a limited total size. ` +
          "Ask the rest in a second question.",
      ]
    : [];
  return { photos: kept, notes };
}

/**
 * Reads the files chosen for a question (photos, PDFs, Word files) and adds
 * their pages to the photos already attached, within the number and size a
 * question can carry. A PDF with too many pages is not cut: it is handed back
 * so the person can choose which pages. Returns what to show, or one plain
 * sentence on what failed.
 */
export async function readAttachments(files: File[], current: DownscaledImage[]): Promise<AttachmentResult> {
  const images: DownscaledImage[] = [];
  const docs: { name: string; text: string }[] = [];
  const notes: string[] = [];
  const longPdfs: LongPdf[] = [];
  let failingFile: File = files[0];
  try {
    for (const file of files) {
      failingFile = file;
      const name = file.name.toLowerCase();
      if (name.endsWith(".docx")) {
        const { readDocx } = await import("@/lib/docx-to-text");
        const content = await readDocx(file);
        docs.push({ name: file.name, text: content.textPages.join("\n\n") });
        images.push(...content.pictures);
        if (content.skippedPictures.length) notes.push(`${file.name}: some pictures can't be read; save it as PDF if they matter.`);
      } else if (file.type === "application/pdf") {
        const { countPdfPages, readPdfPages } = await import("@/lib/pdf-to-images");
        const total = await countPdfPages(file);
        if (total > MAX_PHOTOS) longPdfs.push({ file, total });
        else images.push(...(await readPdfPages(file)));
      } else if (file.type.startsWith("image/")) {
        images.push(await downscaleImageFile(file));
      } else {
        notes.push(`${file.name}: not a photo, PDF or Word file, so it was skipped.`);
      }
    }
  } catch (err) {
    return { error: fileReadError(failingFile, err) };
  }

  const added = addWithinLimits(current, images);
  return { photos: added.photos, docs, notes: [...notes, ...added.notes], longPdfs };
}

/** Reads the chosen pages (first to last, counting from 1) of a long PDF and adds them to the photos already attached. */
export async function readPdfRange(
  file: File,
  first: number,
  last: number,
  current: DownscaledImage[]
): Promise<{ error: string } | { photos: DownscaledImage[]; notes: string[] }> {
  try {
    const { readPdfPages } = await import("@/lib/pdf-to-images");
    return addWithinLimits(current, await readPdfPages(file, last - first + 1, first));
  } catch (err) {
    return { error: fileReadError(file, err) };
  }
}
