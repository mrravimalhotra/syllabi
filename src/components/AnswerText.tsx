"use client";

import { Markdown } from "@/components/Markdown";
import { cx } from "@/components/ui";
import { splitAnswerBlocks } from "@/lib/generation/blocks";
import type { AnswerConfidence } from "@/lib/generation/confidence";

const STYLE = {
  amber: { box: "border-amber-400 bg-amber-50/70", tag: "bg-amber-100 text-amber-900" },
  red: { box: "border-red-400 bg-red-50/70", tag: "bg-red-100 text-red-800" },
} as const;

/**
 * The answer's text. When some answers of an exercise are mostly not in the books, each of those is highlighted
 * (amber or red) with the reason, so a person can check them first. Nothing is highlighted in a print.
 */
export function AnswerText({ text, confidence }: { text: string; confidence: AnswerConfidence | null | undefined }) {
  const review = confidence?.review;
  if (!review || review.length === 0) return <Markdown text={text} />;
  const flagged = new Map(review.map((r) => [r.index, r]));
  return (
    <div className="space-y-4">
      {splitAnswerBlocks(text).map((block, i) => {
        const item = flagged.get(i);
        if (!item) return <Markdown key={i} text={block.text} />;
        const style = STYLE[item.level];
        return (
          <section
            key={i}
            id={`review-${i}`}
            aria-label={`Answer to check: ${item.label}`}
            className={cx("scroll-mt-24 rounded-lg border-l-4 py-2 pr-2 pl-3 print:border-0 print:bg-transparent print:p-0", style.box)}
          >
            <p
              className={cx("mb-1 inline-block rounded-md px-2 py-0.5 text-xs font-medium print:hidden", style.tag)}
              data-testid="review-tag"
            >
              Check this answer: {item.reason}
            </p>
            <Markdown text={block.text} />
          </section>
        );
      })}
    </div>
  );
}
