"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { card, cx, input } from "@/components/ui";
import type { StudyPack } from "@/lib/study-pack/types";

/** Every word of the chapter with its meaning, with a box to find one. */
export function Glossary({ pack }: { pack: StudyPack }) {
  const [query, setQuery] = useState("");
  const words = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pack.glossary.filter((v) => !q || v.word.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q));
  }, [pack.glossary, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a word"
          aria-label="Find a word"
          className={cx(input, "pl-10")}
        />
      </div>
      <dl className={cx(card, "divide-y divide-slate-100")}>
        {words.map((v) => (
          <div key={v.word} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4 sm:px-5">
            <dt className="text-sm font-semibold text-slate-900">{v.word}</dt>
            <dd className="text-sm text-slate-600">{v.meaning}</dd>
          </div>
        ))}
        {words.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No matching words.</p>}
      </dl>
    </div>
  );
}
