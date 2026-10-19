"use client";

import { useState } from "react";
import type { LongPdf } from "@/app/dashboard/_ask/attachments";
import { button, input } from "@/components/ui";

interface Props {
  pdf: LongPdf;
  /** How many more pages the question can take. */
  room: number;
  busy: boolean;
  onAttach: (first: number, last: number) => void;
  onSkip: () => void;
}

/** Shown for a PDF with more pages than a question can carry: choose which pages (for example 11 to 16) to attach. */
export function PdfPagePicker({ pdf, room, busy, onAttach, onSkip }: Props) {
  const [first, setFirst] = useState("1");
  const [last, setLast] = useState(String(Math.min(pdf.total, Math.max(room, 1))));
  const from = Number(first);
  const to = Number(last);
  const problem =
    room === 0
      ? "The question already has as many pages as it can take. Remove some first."
      : !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > pdf.total || to < from
        ? `Type page numbers from 1 to ${pdf.total}, for example 1 to ${Math.min(pdf.total, room || 1)}.`
        : to - from + 1 > room
          ? `A question takes ${room} more page${room === 1 ? "" : "s"} at most. Choose a shorter stretch.`
          : null;

  return (
    <div role="group" aria-label={`Choose pages of ${pdf.file.name}`} className="mx-4 mb-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:mx-5">
      <p>
        <span className="font-medium">{pdf.file.name}</span> has {pdf.total} pages. A question takes up to {room} more: choose the pages to attach.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          From page
          <input type="number" min={1} max={pdf.total} value={first} onChange={(e) => setFirst(e.target.value)} className={`${input} w-20`} />
        </label>
        <label className="flex items-center gap-1.5">
          to page
          <input type="number" min={1} max={pdf.total} value={last} onChange={(e) => setLast(e.target.value)} className={`${input} w-20`} />
        </label>
        <button type="button" disabled={busy || problem !== null} onClick={() => onAttach(from, to)} className={button.secondary}>
          Attach these pages
        </button>
        <button type="button" disabled={busy} onClick={onSkip} className={button.ghost}>
          Skip this PDF
        </button>
      </div>
      {problem && <p className="text-xs">{problem}</p>}
    </div>
  );
}
