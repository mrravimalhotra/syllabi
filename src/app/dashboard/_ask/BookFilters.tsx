"use client";

import { ANY_BOOK, type BookFilter } from "@/lib/book-filter";
import { cx, input } from "@/components/ui";

interface Props {
  filter: BookFilter;
  options: Record<keyof BookFilter, string[]>;
  onChange: (next: BookFilter) => void;
}

const FIELDS: { key: keyof BookFilter; label: string; any: string }[] = [
  { key: "grade", label: "Class", any: "All classes" },
  { key: "subject", label: "Subject", any: "All subjects" },
  { key: "chapter", label: "Chapter", any: "All chapters" },
];

/**
 * Class, subject and chapter, to narrow a long list of books (choosing a chapter picks its textbook and exercises
 * together). Each list offers only what the books chosen so far have; a list with nothing to choose between is left out.
 */
export function BookFilters({ filter, options, onChange }: Props) {
  // A field with one label still shows while it is chosen, so the choice can be undone.
  const shown = FIELDS.filter((f) => options[f.key].length > 1 || filter[f.key]);
  if (shown.length === 0) return null;

  function change(key: keyof BookFilter, value: string) {
    // A different class or subject may not have the chapter chosen before: the later choices start again.
    const later = FIELDS.slice(FIELDS.findIndex((f) => f.key === key) + 1).map((f) => f.key);
    onChange({ ...filter, [key]: value, ...Object.fromEntries(later.map((k) => [k, ANY_BOOK[k]])) });
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 pt-3 sm:px-5" role="group" aria-label="Choose the books by class, subject and chapter">
      {shown.map((f) => (
        <label key={f.key} className="min-w-0 flex-1 basis-32 text-xs text-slate-500">
          <span className="sr-only">{f.label}</span>
          <select
            value={filter[f.key]}
            onChange={(e) => change(f.key, e.target.value)}
            aria-label={f.label}
            className={cx(input, "w-full py-1.5 text-sm")}
          >
            <option value="">{f.any}</option>
            {options[f.key].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
