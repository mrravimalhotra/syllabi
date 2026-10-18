"use client";

import Link from "next/link";
import { ChatIcon, ClipboardIcon, DownloadIcon, LayersIcon, ListCheckIcon, NotesIcon, SparklesIcon, TrashIcon } from "@/components/icons";
import { PdfButton } from "@/components/PdfButton";
import { button } from "@/components/ui";
import { formatDate, taskLabel } from "@/lib/format";
import type { GeneratedDocumentRow } from "@/types/database";

export type Row = Pick<GeneratedDocumentRow, "id" | "title" | "task_type" | "created_at">;

const TASK_ICONS: Record<string, typeof ListCheckIcon> = {
  solution: ListCheckIcon,
  notes: NotesIcon,
  sample_paper: ClipboardIcon,
  ad_hoc: ChatIcon,
  study_pack: LayersIcon,
};

/** One saved answer: its kind and date, a link to open it, and buttons to download it as a PDF or delete it. */
export function DocumentRow({ doc: d, onDelete }: { doc: Row; onDelete: () => void }) {
  const Icon = TASK_ICONS[d.task_type] ?? SparklesIcon;
  return (
    <li key={d.id} className="group relative flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={`/dashboard/documents/${d.id}`}
          className="block truncate text-sm font-medium text-slate-900 after:absolute after:inset-0"
        >
          {d.title}
        </Link>
        <p className="mt-0.5 text-xs text-slate-500">
          {taskLabel(d.task_type)} · {formatDate(d.created_at)}
        </p>
      </div>
      {/* Above the row-wide link, so these stay clickable. */}
      <div className="relative flex items-center gap-1">
        <PdfButton url={`/api/documents/${d.id}/pdf`} name={d.title} className={button.icon} label={`Download "${d.title}" as PDF`}>
          <DownloadIcon className="h-4.5 w-4.5" />
        </PdfButton>
        <button type="button" onClick={onDelete} className={button.iconDanger} aria-label={`Delete "${d.title}"`} title="Delete">
          <TrashIcon className="h-4.5 w-4.5" />
        </button>
      </div>
    </li>
  );
}
