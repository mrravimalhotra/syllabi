"use client";

import { StatusBadge } from "@/app/dashboard/library/_parts/BookParts";
import type { DocumentRowView } from "@/app/dashboard/library/_parts/upload-helpers";
import { EditableName } from "@/components/EditableName";
import { BookIcon, DownloadIcon, TrashIcon } from "@/components/icons";
import { Alert, EmptyState, Spinner, button, card, cx, link } from "@/components/ui";
import { sourceTypeLabel } from "@/lib/format";

interface Props {
  documents: DocumentRowView[];
  loadFailed: boolean;
  /** Books being deleted right now. */
  deleting: string[];
  /** Books being made into a PDF to download right now. */
  downloading: string[];
  /** Book id → why the last action on it failed. */
  errors: Record<string, string>;
  /** An upload that stopped part-way, or a book whose pages never arrived. */
  isUnfinished: (d: DocumentRowView) => boolean;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (d: DocumentRowView) => void;
  onDownload: (d: DocumentRowView) => void;
  onRetry: (id: string) => void;
  onRemoveUnfinished: () => void;
}

/** "Your books": each book with its reading progress, and the ways to rename, retry or delete it. */
export function BookList({
  documents,
  loadFailed,
  deleting,
  downloading,
  errors,
  isUnfinished,
  onRename,
  onDelete,
  onDownload,
  onRetry,
  onRemoveUnfinished,
}: Props) {
  const unfinishedCount = documents.filter(isUnfinished).length;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Your books</h2>
        <div className="flex items-baseline gap-3">
          {unfinishedCount > 0 && (
            <button type="button" onClick={onRemoveUnfinished} className={cx(link, "text-xs text-red-600")}>
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
                <EditableName value={d.title} onSave={(title) => onRename(d.id, title)} className="text-sm font-medium text-slate-900" />
                <p className="truncate text-xs text-slate-500">
                  {[d.subject, d.grade, sourceTypeLabel(d.source_type)].filter(Boolean).join(" · ")}
                </p>
                <StatusBadge status={d.status} unfinished={isUnfinished(d)} pages={d.pages} />
                {d.pages && d.pages.failed > 0 && d.status !== "processing" && (
                  <p className="text-xs text-red-600">
                    {d.pages.failed} page{d.pages.failed === 1 ? "" : "s"} couldn&apos;t be read: {d.pages.problems.join(" ")}{" "}
                    <button type="button" onClick={() => onRetry(d.id)} className={cx(link, "text-xs")}>
                      Try {d.pages.failed === 1 ? "it" : "them"} again
                    </button>
                  </p>
                )}
                {d.pages && d.status === "processing" && d.pages.problems.length > 0 && !d.pages.waitingUntil && (
                  <p className="text-xs text-amber-700">
                    Some pages are taking longer and will be tried again shortly. Reason: {d.pages.problems[0]}
                  </p>
                )}
                {errors[d.id] && <p className="text-xs text-red-600">{errors[d.id]}</p>}
              </div>
              <button
                onClick={() => onDownload(d)}
                disabled={downloading.includes(d.id) || d.status === "failed"}
                className={button.icon}
                aria-label={`Download "${d.title}" as a PDF`}
                title="Download as PDF"
              >
                {downloading.includes(d.id) ? <Spinner className="h-4.5 w-4.5" /> : <DownloadIcon className="h-4.5 w-4.5" />}
              </button>
              <button
                onClick={() => onDelete(d)}
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
  );
}
