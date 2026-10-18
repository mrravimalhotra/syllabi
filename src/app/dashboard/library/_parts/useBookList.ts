"use client";

import { useEffect, useState } from "react";
import { keep, peek } from "@/lib/client-cache";
import type { DocumentRowView } from "@/app/dashboard/library/_parts/upload-helpers";

/**
 * The person's books: the last list is shown at once while a fresh one loads,
 * and while the server reads pages in the background the list refreshes every
 * 10 seconds (and when the tab is shown again) to show its progress.
 */
export function useBookList() {
  const [documents, setDocuments] = useState<DocumentRowView[]>(() => peek<DocumentRowView[]>("library") ?? []);
  // With the last list on hand there is nothing to wait for: it shows now and refreshes behind.
  const [loading, setLoading] = useState(() => peek("library") === undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  // When the book list was last loaded, to tell an upload still running from one that stopped.
  const [listedAt, setListedAt] = useState(0);

  // Shows the page skeleton only on the first load; later refreshes keep the page in place.
  async function load() {
    try {
      const res = await fetch("/api/library");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      keep("library", data.documents);
      setDocuments(data.documents);
      setListedAt(Date.now());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount is intentional here
    load();
  }, []);

  const reading = documents.some((d) => d.status === "processing" && d.pages);
  useEffect(() => {
    if (!reading) return;
    // A hidden tab (phone locked, another app open) doesn't need updates; it refreshes when shown again.
    const refresh = () => !document.hidden && void load();
    const timer = setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reading]);

  async function rename(id: string, title: string) {
    const res = await fetch(`/api/library/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Rename failed");
    setDocuments((prev) =>
      keep(
        "library",
        prev.map((d) => (d.id === id ? { ...d, title: data.document.title } : d))
      )
    );
  }

  return { documents, setDocuments, loading, loadFailed, listedAt, load, rename };
}
