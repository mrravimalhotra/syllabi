"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { keep, peek } from "@/lib/client-cache";
import { STALE_UPLOAD_MS, DocumentRowView, PendingPage, keepScreenOn } from "@/app/dashboard/library/_parts/upload-helpers";
import { AddBookForm, type BookValues } from "@/app/dashboard/library/_parts/AddBookForm";
import { BookList } from "@/app/dashboard/library/_parts/BookList";
import { prepareFiles } from "@/app/dashboard/library/_parts/read-files";
import { describeOutcome, uploadPages } from "@/app/dashboard/library/_parts/upload-book";
import type { SourceType } from "@/types/database";
import { PageHeader, PageSkeleton } from "@/components/ui";

export default function LibraryPage() {
  const [documents, setDocuments] = useState<DocumentRowView[]>(() => peek<DocumentRowView[]>("library") ?? []);
  // With the last list on hand there is nothing to wait for: it shows now and refreshes behind.
  const [loading, setLoading] = useState(() => peek("library") === undefined);
  const [loadFailed, setLoadFailed] = useState(false);

  const [values, setValues] = useState<BookValues>({ title: "", subject: "", grade: "", sourceType: "textbook", rightsConfirmed: false });
  const change = (patch: Partial<BookValues>) => setValues((v) => ({ ...v, ...patch }));
  const [pages, setPages] = useState<PendingPage[]>([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  // Pages saved so far in the current upload, out of how many, for the progress bar.
  const [pagesSent, setPagesSent] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  // Books being uploaded by this tab right now (never shown as unfinished).
  const [activeBooks, setActiveBooks] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string[]>([]);
  const [bookErrors, setBookErrors] = useState<Record<string, string>>({});
  const stopRef = useRef<AbortController | null>(null);
  // When the book list was last loaded, to tell an upload still running from one that stopped.
  const [listedAt, setListedAt] = useState(0);
  const [shrinkNote, setShrinkNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Shows the page skeleton only on the first load; later refreshes keep the page in place.
  async function load() {
    try {
      const docsRes = await fetch("/api/library");
      const docs = await docsRes.json();
      if (!docsRes.ok) throw new Error(docs.error);
      keep("library", docs.documents);
      setDocuments(docs.documents);
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

  // While the server reads pages in the background, refresh the list to show its progress.
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

  async function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setProcessingFiles(true);
    try {
      const prepared = await prepareFiles(Array.from(fileList), values.sourceType, pages);
      setPages(prepared.pages);
      setShrinkNote(prepared.note);
      if (prepared.warning) setError(prepared.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the files you chose. Try again, or add fewer files at a time.");
    } finally {
      setProcessingFiles(false);
    }
  }

  const removePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const setPageSourceType = useCallback((id: string, sourceType: SourceType) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, sourceType } : p)));
  }, []);

  async function renameBook(id: string, title: string) {
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

  /** Deletes a book (stopping its upload first, if this tab is uploading it). Returns whether it worked. */
  async function removeBook(id: string): Promise<boolean> {
    if (activeBooks.includes(id)) stopRef.current?.abort();
    setDeleting((d) => [...d, id]);
    setBookErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)));
    try {
      const res = await fetch(`/api/library/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      // Already gone counts as deleted.
      if (!res.ok && res.status !== 404) {
        setBookErrors((e) => ({ ...e, [id]: data.error ?? "Couldn't delete this book. Try again in a moment." }));
        return false;
      }
      setDocuments((docs) =>
        keep(
          "library",
          docs.filter((d) => d.id !== id)
        )
      );
      // Pages waiting to go into this book will start a new one instead.
      setPages((prev) => prev.map((p) => (p.bookId === id ? { ...p, bookId: undefined, pageNumber: undefined } : p)));
      return true;
    } catch {
      setBookErrors((e) => ({ ...e, [id]: "Couldn't reach Syllabi. Check your connection and try again." }));
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
    setBookErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)));
    const res = await fetch(`/api/library/${id}/retry`, { method: "POST" }).catch(() => null);
    if (!res?.ok) setBookErrors((e) => ({ ...e, [id]: "Couldn't restart reading. Check your connection and try again." }));
    await load();
  }

  async function removeUnfinished() {
    const list = documents.filter(unfinished);
    if (
      !window.confirm(`Delete ${list.length} unfinished upload${list.length === 1 ? "" : "s"}? Pages already read in them are removed too.`)
    )
      return;
    for (const d of list) await removeBook(d.id);
  }

  /** Why the book can't be uploaded yet, or null when it can. */
  function uploadProblem(): string | null {
    if (!values.title.trim()) return "Type a title for the book (for example, Science Class 8, Chapter 3), then press Upload again.";
    if (pages.length === 0) return "Add at least one photo, PDF or Word file with “Choose files”, then press Upload.";
    if (!values.rightsConfirmed) return "Tick the box that says you own this copy, then press Upload again.";
    return null;
  }

  /** Asks before making a second copy of a book by accident. */
  function confirmSameTitle(): boolean {
    const sameTitle = documents.find((d) => d.title.trim().toLowerCase() === values.title.trim().toLowerCase());
    if (!sameTitle || !pages.some((p) => !p.bookId)) return true;
    return window.confirm(
      `You already have a book called "${sameTitle.title}". Upload these pages as another copy?\n\nCancel to change the title, or delete the old book first.`
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const problem = uploadProblem();
    if (problem) {
      setError(problem);
      return;
    }
    if (!confirmSameTitle()) return;

    const controller = new AbortController();
    stopRef.current = controller;
    const releaseScreen = await keepScreenOn();
    setSubmitting(true);
    setUploadProgress(null);
    setPagesSent(0);
    setUploadTotal(pages.length);
    setPages((prev) => prev.map((p) => ({ ...p, failure: undefined })));

    const outcome = await uploadPages({
      title: values.title,
      subject: values.subject,
      grade: values.grade,
      rightsConfirmed: values.rightsConfirmed,
      pages,
      signal: controller.signal,
      progress: setUploadProgress,
      sent: setPagesSent,
      numbered: (bookId, numbers) =>
        setPages((prev) => prev.map((p) => (numbers.has(p.id) ? { ...p, bookId, pageNumber: numbers.get(p.id) } : p))),
      saved: (ids) => setPages((prev) => prev.filter((p) => !ids.includes(p.id))),
      active: (id) => setActiveBooks((a) => [...a, id]),
      reload: () => void load(),
      removeBook,
    });

    setPages((prev) => prev.map((p) => (outcome.failures.has(p.id) ? { ...p, failure: outcome.failures.get(p.id) } : p)));
    releaseScreen();
    setActiveBooks([]);
    setSubmitting(false);
    setUploadProgress(null);
    stopRef.current = null;
    await load();

    const message = describeOutcome(outcome, pages.length, values.title, controller.signal.aborted);
    if (message.success) {
      setSuccess(message.success);
      change({ title: "" });
    }
    if (message.error) setError(message.error);
  }

  if (loading) return <PageSkeleton rows={2} />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="My books"
        description={
          <>
            Upload photos, a PDF or a Word file of your child&apos;s or student&apos;s books, worksheets and past papers. Syllabi reads
            every page so answers come from these books. Your books are private: only you can see and search them.
          </>
        }
      />

      <AddBookForm
        values={values}
        onChange={change}
        pages={pages}
        upload={{ preparing: processingFiles, running: submitting, progress: uploadProgress, sent: pagesSent, total: uploadTotal }}
        error={error}
        success={success}
        note={shrinkNote}
        onSubmit={submit}
        onFiles={addFiles}
        onRemovePage={removePage}
        onPageKind={setPageSourceType}
        onRemoveAll={() => setPages([])}
        onStop={() => stopRef.current?.abort()}
      />

      <BookList
        documents={documents}
        loadFailed={loadFailed}
        deleting={deleting}
        errors={bookErrors}
        isUnfinished={unfinished}
        onRename={renameBook}
        onDelete={deleteBook}
        onRetry={retryPages}
        onRemoveUnfinished={removeUnfinished}
      />
    </div>
  );
}
