"use client";

import { EarnedStars } from "@/components/rewards/Rewards";
import type { ReactNode } from "react";
import { Burst } from "@/components/kindergarten/Burst";
import { button, card, cx } from "@/components/ui";

/** The play space every kindergarten screen sits in: a soft sky wash, the children's letter font, and room to breathe on a tablet. */
export const STAGE = cx(card, "kg-stage font-kid min-h-[calc(100dvh-13rem)] border-sky-100 md:min-h-[36rem]");

/** The top of every kindergarten round: a way back, progress (a star for each question done) and the stars so far. */
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
    <section className={cx(STAGE, "space-y-5 p-4 sm:p-6")} aria-label="Activity">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onExit} className={cx(button.small, "bg-white/80")}>
          ← Menu
        </button>
        <div className="flex items-center gap-1.5" role="img" aria-label={`Question ${Math.min(index + 1, total)} of ${total}`}>
          {Array.from({ length: total }, (_, i) =>
            i < index ? (
              <span key={i} className="kg-pop text-sm leading-none text-amber-400" aria-hidden>
                ★
              </span>
            ) : (
              <span key={i} className={cx("rounded-full", i === index ? "h-3.5 w-3.5 bg-brand-500" : "h-3 w-3 bg-slate-200")} />
            )
          )}
        </div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-lg font-bold tabular-nums" aria-label={`${stars} stars`}>
          <span key={stars} className={stars > 0 ? "kg-bump" : undefined} aria-hidden>
            ⭐
          </span>{" "}
          {stars}
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
    <section className={cx(STAGE, "flex flex-col items-center justify-center gap-5 p-6 text-center")} aria-label="Well done">
      <div className="relative">
        <p className="kg-pop text-7xl sm:text-8xl" aria-hidden>
          🏆
        </p>
        <Burst />
      </div>
      <h2 className="kg-pop text-3xl font-bold text-slate-900 sm:text-4xl" style={{ animationDelay: "0.15s" }}>
        Well done!
      </h2>
      <p className="flex max-w-md flex-wrap justify-center gap-1 text-4xl sm:text-5xl" aria-label={`You earned ${stars} stars`}>
        {Array.from({ length: stars }, (_, i) => (
          <span key={i} className="kg-star" style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
            ⭐
          </span>
        ))}
      </p>
      <EarnedStars stars={stars} />
      {helped.length > 0 && (
        <p className="max-w-md font-sans text-sm text-slate-600">
          For the grown-up: needed another go on <span className="font-medium text-slate-800">{helped.join(", ")}</span>. Try this activity
          again soon.
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onAgain} className={cx(button.primary, "min-h-14 rounded-2xl px-8 text-xl")}>
          Play again
        </button>
        <button type="button" onClick={onExit} className={cx(button.secondary, "min-h-14 rounded-2xl px-6 text-lg")}>
          Back to the menu
        </button>
      </div>
    </section>
  );
}
