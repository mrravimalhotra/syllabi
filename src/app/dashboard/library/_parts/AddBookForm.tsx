"use client";

import { BookDetails } from "@/app/dashboard/library/_parts/BookDetails";
import { PageChooser } from "@/app/dashboard/library/_parts/PageChooser";
import { UploadButtons, UploadProgress } from "@/app/dashboard/library/_parts/UploadControls";
import type { PendingPage } from "@/app/dashboard/library/_parts/upload-helpers";
import { Alert, card, cx } from "@/components/ui";
import { UploadIcon } from "@/components/icons";
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
  note,
  onSubmit,
  onFiles,
  onRemovePage,
  onPageKind,
  onRemoveAll,
  onStop,
}: Props) {
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

      <BookDetails values={values} onChange={onChange} />

      <PageChooser
        sourceType={values.sourceType}
        onSourceType={(sourceType) => onChange({ sourceType })}
        pages={pages}
        busy={upload.preparing || upload.running}
        preparing={upload.preparing}
        running={upload.running}
        note={note}
        onFiles={onFiles}
        onRemovePage={onRemovePage}
        onPageKind={onPageKind}
        onRemoveAll={onRemoveAll}
      />

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

      {upload.running && <UploadProgress progress={upload.progress} sent={upload.sent} total={upload.total} />}

      <UploadButtons
        running={upload.running}
        preparing={upload.preparing}
        pageCount={pages.length}
        resuming={pages.some((p) => p.bookId)}
        onStop={onStop}
      />
    </form>
  );
}
