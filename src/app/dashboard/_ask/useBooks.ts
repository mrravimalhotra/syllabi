"use client";

import { useEffect, useState } from "react";
import { keep, peek } from "@/lib/client-cache";
import type { Book } from "@/app/dashboard/_ask/constants";

/** The person's own books (only the ones that are ready), and which of them answers search (all by default). */
export function useBooks() {
  const [books, setBooks] = useState<Book[]>(() => peek<Book[]>("books") ?? []);
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

  const activeIds = selected ?? books.map((b) => b.id);

  return {
    books,
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
