"use client";

import { useCallback, useRef, useState } from "react";
import { PendingPage, keepScreenOn } from "@/app/dashboard/library/_parts/upload-helpers";
import { useBookDeletion } from "@/app/dashboard/library/_parts/useBookDeletion";
import { useScanCheck } from "@/app/dashboard/library/_parts/useScanCheck";
import { useBookDownload } from "@/app/dashboard/library/_parts/useBookDownload";
import { useBookList } from "@/app/dashboard/library/_parts/useBookList";
import { AddBookForm, type BookValues } from "@/app/dashboard/library/_parts/AddBookForm";
import { BookList } from "@/app/dashboard/library/_parts/BookList";
import { prepareFiles } from "@/app/dashboard/library/_parts/read-files";
import { describeOutcome, uploadPages } from "@/app/dashboard/library/_parts/upload-book";
import type { SourceType } from "@/types/database";
import { PageHeader, PageSkeleton } from "@/components/ui";

export default function LibraryPage() {
  const list = useBookList();
  const { documents, loading, loadFailed, load } = list;

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
  const stopRef = useRef<AbortController | null>(null);
  const [shrinkNote, setShrinkNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const books = useBookDeletion({
    documents,
    setDocuments: list.setDocuments,
    activeBooks,
    listedAt: list.listedAt,
    reload: load,
    abortUpload: () => stopRef.current?.abort(),
    // Pages waiting to go into this book will start a new one instead.
    onRemoved: (id) => setPages((prev) => prev.map((p) => (p.bookId === id ? { ...p, bookId: undefined, pageNumber: undefined } : p))),
  });
  const { removeBook } = books;
  const downloads = useBookDownload();
  const scans = useScanCheck(load);

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

  // A returning parent sees their books first; someone with none sees the form to add one first.
  const bookList = (
    <BookList
      documents={documents}
      loadFailed={loadFailed}
      deleting={books.deleting}
      downloading={downloads.downloading}
      checking={scans.checking}
      errors={{ ...books.errors, ...downloads.errors, ...scans.errors }}
      isUnfinished={books.unfinished}
      onRename={list.rename}
      onDelete={books.deleteBook}
      onDownload={(d) => void downloads.download(d.id, d.title)}
      onCheckScan={(d) => void scans.check(d.id)}
      onRetry={books.retryPages}
      onRemoveUnfinished={books.removeUnfinished}
    />
  );

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

      {documents.length > 0 && bookList}

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

      {documents.length === 0 && bookList}
    </div>
  );
}
