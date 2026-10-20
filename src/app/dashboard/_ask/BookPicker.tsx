"use client";

import type { Book } from "@/app/dashboard/_ask/constants";
import { BookIcon } from "@/components/icons";
import { kindName } from "@/app/dashboard/_ask/commands";
import { sourceTypeLabel } from "@/lib/format";
import { cx, link } from "@/components/ui";
import { SOURCE_TYPES } from "@/types/database";

interface Props {
  books: Book[];
  activeIds: string[];
  onAll: () => void;
  onNone: () => void;
  /** Pick only the books of one kind (Exercise books, Test papers...). */
  onKind: (kind: Book["source_type"]) => void;
  onToggle: (id: string) => void;
}

/** "Search these books": tap a book to include or leave it out of the answer. */
export function BookPicker({ books, activeIds, onAll, onNone, onKind, onToggle }: Props) {
  // Only the kinds the person actually has, and only when there is more than one kind to choose between.
  const kinds = SOURCE_TYPES.filter((k) => books.some((b) => b.source_type === k));
  return (
    <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">Search these books</p>
        <div className="flex gap-3 text-xs">
          <button type="button" className={link} onClick={onAll}>
            All
          </button>
          <button type="button" className={link} onClick={onNone}>
            None
          </button>
        </div>
      </div>
      {kinds.length > 1 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>Only:</span>
          {kinds.map((kind) => (
            <button key={kind} type="button" className={link} onClick={() => onKind(kind)}>
              {kindName(kind)[0].toUpperCase() + kindName(kind).slice(1)}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {books.map((b) => {
          const on = activeIds.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(b.id)}
              className={cx(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
                on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              )}
            >
              <BookIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{b.title}</span>
              <span className="shrink-0 text-slate-400">{[b.subject, b.grade, sourceTypeLabel(b.source_type)].filter(Boolean).join(", ")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
