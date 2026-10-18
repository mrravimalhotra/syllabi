"use client";

import { useState } from "react";
import type { DownscaledImage } from "@/lib/downscale-image";
import { readAttachments } from "@/app/dashboard/_ask/attachments";

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
      if (read.notes.length) onNotice(read.notes.join(" "));
    }
    setReading(false);
  }

  return {
    photos,
    docs,
    reading,
    add,
    removePhoto: (index: number) => setPhotos((prev) => prev.filter((_, j) => j !== index)),
    removeDoc: (index: number) => setDocs((prev) => prev.filter((_, j) => j !== index)),
    clear: () => {
      setPhotos([]);
      setDocs([]);
    },
  };
}
