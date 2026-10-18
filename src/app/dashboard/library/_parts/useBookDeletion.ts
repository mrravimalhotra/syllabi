"use client";

import { useState } from "react";
import { keep } from "@/lib/client-cache";
import { STALE_UPLOAD_MS, type DocumentRowView } from "@/app/dashboard/library/_parts/upload-helpers";

interface Input {
  documents: DocumentRowView[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRowView[]>>;
  /** Books this tab is uploading right now (never shown as unfinished). */
  activeBooks: string[];
  /** When the list was last loaded, to tell an upload still running from one that stopped. */
  listedAt: number;
  reload: () => Promise<void>;
  /** Stops the upload in progress. */
  abortUpload: () => void;
  /** A book was deleted: pages waiting to go into it should start a new one instead. */
  onRemoved: (id: string) => void;
}

/** Deleting books, deleting unfinished uploads, and asking for a stuck book's pages to be read again. */
export function useBookDeletion({ documents, setDocuments, activeBooks, listedAt, reload, abortUpload, onRemoved }: Input) {
  const [deleting, setDeleting] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = (id: string) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)));
  const fail = (id: string, message: string) => setErrors((e) => ({ ...e, [id]: message }));

  /** Deletes a book (stopping its upload first, if this tab is uploading it). Returns whether it worked. */
  async function removeBook(id: string): Promise<boolean> {
    if (activeBooks.includes(id)) abortUpload();
    setDeleting((d) => [...d, id]);
    clearError(id);
    try {
      const res = await fetch(`/api/library/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      // Already gone counts as deleted.
      if (!res.ok && res.status !== 404) {
        fail(id, data.error ?? "Couldn't delete this book. Try again in a moment.");
        return false;
      }
      setDocuments((docs) =>
        keep(
          "library",
          docs.filter((d) => d.id !== id)
        )
      );
      onRemoved(id);
      return true;
    } catch {
      fail(id, "Couldn't reach Syllabi. Check your connection and try again.");
      return false;
    } finally {
      setDeleting((d) => d.filter((x) => x !== id));
    }
  }

  async function deleteBook(doc: DocumentRowView) {
    if (
      !window.confirm(
        `Delete "${doc.title}"? Its pages are removed for good, and answers can no longer use this book. Answers you already saved stay in My Documents.`
      )
    )
      return;
    await removeBook(doc.id);
  }

  // Older uploads that stopped part-way, or a book whose pages never arrived.
  const unfinished = (d: DocumentRowView) =>
    !activeBooks.includes(d.id) &&
    !d.pages &&
    (d.status === "failed" || (d.status === "processing" && listedAt - Date.parse(d.created_at) > STALE_UPLOAD_MS));

  async function retryPages(id: string) {
    clearError(id);
    const res = await fetch(`/api/library/${id}/retry`, { method: "POST" }).catch(() => null);
    if (!res?.ok) fail(id, "Couldn't restart reading. Check your connection and try again.");
    await reload();
  }

  async function removeUnfinished() {
    const list = documents.filter(unfinished);
    if (
      !window.confirm(`Delete ${list.length} unfinished upload${list.length === 1 ? "" : "s"}? Pages already read in them are removed too.`)
    )
      return;
    for (const d of list) await removeBook(d.id);
  }

  return { deleting, errors, removeBook, deleteBook, unfinished, retryPages, removeUnfinished };
}
