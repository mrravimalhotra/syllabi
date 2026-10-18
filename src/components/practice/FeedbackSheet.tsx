"use client";

import { OrderRow } from "@/components/practice/OrderRow";
import type { QuizResult } from "@/components/practice/quiz-types";
import { WhyPanel } from "@/components/practice/WhyPanel";
import { button, cx } from "@/components/ui";
import { explain } from "@/lib/practice/order";

const PRAISE = [
  "Correct!",
  "Well done!",
  "Spot on!",
  "Brilliant!",
  "Great work!",
];
const ENCOURAGE = ["Not quite", "Nearly there", "Good try"];

interface Props {
  feedback: QuizResult;
  index: number;
  total: number;
  showWhy: boolean;
  onToggleWhy: () => void;
  onNext: () => void;
  /** Focus moves here when the sheet opens, so keyboard and screen-reader users land on the result. */
  titleRef: React.RefObject<HTMLParagraphElement | null>;
}

/** The sheet that slides up after Check: right or wrong, the two orders, why, and the Next button. */
export function FeedbackSheet({
  feedback,
  index,
  total,
  showWhy,
  onToggleWhy,
  onNext,
  titleRef,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/30"
      onClick={(e) => e.target === e.currentTarget && onNext()}
    >
      <div className="pb-safe flex max-h-[88dvh] w-full max-w-xl animate-slide-up flex-col rounded-t-3xl bg-white shadow-2xl sm:mb-6 sm:rounded-3xl">
        <div className="overflow-y-auto px-5 pt-5">
          <p
            ref={titleRef}
            tabIndex={-1}
            className={cx(
              "text-2xl font-semibold outline-none",
              feedback.correct ? "text-emerald-700" : "text-amber-700",
            )}
            role="status"
          >
            {feedback.correct
              ? PRAISE[index % PRAISE.length]
              : ENCOURAGE[index % ENCOURAGE.length]}
          </p>
          <div className="mt-3 space-y-3">
            <OrderRow
              label="Your order"
              numbers={feedback.picked}
              marks={feedback.marks}
              ascending={feedback.question.ascending}
            />
            {!feedback.correct && (
              <OrderRow
                label="Right order"
                numbers={feedback.question.answer}
                ascending={feedback.question.ascending}
              />
            )}
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => onToggleWhy()}
              className={button.ghost}
              aria-expanded={showWhy}
            >
              {showWhy ? "Hide why" : "Why is this the order?"}
            </button>
            {showWhy && (
              <div className="mt-2 animate-fade-in">
                <WhyPanel explanation={explain(feedback.question)} />
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={onNext}
            className={cx(button.primary, "w-full")}
          >
            {index < total - 1 ? "Next question" : "See my score"}
          </button>
        </div>
      </div>
    </div>
  );
}
