"use client";

import { SearchIcon } from "@/components/icons";
import { cx, input } from "@/components/ui";
import { taskLabel } from "@/lib/format";

interface Props {
  query: string;
  onQuery: (query: string) => void;
  /** The kinds of answer the person has. */
  types: string[];
  type: string;
  onType: (type: string) => void;
}

/** The search box, and the kind filters (only when there is more than one kind). */
export function DocumentFilters({ query, onQuery, types, type, onType }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by title"
          aria-label="Search your documents by title"
          className={cx(input, "pl-10")}
        />
      </div>
      {types.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:pb-0" role="group" aria-label="Filter by kind">
          {["all", ...types].map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => onType(t)}
              className={cx(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                type === t ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {t === "all" ? "All" : taskLabel(t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
