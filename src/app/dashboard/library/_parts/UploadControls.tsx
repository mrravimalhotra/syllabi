"use client";

import { Spinner, button, cx } from "@/components/ui";
import { UploadIcon } from "@/components/icons";

/** How far the upload has got, under the form. */
export function UploadProgress({ progress, sent, total }: { progress: string | null; sent: number; total: number }) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex justify-between gap-3 text-xs text-slate-600">
        <span>{progress ?? "Uploading"}... keep this page open (the screen stays on)</span>
        <span className="shrink-0 tabular-nums">
          {sent} of {total} sent
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
    </div>
  );
}

/** The Upload button (its words say what will happen to the pages) and, while sending, Stop. */
export function UploadButtons({
  running,
  preparing,
  pageCount,
  resuming,
  onStop,
}: {
  running: boolean;
  preparing: boolean;
  pageCount: number;
  /** Some pages already belong to a book from an earlier try. */
  resuming: boolean;
  onStop: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={running || preparing || pageCount === 0} className={cx(button.primary, "w-full sm:w-auto")}>
        {running ? <Spinner /> : <UploadIcon className="h-4.5 w-4.5" />}
        {running
          ? "Sending pages..."
          : pageCount
            ? `${resuming ? "Try again: read" : "Upload & read"} ${pageCount} page${pageCount === 1 ? "" : "s"}`
            : "Upload & read"}
      </button>
      {running && (
        <button type="button" onClick={onStop} className={cx(button.secondary, "w-full sm:w-auto")}>
          Stop (keep the pages sent so far)
        </button>
      )}
    </div>
  );
}
