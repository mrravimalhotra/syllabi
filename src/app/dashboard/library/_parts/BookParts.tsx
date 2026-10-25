"use client";

import Link from "next/link";
import { memo } from "react";
import { Badge, Spinner, cx, link } from "@/components/ui";
import { XIcon } from "@/components/icons";
import { SOURCE_TYPE_OPTIONS, type DocumentRowView, type PageProgress, type PendingPage } from "@/app/dashboard/library/_parts/upload-helpers";
import type { SourceType } from "@/types/database";

export function StatusBadge({ status, unfinished, pages }: { status: DocumentRowView["status"]; unfinished: boolean; pages: PageProgress | null }) {
  if (pages?.allowancePaused && status !== "failed") {
    const usable = status === "ready" ? "Ready to use with" : "Paused at";
    return (
      <Badge tone="warning">
        {usable} {pages.done} of {pages.total} pages: this month&apos;s allowance is used up. The rest are read by themselves on the 1st, or
        sooner if the person who runs Syllabi raises your limit
      </Badge>
    );
  }
  if (status === "ready") return <Badge tone="success">Ready</Badge>;
  if (unfinished) return <Badge tone="danger">Upload incomplete: delete this book and upload it again</Badge>;
  if (status === "failed") return <Badge tone="danger">No page could be read: check the photos are clear, then try again or upload again</Badge>;
  if (pages?.waitingUntil) {
    const time = new Date(pages.waitingUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return (
      <Badge tone="warning">
        Paused at {pages.done} of {pages.total} pages: the daily limit of the reading service was reached. It carries on by itself after {time}
      </Badge>
    );
  }
  return (
    <Badge tone="warning">
      <Spinner className="h-3 w-3" /> Reading pages{pages ? `: ${pages.done} of ${pages.total}` : ""}
    </Badge>
  );
}

/** Opens the book's saved pages, once any page has been read. */
export function ViewPagesLink({ doc }: { doc: DocumentRowView }) {
  if (doc.status !== "ready" && (doc.pages?.done ?? 0) === 0) return null;
  return (
    <Link href={`/dashboard/library/${doc.id}`} className={cx(link, "block text-xs")}>
      View pages
    </Link>
  );
}

/** One page waiting to be uploaded. Memoised so typing a title doesn't redraw every page image. */
export const PageCard = memo(function PageCard({
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
            title="Typed text found in the PDF: this page needs no AI reading"
          >
            Typed text
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
          aria-label={`Kind of material for page ${index + 1}`}
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
