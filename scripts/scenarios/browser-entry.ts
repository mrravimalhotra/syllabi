// Runs inside Chromium for `npm run scenarios`. Uses the app's real
// browser-side code (the same functions My books and the question form use),
// so the report shows what Syllabi would actually do with each file.
import { readDocx } from "@/lib/docx-to-text";
import { pdfToPageImages } from "@/lib/pdf-to-images";
import { downscaleImageFile } from "@/lib/downscale-image";
import { splitQuestions } from "@/lib/rag/split-questions";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Mirrors the app's limits (src/app/dashboard/library/page.tsx and dashboard/page.tsx).
const BOOK_MAX_PAGES = 30;
const BOOK_BATCH_CHARS = 3 * 1024 * 1024;
const ATTACH_MAX_IMAGES = 12;
const ATTACH_MAX_CHARS = 3_000_000;

export interface FileReport {
  name: string;
  kind: string;
  pages: number;
  textPages: number;
  pictures: number;
  skippedPictures: number;
  textLayerChars: number | null;
  questionsFromText: number | null;
  imageKB: number[];
  bookUploadBatches: number;
  notes: string[];
}

function batchesFor(sizes: number[], cap: number): number {
  let batches = 0;
  let current = 0;
  for (const size of sizes) {
    if (current > 0 && current + size > cap) {
      batches++;
      current = 0;
    }
    current += size;
  }
  return current > 0 ? batches + 1 : batches;
}

async function pdfText(file: File): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    let line = "";
    let lastY: number | null = null;
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        text += line + "\n";
        line = "";
      }
      line += item.str;
      lastY = y;
    }
    text += line + "\n";
  }
  return text;
}

async function analyse(file: File): Promise<FileReport> {
  const name = file.name;
  const lower = name.toLowerCase();
  const report: FileReport = {
    name,
    kind: "",
    pages: 0,
    textPages: 0,
    pictures: 0,
    skippedPictures: 0,
    textLayerChars: null,
    questionsFromText: null,
    imageKB: [],
    bookUploadBatches: 0,
    notes: [],
  };

  let imageSizes: number[] = [];
  let textSizes: number[] = [];

  if (lower.endsWith(".docx")) {
    const content = await readDocx(file);
    report.kind = "Word";
    report.textPages = content.textPages.length;
    report.pictures = content.pictures.length;
    report.skippedPictures = content.skippedPictures.length;
    imageSizes = content.pictures.map((p) => p.imageBase64.length);
    textSizes = content.textPages.map((t) => t.length);
    const text = content.textPages.join("\n");
    report.textLayerChars = text.length;
    report.questionsFromText = splitQuestions(text).length;
    if (content.skippedPictures.length) report.notes.push("some pictures unreadable (EMF/WMF): suggest saving as PDF");
    if (content.pictures.length > ATTACH_MAX_IMAGES) report.notes.push(`as a question attachment, only ${ATTACH_MAX_IMAGES} of ${content.pictures.length} pictures are sent`);
  } else if (lower.endsWith(".pdf")) {
    const pages = await pdfToPageImages(file);
    const text = await pdfText(file);
    report.pages = pages.length;
    imageSizes = pages.map((p) => p.imageBase64.length);
    report.textLayerChars = text.replace(/\s/g, "").length;
    report.kind = report.textLayerChars < 50 * pages.length ? "PDF (scanned)" : "PDF (text)";
    report.questionsFromText = report.textLayerChars > 0 ? splitQuestions(text).length : null;
    if (pages.length > BOOK_MAX_PAGES) report.notes.push(`book upload takes ${BOOK_MAX_PAGES} pages at a time: upload in ${Math.ceil(pages.length / BOOK_MAX_PAGES)} parts`);
    if (pages.length > ATTACH_MAX_IMAGES) report.notes.push(`as a question attachment, only the first ${ATTACH_MAX_IMAGES} pages are sent; upload it to My books instead`);
  } else {
    const image = await downscaleImageFile(file);
    report.kind = "Photo";
    report.pages = 1;
    imageSizes = [image.imageBase64.length];
  }

  report.imageKB = imageSizes.map((s) => Math.round((s * 3) / 4 / 1024));
  report.bookUploadBatches = batchesFor([...imageSizes, ...textSizes], BOOK_BATCH_CHARS);
  const oversize = imageSizes.filter((s) => s > BOOK_BATCH_CHARS).length;
  if (oversize) report.notes.push(`${oversize} page image(s) bigger than one upload request allows`);
  const attachTotal = imageSizes.slice(0, ATTACH_MAX_IMAGES).reduce((a, b) => a + b, 0);
  if (attachTotal > ATTACH_MAX_CHARS) report.notes.push("as a question attachment, exceeds the size budget: fewer pages are sent");
  return report;
}

(window as unknown as { analyse: typeof analyse }).analyse = analyse;
