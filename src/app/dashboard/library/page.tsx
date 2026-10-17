"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { downscaleImageFile, formatBytes, imageFingerprint } from "@/lib/downscale-image";
import { EditableName } from "@/components/EditableName";
import { BookIcon, CheckIcon, TrashIcon, UploadIcon, XIcon } from "@/components/icons";
import {
  Alert,
  Badge,
  EmptyState,
  Field,
  PageHeader,
  PageSkeleton,
  Spinner,
  button,
  card,
  cx,
  input,
  label,
  link,
} from "@/components/ui";

type SourceType = "textbook" | "exercise" | "past_paper" | "notes";

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "textbook", label: "Textbook" },
  { value: "exercise", label: "Exercise" },
  { value: "past_paper", label: "Past paper" },
  { value: "notes", label: "Notes" },
];

const MAX_PAGES = 60;
// Pages the AI has to read go one per request, so each request is short, the
// progress bar moves page by page, and one difficult page can't sink others.
// Pages that already have text (Word, digital PDFs) need no AI and go together.
const MAX_TEXT_PAGES_PER_BATCH = 10;
// Requests at once. Two keep the AI free tier's per-minute limit happy while
// halving the wait.
const PARALLEL_REQUESTS = 2;

// Base64 characters per request. Keeps each request under Vercel's ~4.5 MB
// body limit (JSON overhead included).
const MAX_BATCH_BASE64_CHARS = 3 * 1024 * 1024;

// A page that fails on the server is tried this many times in all, waiting
// longer each time (the AI service's busy spells pass within seconds), unless
// the server says trying again can't help (e.g. the daily allowance is used up).
const UPLOAD_ATTEMPTS = 3;
const RETRY_WAIT_MS = 8000;
// A book still "reading" this long after it was started, and not by this tab, didn't finish.
const STALE_UPLOAD_MS = 15 * 60 * 1000;

interface PendingPage {
  id: string;
  /** Image pages (scans, photos, PDF pages); empty for text pages. */
  imageBase64: string;
  mimeType: string;
  /** Text pages, read in the browser from Word files. */
  text?: string;
  /** Digital PDF pages: the page's own text (no AI reading needed), sent with its image. */
  pdfText?: string;
  /** For pictures from Word files: where the picture was, for the page reader. */
  hint?: string;
  sourceType: SourceType;
  /** Original file name, shown so pages from a multi-page PDF are still traceable to their source. */
  origin: string;
  /** Set once an upload starts: the book this page goes into, and its page number there. Kept if it fails, so trying again adds it to the same book. */
  bookId?: string;
  pageNumber?: number;
  /** Why the last try failed, shown on the page. */
  failure?: string;
}

interface DocumentRowView {
  id: string;
  title: string;
  status: "processing" | "ready" | "failed";
  source_type: string;
  created_at: string;
  subject: string | null;
  grade: string | null;
}

/** Splits pages into contiguous runs of the same source type (and book, for pages left over from an earlier try), preserving scan order. */
function groupByContiguousSourceType(pageList: PendingPage[]): PendingPage[][] {
  const groups: PendingPage[][] = [];
  for (const page of pageList) {
    const last = groups[groups.length - 1];
    if (last && last[0].sourceType === page.sourceType && last[0].bookId === page.bookId) {
      last.push(page);
    } else {
      groups.push([page]);
    }
  }
  return groups;
}

/**
 * Splits a book's pages into requests: each page the AI has to read on its
 * own; pages that already have text together, while their page numbers run
 * on and the request stays under a size budget.
 */
