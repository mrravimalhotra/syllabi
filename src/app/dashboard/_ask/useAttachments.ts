"use client";

import { useState } from "react";
import type { DownscaledImage } from "@/lib/downscale-image";
import { pagesLeft, readAttachments, readPdfRange, type LongPdf } from "@/app/dashboard/_ask/attachments";

/**
 * The photos, PDF pages and Word files attached to a question. `add` reads the
 * chosen files; what went wrong, or what was skipped, is reported through
 * `onError` and `onNotice`.
 */
export function useAttachments(onError: (message: string | null) => void, onNotice: (message: string | null) => void) {
  // Photos are downscaled in the browser so they fit the request size limit.
  const [photos, setPhotos] = useState<DownscaledImage[]>([]);
  // Word files: their text goes with the question.
  const [docs, setDocs] = useState<{ name: string; text: string }[]>([]);
  const [reading, setReading] = useState(false);
  // PDFs too long for one question, waiting for the person to choose their pages.
  const [longPdfs, setLongPdfs] = useState<LongPdf[]>([]);

  async function add(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    onError(null);
    onNotice(null);
    setReading(true);
    const read = await readAttachments(Array.from(files), photos);
    if ("error" in read) {
      onError(read.error);
    } else {
      setPhotos(read.photos);
      setDocs((prev) => [...prev, ...read.docs]);
      setLongPdfs((prev) => [...prev, ...read.longPdfs]);
      if (read.notes.length) onNotice(read.notes.join(" "));
    }
    setReading(false);
  }

  /** Attaches the chosen pages of the long PDF at `index`. */
  async function attachPages(index: number, first: number, last: number) {
    const pdf = longPdfs[index];
    if (!pdf) return;
    onError(null);
    onNotice(null);
    setReading(true);
    const read = await readPdfRange(pdf.file, first, last, photos);
    if ("error" in read) {
      onError(read.error);
    } else {
      setPhotos(read.photos);
      setLongPdfs((prev) => prev.filter((_, j) => j !== index));
      if (read.notes.length) onNotice(read.notes.join(" "));
    }
    setReading(false);
  }

  return {
    longPdfs,
    pagesLeft: pagesLeft(photos),
    attachPages,
    skipPdf: (index: number) => setLongPdfs((prev) => prev.filter((_, j) => j !== index)),
    photos,
    docs,
    reading,
    add,
    removePhoto: (index: number) => setPhotos((prev) => prev.filter((_, j) => j !== index)),
    removeDoc: (index: number) => setDocs((prev) => prev.filter((_, j) => j !== index)),
    clear: () => {
      setPhotos([]);
      setDocs([]);
      setLongPdfs([]);
    },
  };
}
