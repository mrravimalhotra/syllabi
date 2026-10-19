"use client";

import { useState } from "react";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

/** Downloading a book as a PDF made from its saved pages. Says why when it can't. */
export function useBookDownload() {
  const [downloading, setDownloading] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function download(id: string, title: string) {
    setDownloading((d) => [...d, id]);
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)));
    try {
      const res = await fetch(`/api/library/${id}/download`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't make the download. Try again in a moment.");
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 80) || "Syllabi book"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      const message = err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't make the download.";
      setErrors((e) => ({ ...e, [id]: message }));
    } finally {
      setDownloading((d) => d.filter((x) => x !== id));
    }
  }

  return { downloading, errors, download };
}
