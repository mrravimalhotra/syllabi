"use client";

import type { Book } from "@/app/dashboard/_ask/constants";
import { BookIcon } from "@/components/icons";
import { cx, link } from "@/components/ui";

interface Props {
  books: Book[];
  activeIds: string[];
  onAll: () => void;
  onNone: () => void;
  onToggle: (id: string) => void;
}

/** "Search these books": tap a book to include or leave it out of the answer. */
export function BookPicker({ books, activeIds, onAll, onNone, onToggle }: Props) {
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
              {(b.subject || b.grade) && <span className="shrink-0 text-slate-400">{[b.subject, b.grade].filter(Boolean).join(", ")}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
