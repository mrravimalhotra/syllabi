"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { downscaleImageFile } from "@/lib/downscale-image";
import { EditableName } from "@/components/EditableName";
import { BookIcon, TrashIcon, UploadIcon, XIcon } from "@/components/icons";
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
// Page images per request: each is read by the AI (several seconds each), so
// a request stays well inside the server's 300-second limit.
const MAX_IMAGES_PER_BATCH = 8;

// Base64 characters per request. Keeps each request under Vercel's ~4.5 MB
// body limit (JSON overhead included); larger books go up in several batches.
const MAX_BATCH_BASE64_CHARS = 3 * 1024 * 1024;

interface PendingPage {
  id: string;
  /** Image pages (scans, photos, PDF pages); empty for text pages. */
  imageBase64: string;
  mimeType: string;
  /** Text pages, read in the browser from Word files. */
  text?: string;
  /** For pictures from Word files: where the picture was, for the page reader. */
  hint?: string;
  sourceType: SourceType;
  /** Original file name, shown so pages from a multi-page PDF are still traceable to their source. */
  origin: string;
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

/** Splits pages into contiguous runs of the same source type, preserving scan order. */
function groupByContiguousSourceType(pageList: PendingPage[]): PendingPage[][] {
  const groups: PendingPage[][] = [];
  for (const page of pageList) {
    const last = groups[groups.length - 1];
    if (last && last[0].sourceType === page.sourceType) {
      last.push(page);
    } else {
      groups.push([page]);
    }
  }
  return groups;
}

/**
 * Splits pages into batches that each stay under a base64-size budget (so one
 * request never gets too large to send reliably) and under a number of page
 * images (so the AI reading in one request finishes in time).
 */
function chunkBySize(pageList: PendingPage[], maxChars: number): PendingPage[][] {
  const batches: PendingPage[][] = [];
  let current: PendingPage[] = [];
  let currentChars = 0;
  const imagesIn = (batch: PendingPage[]) => batch.filter((p) => p.text === undefined).length;
  for (const page of pageList) {
    const size = page.text?.length ?? page.imageBase64.length;
    const tooManyImages = page.text === undefined && imagesIn(current) >= MAX_IMAGES_PER_BATCH;
    if (current.length > 0 && (currentChars + size > maxChars || tooManyImages)) {
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
  // Pages sent so far in the current upload, for the progress bar.
  const [pagesSent, setPagesSent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Shows the page skeleton only on the first load; later refreshes keep the page in place.
  async function load() {
    try {
      const docsRes = await fetch("/api/library");
      const docs = await docsRes.json();
      if (!docsRes.ok) throw new Error(docs.error);
      setDocuments(docs.documents);
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
          const { pdfToPageImages } = await import("@/lib/pdf-to-images");
          const rasterized = await pdfToPageImages(file);
          rasterized.forEach((p, i) =>
            newPages.push({
              id: `${file.name}-${i}-${Date.now()}`,
              imageBase64: p.imageBase64,
              mimeType: p.mimeType,
              sourceType: defaultSourceType,
              origin: rasterized.length > 1 ? `${file.name} (p.${i + 1})` : file.name,
            })
          );
        } else {
          const downscaled = await downscaleImageFile(file);
          newPages.push({
            id: `${file.name}-${Date.now()}`,
            imageBase64: downscaled.imageBase64,
            mimeType: downscaled.mimeType,
            sourceType: defaultSourceType,
            origin: file.name,
          });
        }
      }

      setPages((prev) => {
        const combined = [...prev, ...newPages];
        if (combined.length > MAX_PAGES) {
          setError(`Up to ${MAX_PAGES} pages per upload — ${combined.length} selected, extra pages were dropped.`);
          return combined.slice(0, MAX_PAGES);
        }
        return combined;
      });
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

  async function deleteBook(doc: DocumentRowView) {
    if (!window.confirm(`Delete "${doc.title}"? Its pages and search index are removed for good.`)) return;
    setError(null);
    const res = await fetch(`/api/library/${doc.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Delete failed");
    await load();
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

    setSubmitting(true);
    setUploadProgress(null);
    setPagesSent(0);
    try {
      // Split into contiguous same-type runs (mixed content → separate documents),
      // then split each run further by cumulative payload size — a single request
      // carrying a whole 20-30 page batch as base64 can get silently truncated
      // well under any size we'd choose to warn about, so every batch stays under
      // a conservative cap and batches for one document upload sequentially,
      // threading the same documentId through so they land in one document.
      const groups = groupByContiguousSourceType(pages);
      const documentIds: string[] = [];
      const typeLabel = (t: SourceType) => SOURCE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

      for (const group of groups) {
        const batches = chunkBySize(group, MAX_BATCH_BASE64_CHARS);
        let documentId: string | undefined;
        let pageOffset = 1;

        for (let i = 0; i < batches.length; i++) {
          setUploadProgress(
            `Reading ${typeLabel(group[0].sourceType).toLowerCase()} pages${batches.length > 1 ? ` (part ${i + 1} of ${batches.length})` : ""}`
          );

          const res = await fetch("/api/library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title.trim(),
              subject: subject.trim(),
              grade: grade.trim(),
              rightsConfirmed,
              sourceType: group[0].sourceType,
              pages: batches[i].map(({ imageBase64, mimeType, text, hint }) =>
                text !== undefined ? { text } : { imageBase64, mimeType, hint }
              ),
              documentId,
              startPageNumber: pageOffset,
              finalize: i === batches.length - 1,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          documentId = data.documentId;
          pageOffset += batches[i].length;
          setPagesSent((n) => n + batches[i].length);
        }

        documentIds.push(documentId!);
      }

      setSuccess(
        `Uploaded and indexed "${title}" (${pages.length} page${pages.length > 1 ? "s" : ""}` +
          (documentIds.length > 1 ? `, split into ${documentIds.length} documents by type` : "") +
          `).`
      );
      setTitle("");
      setPages([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  if (loading) return <PageSkeleton rows={2} />;

  const progressPct = pages.length > 0 ? Math.round((pagesSent / pages.length) * 100) : 0;

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
              Photos, PDF or Word (.docx), up to {MAX_PAGES} pages. Word files are read as text, pictures included.
            </span>
          </label>

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
            <div className="flex justify-between text-xs text-slate-600">
              <span>{uploadProgress ?? "Uploading"}... keep this page open</span>
              <span className="tabular-nums">
                {pagesSent}/{pages.length}
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

        <button disabled={submitting || processingFiles || pages.length === 0} className={cx(button.primary, "w-full sm:w-auto")}>
          {submitting ? <Spinner /> : <UploadIcon className="h-4.5 w-4.5" />}
          {submitting
            ? "Reading pages..."
            : pages.length
              ? `Upload & read ${pages.length} page${pages.length === 1 ? "" : "s"}`
              : "Upload & read"}
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">Your books</h2>
          {documents.length > 0 && <span className="text-xs text-slate-400">{documents.length} in total</span>}
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
                  <StatusBadge status={d.status} />
                </div>
                <button
                  onClick={() => deleteBook(d)}
                  className={button.iconDanger}
                  aria-label={`Delete "${d.title}"`}
                  title="Delete"
                >
                  <TrashIcon className="h-4.5 w-4.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentRowView["status"] }) {
  if (status === "ready") return <Badge tone="success">Ready</Badge>;
  if (status === "failed") return <Badge tone="danger">Upload failed: delete and try again</Badge>;
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
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
          {index + 1}
        </span>
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
        <p className="truncate text-[11px] text-slate-500" title={page.origin}>
          {page.origin}
        </p>
        <select
          value={page.sourceType}
          onChange={(e) => onTypeChange(page.id, e.target.value as SourceType)}
          disabled={disabled}
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
