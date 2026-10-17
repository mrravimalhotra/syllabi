// The "legacy" build (not the default package-root export) is the variant meant
// to run safely wherever it's evaluated, including Next.js's server-side render
// pass of this client component — the default build logs a Node-environment
// warning in that case even though pdfToPageImages itself only ever runs in
// the browser, invoked from a file-input change handler.
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

export interface RasterizedPage {
  imageBase64: string;
  mimeType: string;
  /** This page's share of the PDF file's size, and the shrunk JPEG's size, in bytes. */
  originalBytes?: number;
  bytes?: number;
}

/**
 * Rasterizes every page of a PDF into a JPEG image in the browser, so a PDF
 * upload can feed the same per-page pipeline as directly-selected page images
 * — the server and ingestion code never need to know a PDF was involved.
 */
export async function pdfToPageImages(file: File, maxPages = Infinity): Promise<RasterizedPage[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: RasterizedPage[] = [];

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maxPages); pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    // Large-format or high-resolution PDFs would otherwise render huge page
    // images; cap the longest side like photos (enough for AI reading).
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

    const { imageBase64, bytes } = encodeCanvas(canvas);
    pages.push({ imageBase64, mimeType: "image/jpeg", originalBytes: file.size / pdf.numPages, bytes });
  }

  return pages;
}
