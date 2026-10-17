"use client";

import { useEffect, useState } from "react";
import { downscaleImageFile } from "@/lib/downscale-image";
import { EditableName } from "@/components/EditableName";

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
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

  function removePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  function setPageSourceType(id: string, sourceType: SourceType) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, sourceType } : p)));
  }

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
          if (groups.length > 1 || batches.length > 1) {
            setUploadProgress(
              `Uploading ${typeLabel(group[0].sourceType)} pages${batches.length > 1 ? ` (batch ${i + 1}/${batches.length})` : ""}...`
            );
          }

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

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">My books</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload photos, a PDF or a Word file of your child&apos;s or student&apos;s books, worksheets and past
          papers. Syllabi reads every page so answers come from these books. Your books are private:
          only you can see and search them. Reading pages uses part of your monthly token quota.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

        <div>
          <label className="text-xs font-medium text-slate-500">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Science Class 8 — Chapter 3: Motion"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Science"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Grade / class</label>
            <input
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. Class 8"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Default type for new pages</label>
            <select
              value={defaultSourceType}
              onChange={(e) => setDefaultSourceType(e.target.value as SourceType)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              {SOURCE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500">Pages</label>
          <div className="mt-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
            <input
              type="file"
              accept="image/*,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              disabled={processingFiles}
              className="block w-full cursor-pointer text-sm text-slate-600 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
            <p className="mt-2 text-xs text-slate-400">
              Photos (JPG, PNG), PDF or Word (.docx) — up to {MAX_PAGES} pages total. Word files are read as text,
              and their pictures are read too.
            </p>
            {processingFiles && <p className="mt-2 text-xs text-slate-500">Processing pages...</p>}
          </div>

          {pages.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-slate-500">
                {pages.length} page{pages.length > 1 ? "s" : ""} — set the type per page if a batch mixes
                content (e.g. a chapter followed by its exercises); mixed types are uploaded as separate
                documents automatically.
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {pages.map((p, i) => (
                  <li key={p.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="relative">
                      {p.text !== undefined ? (
                        <p className="h-24 overflow-hidden whitespace-pre-line rounded bg-slate-50 p-1.5 text-[9px] leading-tight text-slate-600">
                          {p.text.slice(0, 400)}
                        </p>
                      ) : (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element -- local data-URI preview, not a remote image */}
                          <img
                            src={`data:${p.mimeType};base64,${p.imageBase64}`}
                            alt={`Page ${i + 1}`}
                            className="h-24 w-full rounded object-cover"
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removePage(p.id)}
                        aria-label={`Remove page ${i + 1}`}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-xs text-white hover:bg-slate-900"
                      >
                        ×
                      </button>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-400" title={p.origin}>
                      {p.origin}
                    </p>
                    <select
                      value={p.sourceType}
                      onChange={(e) => setPageSourceType(p.id, e.target.value as SourceType)}
                      className="mt-1 block w-full rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                    >
                      {SOURCE_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(e) => setRightsConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>
            I own this copy (printed or digital) and will use it only to help my own child or
            students study. I won&apos;t upload material I don&apos;t have the right to use.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            disabled={submitting || processingFiles}
            className="min-h-11 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:min-h-0"
          >
            {submitting ? "Uploading & indexing..." : "Upload & index"}
          </button>
          {uploadProgress && <p className="text-xs text-slate-500">{uploadProgress}</p>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Subject · Grade</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">
                  <EditableName value={d.title} onSave={(title) => renameBook(d.id, title)} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {[d.subject, d.grade].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{d.source_type}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.status === "ready"
                        ? "bg-emerald-50 text-emerald-700"
                        : d.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteBook(d)} className="min-h-11 px-2 text-xs font-medium text-red-600 hover:underline sm:min-h-0">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {loadFailed && (
              <tr>
                <td colSpan={5} role="alert" className="px-4 py-6 text-center text-red-700">
                  Couldn&apos;t load your books. Check your connection and reload the page.
                </td>
              </tr>
            )}
            {documents.length === 0 && !loadFailed && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No books yet. Upload your first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
