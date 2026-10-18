"use client";

import type { MatchSheet as Match } from "@/lib/kindergarten/worksheets";

/** Pictures down the left and words down the right, to draw a line between. */
export function MatchSheet({ sheet: match }: { sheet: Match }) {
  return (
    <ol className="space-y-2">
      {match.pictures.map((p, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="w-6 text-right text-sm font-semibold text-slate-500">{i + 1}.</span>
          <span className="w-14 text-4xl leading-none" aria-label="Picture" role="img">
            {p.emoji}
          </span>
          <span className="text-xl text-slate-500" aria-hidden>
            ●
          </span>
          <span className="flex-1" />
          <span className="text-xl text-slate-500" aria-hidden>
            ●
          </span>
          <span className="w-24 text-2xl font-semibold text-slate-800">{match.words[i]}</span>
        </li>
      ))}
    </ol>
  );
}
