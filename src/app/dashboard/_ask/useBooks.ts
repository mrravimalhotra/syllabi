"use client";

import { useEffect, useState } from "react";
import { keep, peek } from "@/lib/client-cache";
import type { Book } from "@/app/dashboard/_ask/constants";
import { ANY_BOOK, effectiveFilter, filterOptions, isBookFilter, matchingBooks, type BookFilter } from "@/lib/book-filter";
import { usePref } from "@/lib/use-pref";

/**
 * The person's own books (only the ones that are ready), narrowed by class, subject and chapter (remembered on this
 * device, so Solve opens on the chapter used last), and which of those answers search (all of them by default).
 * `books` is the narrowed list; `allBooks` every ready book.
 */
export function useBooks() {
  const [allBooks, setBooks] = useState<Book[]>(() => peek<Book[]>("books") ?? []);
  const [savedFilter, saveFilter] = usePref<BookFilter>("ask-book-filter", ANY_BOOK, isBookFilter);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [loaded, setLoaded] = useState(() => peek("books") !== undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/library?progress=0");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setBooks(
          keep(
            "books",
            (data.documents as Book[]).filter((b) => b.status === "ready")
          )
        );
        setLoaded(true);
      } catch {
        setFailed(true);
      }
    }
    void load();
  }, []);

  const books = matchingBooks(allBooks, savedFilter);
  const shown = new Set(books.map((b) => b.id));
  const activeIds = selected ? selected.filter((id) => shown.has(id)) : books.map((b) => b.id);

  return {
    books,
    allBooks,
    filter: effectiveFilter(allBooks, savedFilter),
    filterOptions: filterOptions(allBooks, savedFilter),
    /** A new class, subject or chapter: every book it lets through is picked. */
    setFilter: (next: BookFilter) => {
      saveFilter(next);
      setSelected(null);
    },
    loaded,
    failed,
    activeIds,
    selectAll: () => setSelected(null),
    selectNone: () => setSelected([]),
    selectOnly: (ids: string[]) => setSelected(ids),
    toggle: (id: string) =>
      setSelected((prev) => {
        const current = prev ?? books.map((b) => b.id);
        return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      }),
  };
}
