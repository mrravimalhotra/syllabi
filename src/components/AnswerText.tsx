"use client";

import { Markdown } from "@/components/Markdown";
import { ScorePair } from "@/components/ScorePair";
import { cx } from "@/components/ui";
import { splitAnswerBlocks } from "@/lib/generation/blocks";
import type { AnswerConfidence } from "@/lib/generation/confidence";

const STYLE = {
  amber: { box: "border-amber-400 bg-amber-50/70", tag: "bg-amber-100 text-amber-900" },
  red: { box: "border-red-400 bg-red-50/70", tag: "bg-red-100 text-red-800" },
} as const;

/**
 * The answer's text. Each question of an exercise shows its own two numbers ("96 : 88"); one worth checking first
 * (a problem found, or mostly not in the books) is also highlighted, amber or red, with the reason. Nothing of this
 * is printed.
 */
export function AnswerText({ text, confidence }: { text: string; confidence: AnswerConfidence | null | undefined }) {
  const review = confidence?.review ?? [];
  const questions = confidence?.questions ?? [];
  if (review.length === 0 && questions.length === 0) return <Markdown text={text} />;
  const flagged = new Map(review.map((r) => [r.index, r]));
  const scored = new Map(questions.map((q) => [q.index, q]));
  return (
    <div className="space-y-4">
      {splitAnswerBlocks(text).map((block, i) => {
        const item = flagged.get(i);
        const score = scored.get(i);
        if (!item && !score) return <Markdown key={i} text={block.text} />;
        const style = item ? STYLE[item.level] : null;
        return (
          <section
            key={i}
            id={`q-${i}`}
            aria-label={item ? `Answer to check: ${item.label}` : `Answer ${score!.label}`}
            className={cx("scroll-mt-24", style && "rounded-lg border-l-4 py-2 pr-2 pl-3 print:border-0 print:bg-transparent print:p-0", style?.box)}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2 print:hidden">
              {score && <ScorePair correct={score.correct} fromBook={score.fromBook} label={score.label} />}
              {item && style && (
                <p className={cx("inline-block rounded-md px-2 py-0.5 text-xs font-medium", style.tag)} data-testid="review-tag">
                  Check this answer: {item.reason}
                </p>
              )}
            </div>
            <Markdown text={block.text} />
          </section>
        );
      })}
    </div>
  );
}
