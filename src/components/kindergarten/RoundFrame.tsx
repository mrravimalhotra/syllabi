"use client";

import type { ReactNode } from "react";
import { button, card, cx } from "@/components/ui";

/** The top of every kindergarten round: a way back, progress dots and the stars so far. */
export function RoundFrame({
  index,
  total,
  stars,
  onExit,
  children,
}: {
  index: number;
  total: number;
  stars: number;
  onExit: () => void;
  children: ReactNode;
}) {
  return (
    <section className={cx(card, "space-y-5 p-4 sm:p-6")} aria-label="Activity">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onExit} className={button.small}>
          ← Menu
        </button>
        <div className="flex gap-1.5" role="img" aria-label={`Question ${Math.min(index + 1, total)} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx("h-3 w-3 rounded-full", i < index ? "bg-amber-400" : i === index ? "bg-brand-500" : "bg-slate-200")} />
          ))}
        </div>
        <span className="text-lg font-semibold tabular-nums" aria-label={`${stars} stars`}>
          ⭐ {stars}
        </span>
      </div>
      {children}
    </section>
  );
}

/** The end of a round: stars earned, a note for the grown-up about words that needed help, and what to do next. */
export function RoundDone({
  stars,
  helped,
  onAgain,
  onExit,
}: {
  stars: number;
  /** What needed another go, for the grown-up (words, or "5 vs 3"). */
  helped: string[];
  onAgain: () => void;
  onExit: () => void;
}) {
  return (
    <section className={cx(card, "space-y-5 p-6 text-center")} aria-label="Well done">
      <p className="text-5xl" aria-hidden>
        🎉
      </p>
      <h2 className="text-2xl font-semibold text-slate-900">Well done!</h2>
      <p className="flex flex-wrap justify-center gap-1 text-4xl" aria-label={`You earned ${stars} stars`}>
        {Array.from({ length: stars }, (_, i) => (
          <span key={i} className="kg-star" style={{ animationDelay: `${i * 0.12}s` }}>
            ⭐
          </span>
        ))}
      </p>
      {helped.length > 0 && (
        <p className="text-sm text-slate-500">
          For the grown-up: needed another go on <span className="font-medium text-slate-700">{helped.join(", ")}</span>. Try this activity again soon.
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onAgain} className={button.primary}>
          Play again
        </button>
        <button type="button" onClick={onExit} className={button.secondary}>
          Back to the menu
        </button>
      </div>
    </section>
  );
}
