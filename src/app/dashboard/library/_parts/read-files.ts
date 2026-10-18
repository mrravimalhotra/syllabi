import { downscaleImageFile, formatBytes, imageFingerprint } from "@/lib/downscale-image";
import { fileReadError } from "@/lib/file-errors";
import type { SourceType } from "@/types/database";
import { MAX_PAGES, type PendingPage } from "@/app/dashboard/library/_parts/upload-helpers";

/** What reading one file gave: its pages, and how many bytes it was before and after shrinking. */
interface ReadFile {
  pages: PendingPage[];
  originalBytes: number;
  shrunkBytes: number;
  /** Something the person should know about this file (not a failure). */
  warning?: string;
}

/**
 * Word files: the text is read right here (no page reading needed), and each
 * picture is kept as an image page with a note of where it was.
 */
async function readWord(file: File, sourceType: SourceType): Promise<ReadFile> {
  const { readDocx } = await import("@/lib/docx-to-text");
  const { textPages, pictures, skippedPictures } = await readDocx(file);
  const warning =
    skippedPictures.length > 0
      ? `${file.name}: ${skippedPictures.length} picture(s) are in a format that can't be read. ` +
        "If they matter, save the file as PDF in Word and upload the PDF instead."
      : undefined;
  const pages: PendingPage[] = [
    ...pictures.map((picture, i) => ({
      id: `${file.name}-pic-${i}-${Date.now()}`,
      imageBase64: picture.imageBase64,
      mimeType: picture.mimeType,
      hint: picture.hint,
      sourceType,
      origin: `${file.name} (picture ${i + 1})`,
    })),
    ...textPages.map((text, i) => ({
      id: `${file.name}-${i}-${Date.now()}`,
      imageBase64: "",
      mimeType: "",
      text,
      sourceType,
      origin: textPages.length > 1 ? `${file.name} (part ${i + 1})` : file.name,
    })),
  ];
  return { pages, originalBytes: 0, shrunkBytes: 0, warning };
}

/** PDFs: pdf.js is large, so it is loaded only when a PDF is picked. Digital PDFs carry their own text, so those pages need no AI reading. */
async function readPdf(file: File, sourceType: SourceType): Promise<ReadFile> {
  const { readPdfPages } = await import("@/lib/pdf-to-images");
  const pdfPages = await readPdfPages(file);
  const pages = pdfPages.map((p, i) => ({
    id: `${file.name}-${i}-${Date.now()}`,
    imageBase64: p.imageBase64,
    mimeType: p.mimeType,
    pdfText: p.text,
    sourceType,
    origin: pdfPages.length > 1 ? `${file.name} (p.${i + 1})` : file.name,
  }));
  return { pages, originalBytes: file.size, shrunkBytes: pdfPages.reduce((sum, p) => sum + (p.bytes ?? 0), 0) };
}

async function readPhoto(file: File, sourceType: SourceType): Promise<ReadFile> {
  const downscaled = await downscaleImageFile(file);
  const page = {
    id: `${file.name}-${Date.now()}`,
    imageBase64: downscaled.imageBase64,
    mimeType: downscaled.mimeType,
    sourceType,
    origin: file.name,
  };
  return { pages: [page], originalBytes: file.size, shrunkBytes: downscaled.bytes ?? 0 };
}

async function readOne(file: File, sourceType: SourceType): Promise<ReadFile> {
  try {
    if (file.name.toLowerCase().endsWith(".docx")) return await readWord(file, sourceType);
    if (file.type === "application/pdf") return await readPdf(file, sourceType);
    return await readPhoto(file, sourceType);
  } catch (err) {
    throw new Error(fileReadError(file, err));
  }
}

const fingerprint = (p: PendingPage) => imageFingerprint(p.text ?? p.pdfText ?? p.imageBase64);

export interface PreparedFiles {
  /** The pages already chosen plus the new ones, at most MAX_PAGES. */
  pages: PendingPage[];
  /** Something to tell the person (too many pages, or pictures that can't be read), or null. */
  warning: string | null;
  /** A short note about shrinking, skipped duplicates and pages needing no AI, or null. */
  note: string | null;
}

/** The note under the drop area: what was shrunk, skipped or needs no AI reading. */
function describe(newPages: PendingPage[], unique: PendingPage[], originalBytes: number, shrunkBytes: number): string | null {
  const notes: string[] = [];
  if (originalBytes > 0 && shrunkBytes > 0 && shrunkBytes < originalBytes) {
    notes.push(`Shrunk from ${formatBytes(originalBytes)} to ${formatBytes(shrunkBytes)} for a faster upload.`);
  }
  const duplicates = newPages.length - unique.length;
  if (duplicates > 0) notes.push(`${duplicates} duplicate page${duplicates > 1 ? "s" : ""} skipped.`);
  const codeRead = unique.filter((p) => p.pdfText !== undefined).length;
  if (codeRead > 0) {
    notes.push(
      `${codeRead} PDF page${codeRead > 1 ? "s have" : " has"} typed text, so ${codeRead > 1 ? "they need" : "it needs"} no AI reading: quicker, and it uses none of your monthly allowance.`
    );
  }
  return notes.length ? notes.join(" ") : null;
}

/** Reads the chosen files into pages, skipping any photo already picked (it would be read, and paid for, twice). Throws a plain message if a file can't be read. */
export async function prepareFiles(files: File[], sourceType: SourceType, current: PendingPage[]): Promise<PreparedFiles> {
  const newPages: PendingPage[] = [];
  let originalBytes = 0;
  let shrunkBytes = 0;
  let warning: string | null = null;
  for (const file of files) {
    const read = await readOne(file, sourceType);
    newPages.push(...read.pages);
    originalBytes += read.originalBytes;
    shrunkBytes += read.shrunkBytes;
    warning = read.warning ?? warning;
  }

  const seen = new Set(current.map(fingerprint));
  const unique = newPages.filter((p) => {
    const key = fingerprint(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const combined = [...current, ...unique];
  if (combined.length > MAX_PAGES) {
    warning =
      `You chose ${combined.length} pages, but one upload takes at most ${MAX_PAGES}. The first ${MAX_PAGES} were added; ` +
      "upload the rest afterwards as a separate book.";
  }
  return { pages: combined.slice(0, MAX_PAGES), warning, note: describe(newPages, unique, originalBytes, shrunkBytes) };
}
