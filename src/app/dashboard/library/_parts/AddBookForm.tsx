"use client";

import { PageCard } from "@/app/dashboard/library/_parts/BookParts";
import { FileDropArea } from "@/app/dashboard/library/_parts/FileDropArea";
import { SOURCE_TYPE_OPTIONS, type PendingPage } from "@/app/dashboard/library/_parts/upload-helpers";
import { Alert, Field, Spinner, button, card, cx, input, label, link } from "@/components/ui";
import { CheckIcon, UploadIcon } from "@/components/icons";
import type { SourceType } from "@/types/database";

/** What the person types and chooses for the book. */
export interface BookValues {
  title: string;
  subject: string;
  grade: string;
  sourceType: SourceType;
  rightsConfirmed: boolean;
}

/** How far the current upload has got. */
interface UploadState {
  /** Photos and files are being read into pages. */
  preparing: boolean;
  /** Pages are being sent. */
  running: boolean;
  progress: string | null;
  sent: number;
  total: number;
}

interface Props {
  values: BookValues;
  onChange: (patch: Partial<BookValues>) => void;
  pages: PendingPage[];
  upload: UploadState;
  error: string | null;
  success: string | null;
  note: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onFiles: (files: FileList | null) => void;
  onRemovePage: (id: string) => void;
  onPageKind: (id: string, sourceType: SourceType) => void;
  onRemoveAll: () => void;
  onStop: () => void;
}

/** The "Add a book" form: details, a drop area for files, the pages chosen so far, and the Upload button with its progress. */
export function AddBookForm({
  values,
  onChange,
  pages,
  upload,
  error,
  success,
  note: shrinkNote,
  onSubmit,
  onFiles,
  onRemovePage,
  onPageKind,
  onRemoveAll,
  onStop,
}: Props) {
  const progressPct = upload.total > 0 ? Math.round((upload.sent / upload.total) * 100) : 0;
  const resuming = pages.some((p) => p.bookId);

  return (
    <form onSubmit={onSubmit} className={cx(card, "space-y-6 p-5 sm:p-6")}>
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
              value={values.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="e.g. Science Class 8, Chapter 3: Motion"
              maxLength={200}
              className={input}
            />
          </Field>
        </div>
        <Field label="Subject (optional)" htmlFor="book-subject">
          <input
            id="book-subject"
            value={values.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            placeholder="e.g. Science"
            maxLength={100}
            className={input}
          />
        </Field>
        <Field label="Class (optional)" htmlFor="book-grade">
          <input
            id="book-grade"
            value={values.grade}
            onChange={(e) => onChange({ grade: e.target.value })}
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
            Kind of material
            <select
              value={values.sourceType}
              onChange={(e) => onChange({ sourceType: e.target.value as SourceType })}
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

        <FileDropArea busy={upload.preparing || upload.running} preparing={upload.preparing} onFiles={onFiles} />

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
                · mixing a chapter with its exercises? Set the kind on each page.
              </p>
              <button type="button" onClick={onRemoveAll} disabled={upload.running} className={cx(link, "text-xs")}>
                Remove all
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {pages.map((p, i) => (
                <PageCard key={p.id} page={p} index={i} disabled={upload.running} onRemove={onRemovePage} onTypeChange={onPageKind} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <label className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        <input
          type="checkbox"
          checked={values.rightsConfirmed}
          onChange={(e) => onChange({ rightsConfirmed: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
        />
        <span>
          I own this copy (printed or digital) and will use it only to help my own child or students study. I won&apos;t upload material I
          don&apos;t have the right to use.
        </span>
      </label>

      {upload.running && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <div className="flex justify-between gap-3 text-xs text-slate-600">
            <span>{upload.progress ?? "Uploading"}... keep this page open (the screen stays on)</span>
            <span className="shrink-0 tabular-nums">
              {upload.sent} of {upload.total} sent
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
        <button disabled={upload.running || upload.preparing || pages.length === 0} className={cx(button.primary, "w-full sm:w-auto")}>
          {upload.running ? <Spinner /> : <UploadIcon className="h-4.5 w-4.5" />}
          {upload.running
            ? "Sending pages..."
            : pages.length
              ? `${resuming ? "Try again: read" : "Upload & read"} ${pages.length} page${pages.length === 1 ? "" : "s"}`
              : "Upload & read"}
        </button>
        {upload.running && (
          <button type="button" onClick={onStop} className={cx(button.secondary, "w-full sm:w-auto")}>
            Stop (keep the pages sent so far)
          </button>
        )}
      </div>
    </form>
  );
}