function toRequests(pageList: PendingPage[]): PendingPage[][] {
  const batches: PendingPage[][] = [];
  let current: PendingPage[] = [];
  let currentChars = 0;
  const needsReading = (p: PendingPage) => p.text === undefined && p.pdfText === undefined;
  for (const page of pageList) {
    const size = page.text?.length ?? page.imageBase64.length + (page.pdfText?.length ?? 0);
    const last = current[current.length - 1];
    const fits =
      last &&
      !needsReading(page) &&
      !needsReading(last) &&
      current.length < MAX_TEXT_PAGES_PER_BATCH &&
      currentChars + size <= MAX_BATCH_BASE64_CHARS &&
      page.pageNumber === last.pageNumber! + 1;
    if (!fits && current.length > 0) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(page);
    currentChars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** The page as the server expects it. */
function uploadShape({ imageBase64, mimeType, text, pdfText, hint }: PendingPage) {
  return text !== undefined ? { text } : pdfText !== undefined ? { text: pdfText, imageBase64, mimeType } : { imageBase64, mimeType, hint };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Keeps the phone's screen on while pages upload: a locked screen pauses the
 * page and the upload with it. Returns a release function; does nothing where
 * the browser can't (older phones), which is harmless.
 */
async function keepScreenOn(): Promise<() => void> {
  try {
    const lock = await navigator.wakeLock?.request("screen");
    return () => void lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}

export default function LibraryPage() {
  const [documents, setDocuments] = useState<DocumentRowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [defaultSourceType, setDefaultSourceType] = useState<SourceType>("textbook");
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
  const [dragging, setDragging] = useState(false);
  const [shrinkNote, setShrinkNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Shows the page skeleton only on the first load; later refreshes keep the page in place.
  async function load() {
    try {
      const docsRes = await fetch("/api/library");
      const docs = await docsRes.json();
      if (!docsRes.ok) throw new Error(docs.error);
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

  async function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setProcessingFiles(true);
    try {
      const newPages: PendingPage[] = [];
      // Photo and PDF sizes before and after shrinking, for the note under the drop area.
      let originalBytes = 0;
      let shrunkBytes = 0;
      for (const file of Array.from(fileList)) {
        if (file.name.toLowerCase().endsWith(".docx")) {
          // Word files: read the text right here (no page reading needed), and
          // keep each picture as an image page with a note of where it was.
          const { readDocx } = await import("@/lib/docx-to-text");
          const { textPages, pictures, skippedPictures } = await readDocx(file);
          if (skippedPictures.length > 0) {
            setError(
              `${file.name}: ${skippedPictures.length} picture(s) are in a format that can't be read. ` +
                "If they matter, save the file as PDF in Word and upload the PDF instead."
            );
          }
          pictures.forEach((picture, i) =>
            newPages.push({
              id: `${file.name}-pic-${i}-${Date.now()}`,
              imageBase64: picture.imageBase64,
              mimeType: picture.mimeType,
              hint: picture.hint,
              sourceType: defaultSourceType,
              origin: `${file.name} (picture ${i + 1})`,
            })
          );
          textPages.forEach((text, i) =>
            newPages.push({
              id: `${file.name}-${i}-${Date.now()}`,
              imageBase64: "",
              mimeType: "",
              text,
              sourceType: defaultSourceType,
              origin: textPages.length > 1 ? `${file.name} (part ${i + 1})` : file.name,
            })
          );
        } else if (file.type === "application/pdf") {
          // pdf.js is large; load it only when a PDF is actually picked.
          // Digital PDFs carry their own text: those pages need no AI reading.
          const { readPdfPages } = await import("@/lib/pdf-to-images");
          const pdfPages = await readPdfPages(file);
          originalBytes += file.size;
          pdfPages.forEach((p) => (shrunkBytes += p.bytes ?? 0));
          pdfPages.forEach((p, i) =>
            newPages.push({
              id: `${file.name}-${i}-${Date.now()}`,
              imageBase64: p.imageBase64,
              mimeType: p.mimeType,
              pdfText: p.text,
              sourceType: defaultSourceType,
              origin: pdfPages.length > 1 ? `${file.name} (p.${i + 1})` : file.name,
            })
          );
        } else {
          const downscaled = await downscaleImageFile(file);
          originalBytes += file.size;
          shrunkBytes += downscaled.bytes ?? 0;
          newPages.push({
            id: `${file.name}-${Date.now()}`,
            imageBase64: downscaled.imageBase64,
            mimeType: downscaled.mimeType,
            sourceType: defaultSourceType,
            origin: file.name,
          });
        }
      }

      // The same photo picked twice would be read (and paid for) twice.
      const seen = new Set(pages.map((p) => imageFingerprint(p.text ?? p.pdfText ?? p.imageBase64)));
      const unique = newPages.filter((p) => {
        const fingerprint = imageFingerprint(p.text ?? p.pdfText ?? p.imageBase64);
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      });
      const duplicates = newPages.length - unique.length;

      const combined = [...pages, ...unique];
      if (combined.length > MAX_PAGES) {
        setError(`Up to ${MAX_PAGES} pages per upload: ${combined.length} selected, so the extra pages were left out.`);
      }
      setPages(combined.slice(0, MAX_PAGES));

      const notes: string[] = [];
      if (originalBytes > 0 && shrunkBytes > 0 && shrunkBytes < originalBytes) {
        notes.push(`Shrunk from ${formatBytes(originalBytes)} to ${formatBytes(shrunkBytes)} for a faster upload.`);
      }
      if (duplicates > 0) notes.push(`${duplicates} duplicate page${duplicates > 1 ? "s" : ""} skipped.`);
      const codeRead = unique.filter((p) => p.pdfText !== undefined).length;
      if (codeRead > 0) {
        notes.push(`${codeRead} PDF page${codeRead > 1 ? "s have" : " has"} its own text, so no AI reading is needed (quicker, and uses less of your allowance).`);
      }
      setShrinkNote(notes.length ? notes.join(" ") : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read one of the selected files");
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
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, title: data.document.title } : d)));
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
        setBookErrors((e) => ({ ...e, [id]: data.error ?? "Couldn't delete this book. Please try again." }));
        return false;
      }
      setDocuments((docs) => docs.filter((d) => d.id !== id));
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
    if (!window.confirm(`Delete "${doc.title}"? Its pages and search index are removed for good.`)) return;
    await removeBook(doc.id);
  }

  const unfinished = (d: DocumentRowView) =>
    !activeBooks.includes(d.id) && (d.status === "failed" || (d.status === "processing" && listedAt - Date.parse(d.created_at) > STALE_UPLOAD_MS));

  async function removeUnfinished() {
    const list = documents.filter(unfinished);
    if (!window.confirm(`Delete ${list.length} unfinished upload${list.length === 1 ? "" : "s"}? Pages already read in them are removed too.`)) return;
    for (const d of list) await removeBook(d.id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!title.trim() || pages.length === 0) {
      setError("A title and at least one page are required");
      return;
    }
    if (!rightsConfirmed) {
      setError("Please confirm you own this copy before uploading");
      return;
    }

    const controller = new AbortController();
    stopRef.current = controller;
    const releaseScreen = await keepScreenOn();
    setSubmitting(true);
    setUploadProgress(null);
    setPagesSent(0);
    setUploadTotal(pages.length);
    setPages((prev) => prev.map((p) => ({ ...p, failure: undefined })));

    const typeLabel = (t: SourceType) => SOURCE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
    const failures = new Map<string, string>(); // page id → reason
    const saved = new Set<string>();
    const books: { id: string }[] = [];
    let stopReason: string | null = null; // a failure that every later page would hit too
    let fatal: string | null = null;
    let sent = 0;

    try {
      for (let group of groupByContiguousSourceType(pages)) {
        if (controller.signal.aborted || stopReason) break;

        // A new book is created first, so a retried page can never start a second copy of it.
        if (!group[0].bookId) {
          setUploadProgress(`Starting "${title.trim()}"`);
          const res = await fetch("/api/library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ title: title.trim(), subject: subject.trim(), grade: grade.trim(), rightsConfirmed, sourceType: group[0].sourceType }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.documentId) throw new Error(data.error ?? "Couldn't start the upload. Please try again.");
          const newId: string = data.documentId;
          group = group.map((p, i) => ({ ...p, bookId: newId, pageNumber: i + 1 }));
          const numbered = new Map(group.map((p) => [p.id, p.pageNumber]));
          setPages((prev) => prev.map((p) => (numbered.has(p.id) ? { ...p, bookId: newId, pageNumber: numbered.get(p.id) } : p)));
          void load();
        }
        const book = { id: group[0].bookId! };
        books.push(book);
        setActiveBooks((a) => [...a, book.id]);

        const queue = toRequests(group);
        const label = typeLabel(group[0].sourceType).toLowerCase();
        const worker = async () => {
          for (let batch = queue.shift(); batch; batch = queue.shift()) {
            if (controller.signal.aborted || stopReason) return;
            const first = batch[0].pageNumber!;
            const name = batch.length === 1 ? `page ${first}` : `pages ${first}–${first + batch.length - 1}`;
            for (let attempt = 1; ; attempt++) {
              let res: Response;
              let data: { error?: string; retryable?: boolean } = {};
              try {
                res = await fetch(`/api/library/${book.id}/pages`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  signal: controller.signal,
                  body: JSON.stringify({ pages: batch.map(uploadShape), startPageNumber: first }),
                });
                data = await res.json().catch(() => ({ error: res.status === 504 ? "The server took too long." : undefined }));
              } catch {
                if (controller.signal.aborted) return;
                res = new Response(null, { status: 503 });
                data = { error: "The connection dropped." };
              }
              if (res.ok) {
                batch.forEach((p) => saved.add(p.id));
                sent += batch.length;
                setPagesSent(sent);
                setPages((prev) => prev.filter((p) => !saved.has(p.id)));
                break;
              }
              const reason = data.error ?? "Upload failed.";
              const retry = res.status >= 500 && data.retryable !== false && attempt < UPLOAD_ATTEMPTS;
              if (!retry) {
                batch.forEach((p) => failures.set(p.id, reason));
                if (res.status === 404 || /daily allowance|quota exceeded/i.test(reason)) stopReason = reason;
                break;
              }
              setUploadProgress(`${reason} Trying ${name} again (${attempt + 1} of ${UPLOAD_ATTEMPTS})`);
              await wait(RETRY_WAIT_MS * attempt);
              if (controller.signal.aborted) return;
            }
            if (!stopReason) setUploadProgress(`Reading ${label} pages`);
          }
        };
        setUploadProgress(`Reading ${label} pages`);
        await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker));

        // Finish the book with the pages read so far (now or in an earlier try); one with none is removed.
        const res = await fetch(`/api/library/${book.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ready: true }),
        });
        if (res.status === 400) await removeBook(book.id);
      }
    } catch (err) {
      if (!controller.signal.aborted) fatal = err instanceof Error ? err.message : "Upload failed.";
    } finally {
      setPages((prev) => prev.map((p) => (failures.has(p.id) ? { ...p, failure: failures.get(p.id) } : p)));
      releaseScreen();
      setActiveBooks([]);
      setSubmitting(false);
      setUploadProgress(null);
      stopRef.current = null;
      await load();
    }

    const left = pages.length - saved.size;
    if (left === 0) {
      setSuccess(`Uploaded and read "${title.trim()}" (${saved.size} page${saved.size === 1 ? "" : "s"}${books.length > 1 ? `, as ${books.length} books by type` : ""}).`);
      setTitle("");
      return;
    }
    const reasons = [...new Set(failures.values())];
    setError(
      [
        controller.signal.aborted ? "Upload stopped." : fatal,
        saved.size > 0 ? `${saved.size} page${saved.size === 1 ? " was" : "s were"} read and saved.` : null,
        reasons.length ? `${failures.size} page${failures.size === 1 ? "" : "s"} couldn't be read: ${reasons.join(" ")}` : null,
        `The ${left} remaining page${left === 1 ? " is" : "s are"} still below. Press Upload to try again${saved.size > 0 ? "; they'll be added to the same book" : ""}.`,
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  if (loading) return <PageSkeleton rows={2} />;

  const progressPct = uploadTotal > 0 ? Math.round((pagesSent / uploadTotal) * 100) : 0;
  const resuming = pages.some((p) => p.bookId);
  const unfinishedCount = documents.filter(unfinished).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="My books"
        description={
          <>
            Upload photos, a PDF or a Word file of your child&apos;s or student&apos;s books, worksheets and past
            papers. Syllabi reads every page so answers come from these books. Your books are private: only you can
            see and search them.
          </>
        }
      />

      <form onSubmit={submit} className={cx(card, "space-y-6 p-5 sm:p-6")}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <UploadIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Add a book</h2>
            <p className="text-xs text-slate-500">Reading pages uses part of your monthly allowance.</p>
          </div>
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title" htmlFor="book-title">
              <input
                id="book-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Science Class 8, Chapter 3: Motion"
                maxLength={200}
                className={input}
              />
            </Field>
          </div>
          <Field label="Subject" htmlFor="book-subject">
            <input
              id="book-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Science"
              maxLength={100}
              className={input}
            />
          </Field>
          <Field label="Grade / class" htmlFor="book-grade">
            <input
              id="book-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. Class 8"
              maxLength={50}
              className={input}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className={label}>Pages</p>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              New pages are
              <select
                value={defaultSourceType}
                onChange={(e) => setDefaultSourceType(e.target.value as SourceType)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              >
                {SOURCE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cx(
              "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition",
              dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40",
              (processingFiles || submitting) && "pointer-events-none opacity-60"
            )}
          >
            <input
              type="file"
              accept="image/*,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              disabled={processingFiles || submitting}
              className="sr-only"
            />
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-xs ring-1 ring-slate-200">
              {processingFiles ? <Spinner className="h-5 w-5" /> : <UploadIcon className="h-5 w-5" />}
            </span>
            <span className="mt-3 text-sm font-medium text-slate-900">
              {processingFiles ? "Preparing pages..." : (
                <>
                  <span className="text-brand-700">Choose files</span>
                  <span className="hidden sm:inline"> or drag them here</span>
                </>
              )}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Photos, PDF or Word (.docx), up to {MAX_PAGES} pages. Large photos are shrunk automatically, like in
              WhatsApp.
            </span>
          </label>

          {shrinkNote && pages.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckIcon className="h-4 w-4" /> {shrinkNote}
            </p>
          )}

          {pages.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {pages.length} page{pages.length > 1 ? "s" : ""}
                  </span>{" "}
                  · set the type per page if a batch mixes content (e.g. a chapter followed by its exercises).
                </p>
                <button type="button" onClick={() => setPages([])} disabled={submitting} className={cx(link, "text-xs")}>
                  Remove all
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {pages.map((p, i) => (
                  <PageCard
                    key={p.id}
                    page={p}
                    index={i}
                    disabled={submitting}
                    onRemove={removePage}
                    onTypeChange={setPageSourceType}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>

        <label className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(e) => setRightsConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span>
            I own this copy (printed or digital) and will use it only to help my own child or students study. I
            won&apos;t upload material I don&apos;t have the right to use.
          </span>
        </label>

        {submitting && (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <div className="flex justify-between gap-3 text-xs text-slate-600">
              <span>{uploadProgress ?? "Uploading"}... keep this page open (the screen stays on)</span>
              <span className="shrink-0 tabular-nums">
                {pagesSent} of {uploadTotal} read
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-500"
                style={{ width: `${Math.max(progressPct, 4)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button disabled={submitting || processingFiles || pages.length === 0} className={cx(button.primary, "w-full sm:w-auto")}>
            {submitting ? <Spinner /> : <UploadIcon className="h-4.5 w-4.5" />}
            {submitting
              ? "Reading pages..."
              : pages.length
                ? `${resuming ? "Try again: read" : "Upload & read"} ${pages.length} page${pages.length === 1 ? "" : "s"}`
                : "Upload & read"}
          </button>
          {submitting && (
            <button type="button" onClick={() => stopRef.current?.abort()} className={cx(button.secondary, "w-full sm:w-auto")}>
              Stop (keep the pages read so far)
            </button>
          )}
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Your books</h2>
          <div className="flex items-baseline gap-3">
            {unfinishedCount > 0 && (
              <button type="button" onClick={removeUnfinished} className={cx(link, "text-xs text-red-600")}>
                Delete {unfinishedCount} unfinished upload{unfinishedCount === 1 ? "" : "s"}
              </button>
            )}
            {documents.length > 0 && <span className="text-xs text-slate-400">{documents.length} in total</span>}
          </div>
        </div>
        {loadFailed ? (
          <Alert tone="error">Couldn&apos;t load your books. Check your connection and reload the page.</Alert>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<BookIcon className="h-6 w-6" />}
            title="No books yet"
            description="Add your first book above. Answers will then come from its pages."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {documents.map((d) => (
              <li key={d.id} className={cx(card, "flex items-start gap-3 p-4")}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <BookIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <EditableName
                    value={d.title}
                    onSave={(title) => renameBook(d.id, title)}
                    className="text-sm font-medium text-slate-900"
                  />
                  <p className="truncate text-xs text-slate-500">
                    {[d.subject, d.grade, SOURCE_TYPE_OPTIONS.find((o) => o.value === d.source_type)?.label ?? d.source_type]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <StatusBadge status={d.status} unfinished={unfinished(d)} />
                  {bookErrors[d.id] && <p className="text-xs text-red-600">{bookErrors[d.id]}</p>}
                </div>
                <button
                  onClick={() => deleteBook(d)}
                  disabled={deleting.includes(d.id)}
                  className={button.iconDanger}
                  aria-label={`Delete "${d.title}"`}
                  title="Delete"
                >
                  {deleting.includes(d.id) ? <Spinner className="h-4.5 w-4.5" /> : <TrashIcon className="h-4.5 w-4.5" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status, unfinished }: { status: DocumentRowView["status"]; unfinished: boolean }) {
  if (status === "ready") return <Badge tone="success">Ready</Badge>;
  if (unfinished) return <Badge tone="danger">Upload didn&apos;t finish: delete it and upload again</Badge>;
  return (
    <Badge tone="warning">
      <Spinner className="h-3 w-3" /> Reading pages
    </Badge>
  );
}

/** One page waiting to be uploaded. Memoised so typing a title doesn't redraw every page image. */
const PageCard = memo(function PageCard({
  page,
  index,
  disabled,
  onRemove,
  onTypeChange,
}: {
  page: PendingPage;
  index: number;
  disabled: boolean;
  onRemove: (id: string) => void;
  onTypeChange: (id: string, sourceType: SourceType) => void;
}) {
  return (
    <li className={cx("overflow-hidden rounded-xl border bg-white", page.failure ? "border-red-300 ring-2 ring-red-100" : "border-slate-200")}>
      <div className="relative">
        {page.text !== undefined ? (
          <p className="h-28 overflow-hidden bg-slate-50 p-2 text-[9px] leading-tight whitespace-pre-line text-slate-600">
            {page.text.slice(0, 400)}
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- local data-URI preview, not a remote image
          <img
            src={`data:${page.mimeType};base64,${page.imageBase64}`}
            alt={`Page ${index + 1}`}
            decoding="async"
            className="h-28 w-full bg-slate-100 object-cover"
          />
        )}
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {page.pageNumber ? `p. ${page.pageNumber}` : index + 1}
        </span>
        {page.pdfText !== undefined && (
          <span
            className="absolute right-1.5 bottom-1.5 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
            title="This page's text is read straight from the PDF: no AI needed"
          >
            Text
          </span>
        )}
        <button
          type="button"
          onClick={() => onRemove(page.id)}
          disabled={disabled}
          aria-label={`Remove page ${index + 1}`}
          className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1 p-2">
        {page.failure && <p className="text-[11px] leading-snug text-red-600">{page.failure}</p>}
        <p className="truncate text-[11px] text-slate-500" title={page.origin}>
          {page.origin}
        </p>
        <select
          value={page.sourceType}
          onChange={(e) => onTypeChange(page.id, e.target.value as SourceType)}
          disabled={disabled || page.bookId !== undefined}
          aria-label={`Type of page ${index + 1}`}
          className="block w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs"
        >
          {SOURCE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
});
