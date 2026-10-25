"use client";

import type { Book } from "@/app/dashboard/_ask/constants";

/** Which books the answer will come from, by name, so it is plain what the answer is based on. Tapping it opens the book picker. */
export function BooksInUse({ books, activeIds, onChange }: { books: Book[]; activeIds: string[]; onChange: () => void }) {
  const chosen = books.filter((b) => activeIds.includes(b.id));
  if (chosen.length === 0) return null;
  const names = chosen.slice(0, 2).map((b) => b.title);
  const more = chosen.length - names.length;
  return (
    <p className="border-t border-slate-100 px-4 pt-3 text-xs text-slate-500">
      From your books: <span className="font-medium text-slate-700">{names.join(", ")}</span>
      {more > 0 && <span className="text-slate-500"> and {more} more</span>}.{" "}
      <button type="button" onClick={onChange} className="font-medium text-brand-700 hover:underline">
        Change
      </button>
    </p>
  );
}
