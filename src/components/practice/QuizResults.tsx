"use client";

import { EarnedStars } from "@/components/rewards/Rewards";
import { useState } from "react";
import { PrinterIcon } from "@/components/icons";
import { OrderRow } from "@/components/practice/OrderRow";
import type { QuizResult } from "@/components/practice/quiz-types";
import { WhyPanel } from "@/components/practice/WhyPanel";
import { button, cx } from "@/components/ui";
import { explain, type OrderQuestion } from "@/lib/practice/order";

/** The score screen: stars, a message, what to do next, and the questions that were missed with why. */
export function QuizResults({
  results,
  canPrint,
  onPrint,
  onNewQuiz,
  onRetry,
  onExit,
}: {
  results: QuizResult[];
  canPrint: boolean;
  onPrint: () => void;
  onNewQuiz: () => void;
  onRetry: (questions: OrderQuestion[]) => void;
  onExit: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const score = results.filter((r) => r.correct).length;
  const missed = results.filter((r) => !r.correct);
  const ratio = score / results.length;
  const stars = Math.max(1, Math.round(ratio * 5));
  const message =
    ratio === 1
      ? "Perfect score!"
      : ratio >= 0.8
        ? "Excellent work!"
        : ratio >= 0.6
          ? "Good job, keep going!"
          : ratio >= 0.4
            ? "Good try. Practice makes perfect."
            : "Keep practising, you'll get there.";

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 pb-24">
      <div className="space-y-2 text-center">
        <p
          className="text-3xl tracking-widest text-amber-400"
          aria-label={`${stars} out of 5 stars`}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className={cx("kg-star inline-block", i >= stars && "text-slate-200")}
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              ★
            </span>
          ))}
        </p>
        <p className="text-5xl font-bold text-slate-900 tabular-nums">
          {score}
          <span className="text-2xl font-medium text-slate-400">
            {" "}
            / {results.length}
          </span>
        </p>
        <p className="text-lg font-medium text-slate-700">{message}</p>
        <EarnedStars stars={score} />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {missed.length > 0 && (
          <button
            type="button"
            onClick={() => onRetry(missed.map((r) => r.question))}
            className={button.primary}
          >
            Practise the {missed.length} I missed
          </button>
        )}
        <button
          type="button"
          onClick={onNewQuiz}
          className={missed.length ? button.secondary : button.primary}
        >
          New quiz
        </button>
        {canPrint && (
          <button type="button" onClick={onPrint} className={button.secondary}>
            <PrinterIcon className="h-4 w-4" /> Print this quiz
          </button>
        )}
        <button type="button" onClick={onExit} className={button.ghost}>
          Change settings
        </button>
      </div>

      {missed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">
            The ones to look at again
          </h2>
          {missed.map((r, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
            >
              <OrderRow
                label="Your order"
                numbers={r.picked}
                marks={r.marks}
                ascending={r.question.ascending}
              />
              <div className="mt-2">
                <OrderRow
                  label="Right order"
                  numbers={r.question.answer}
                  ascending={r.question.ascending}
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className={cx(button.ghost, "mt-2")}
                aria-expanded={open === i}
              >
                {open === i ? "Hide why" : "Why?"}
              </button>
              {open === i && <WhyPanel explanation={explain(r.question)} />}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
