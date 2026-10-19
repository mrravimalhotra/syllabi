// The "legacy" build (not the default package-root export) is the variant meant
// to run safely wherever it's evaluated, including Next.js's server-side render
// pass of this client component — the default build logs a Node-environment
// warning in that case even though reading a PDF only ever runs in the browser,
// invoked from a file-input change handler.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { MAX_DIMENSION, encodeCanvas } from "@/lib/downscale-image";

// Rendered once per uploaded PDF, entirely client-side — the worker file is a
// static copy of node_modules/pdfjs-dist/build/pdf.worker.min.mjs in /public
// (re-copy it if pdfjs-dist is ever upgraded).
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// A 30-page batch's payload scales directly with this — 1.5x is ample for OCR
// legibility without ballooning the upload (2x nearly doubled real-world
// payloads on multi-page, full-color scanned textbooks).
// Longest side and JPEG quality are shared with photos (downscale-image.ts).
const RENDER_SCALE = 1.5;

/**
 * One PDF page. Every page has its rendered image (answers are always written
 * from the page itself, which keeps fractions, diagrams and layout exact);
 * pages with a usable text layer also carry their text, so the AI doesn't have
 * to read them.
 */
export interface PdfPage {
  /** Exact text from the PDF itself (no AI reading needed); absent for scanned pages. */
  text?: string;
  imageBase64: string;
  mimeType: string;
  originalBytes?: number;
  bytes?: number;
}

// Older Hindi and Marathi PDFs use pre-Unicode fonts whose text layer is
// gibberish ("vkt dh rkjh[k"); their pages must be read from the image.
const LEGACY_INDIC_FONT = /kruti|devlys|chanakya|walkman|shusha|akruti|shivaji|aps-?dv|kundli|dv-?ttsurekh/i;
// Private-use characters and "(cid:12)" codes mean the text can't be decoded.
const UNDECODABLE = /[\uE000-\uF8FF\uFFFD]|\(cid:\d+\)/g;
// Equation fonts often come out as Odia, Tamil, Telugu, Kannada, Malayalam or
// Sinhala letters ("ଷ௫" for 3x): school books in these scripts aren't
// supported, so any of them means a broken equation and the AI reads the page.
const BROKEN_MATH = /[\u0B00-\u0DFF]/;

/** Undoes PDF ligature and maths-font quirks: "mulƟplied" → "multiplied", "𝑖𝑓" → "if", "ﬁ" → "fi". */
function repairText(text: string): string {
  return text
    .replace(/Ɵ/g, "ti")
    .replace(/[\uFB00-\uFB06]/g, (c) => c.normalize("NFKC"))
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => c.normalize("NFKC"));
}

/**
 * Turns pdf.js text items into lines and paragraphs: a new line where the
 * baseline moves, a blank line where the gap is larger than a line, and a
 * space between items that don't touch.
 */
function itemsToText(items: { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }[]): string {
  let text = "";
  let lastY: number | null = null;
  let lastEndX = 0;
  let lineHeight = 0;
  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    const size = Math.abs(item.transform[3]) || item.height || 10;
    if (lastY !== null && Math.abs(y - lastY) > size * 0.4) {
      const gap = Math.abs(lastY - y);
      text += gap > Math.max(lineHeight, size) * 1.6 ? "\n\n" : "\n";
      lineHeight = gap;
    } else if (lastY !== null && x - lastEndX > size * 0.15 && !text.endsWith(" ") && !item.str.startsWith(" ")) {
      text += " ";
    }
    text += item.str;
    if (item.hasEOL) text += "\n";
    lastY = y;
    lastEndX = x + item.width;
  }
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when a page's text layer is real, readable text (not a scanned page, a legacy-font scramble or broken equations). */
function usableText(text: string, fontNames: string[]): boolean {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 20) return false;
  if (fontNames.some((f) => LEGACY_INDIC_FONT.test(f))) return false;
  if (BROKEN_MATH.test(text)) return false;
  const undecodable = (text.match(UNDECODABLE) ?? []).length;
  if (undecodable > compact.length * 0.02) return false;
  // Mostly letters and digits in any script (Devanagari vowel signs are marks).
  const wordy = (compact.match(/[\p{L}\p{M}\p{N}]/gu) ?? []).length;
  return wordy / compact.length > 0.6;
}

/**
 * Reads a PDF page by page in the browser. Pages with a real text layer (most
 * digital worksheets, sample papers and e-books) give their exact text, so
 * they need no AI reading; scanned pages are left for the AI to read. Every
 * page also comes with its image.
 */
/** How many pages a PDF has. */
export async function countPdfPages(file: File): Promise<number> {
  return (await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise).numPages;
}

export async function readPdfPages(file: File, maxPages = Infinity): Promise<PdfPage[]> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const count = Math.min(pdf.numPages, maxPages);
  const pages: PdfPage[] = [];

  for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter(
      (i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => "str" in i
    );
    const fontNames = [
      ...Object.values(content.styles ?? {}).map((s) => `${s.fontFamily ?? ""}`),
      ...items.map((i) => (i as { fontName?: string }).fontName ?? ""),
    ];
    const text = repairText(itemsToText(items));

    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(RENDER_SCALE, MAX_DIMENSION / Math.max(natural.width, natural.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvas, viewport }).promise;
    const image = encodeCanvas(canvas);

    pages.push({
      ...(usableText(text, fontNames) ? { text } : {}),
      imageBase64: image.imageBase64,
      mimeType: "image/jpeg",
      bytes: image.bytes,
      originalBytes: file.size / pdf.numPages,
    });
  }
  return pages;
}
