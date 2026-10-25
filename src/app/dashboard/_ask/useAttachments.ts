"use client";

import { useRef, useState } from "react";
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

  // Reads run one after another, each starting from the photos attached by then, so files added while
  // others are still being read are all kept (two reads at once used to overwrite each other).
  const photosNow = useRef<DownscaledImage[]>([]);
  const changePhotos = (change: (prev: DownscaledImage[]) => DownscaledImage[]) => {
    photosNow.current = change(photosNow.current);
    setPhotos(photosNow.current);
  };
  const queue = useRef<Promise<void>>(Promise.resolve());
  const waiting = useRef(0);

  function enqueue(work: (current: DownscaledImage[]) => Promise<void>) {
    waiting.current++;
    setReading(true);
    queue.current = queue.current
      .then(() => work(photosNow.current))
      .catch(() => onError("Couldn't read that file. Try attaching it again."))
      .finally(() => {
        if (--waiting.current === 0) setReading(false);
      });
    return queue.current;
  }

  /** Adds the photos a read made after `before`: a photo removed meanwhile stays removed. */
  function addNew(before: DownscaledImage[], after: DownscaledImage[]) {
    const added = after.slice(before.length);
    changePhotos((prev) => [...prev, ...added]);
  }

  function add(files: FileList | File[] | null) {
    if (!files || files.length === 0) return Promise.resolve();
    const chosen = Array.from(files);
    onError(null);
    onNotice(null);
    return enqueue(async (current) => {
      const read = await readAttachments(chosen, current);
      if ("error" in read) return onError(read.error);
      addNew(current, read.photos);
      setDocs((prev) => [...prev, ...read.docs]);
      setLongPdfs((prev) => [...prev, ...read.longPdfs]);
      if (read.notes.length) onNotice(read.notes.join(" "));
    });
  }

  /** Attaches the chosen pages of the long PDF at `index`. */
  function attachPages(index: number, first: number, last: number) {
    const pdf = longPdfs[index];
    if (!pdf) return Promise.resolve();
    onError(null);
    onNotice(null);
    return enqueue(async (current) => {
      const read = await readPdfRange(pdf.file, first, last, current);
      if ("error" in read) return onError(read.error);
      addNew(current, read.photos);
      setLongPdfs((prev) => prev.filter((p) => p !== pdf));
      if (read.notes.length) onNotice(read.notes.join(" "));
    });
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
    removePhoto: (index: number) => changePhotos((prev) => prev.filter((_, j) => j !== index)),
    removeDoc: (index: number) => setDocs((prev) => prev.filter((_, j) => j !== index)),
    clear: () => {
      changePhotos(() => []);
      setDocs([]);
      setLongPdfs([]);
    },
  };
}
