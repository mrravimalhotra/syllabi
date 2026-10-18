"use client";

import { PageCard } from "@/app/dashboard/library/_parts/BookParts";
import { FileDropArea } from "@/app/dashboard/library/_parts/FileDropArea";
import { SOURCE_TYPE_OPTIONS, type PendingPage } from "@/app/dashboard/library/_parts/upload-helpers";
import { CheckIcon } from "@/components/icons";
import { cx, label, link } from "@/components/ui";
import type { SourceType } from "@/types/database";

/** The kind of material, the area to drop or choose files, and the pages chosen so far (each with its own kind). */
export function PageChooser({
  sourceType,
  onSourceType,
  pages,
  busy,
  preparing,
  running,
  note,
  onFiles,
  onRemovePage,
  onPageKind,
  onRemoveAll,
}: {
  sourceType: SourceType;
  onSourceType: (sourceType: SourceType) => void;
  pages: PendingPage[];
  busy: boolean;
  preparing: boolean;
  running: boolean;
  note: string | null;
  onFiles: (files: FileList | null) => void;
  onRemovePage: (id: string) => void;
  onPageKind: (id: string, sourceType: SourceType) => void;
  onRemoveAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className={label}>Pages</p>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Kind of material
          <select
            value={sourceType}
            onChange={(e) => onSourceType(e.target.value as SourceType)}
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

      <FileDropArea busy={busy} preparing={preparing} onFiles={onFiles} />

      {note && pages.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckIcon className="h-4 w-4" /> {note}
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
            <button type="button" onClick={onRemoveAll} disabled={running} className={cx(link, "text-xs")}>
              Remove all
            </button>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {pages.map((p, i) => (
              <PageCard key={p.id} page={p} index={i} disabled={running} onRemove={onRemovePage} onTypeChange={onPageKind} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
