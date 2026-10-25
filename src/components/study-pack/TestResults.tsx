"use client";

import { Confetti } from "@/components/practice/Confetti";
import { button, card, cx } from "@/components/ui";
import type { PackQuestion } from "@/lib/study-pack/types";

/** The end of a practice test: the score, a kind word, the questions marked Not yet, and how to go again. */
export function TestResults({
  questions,
  marks,
  onRestart,
}: {
  questions: PackQuestion[];
  marks: (boolean | null)[];
  onRestart: (onlyMissed: boolean) => void;
}) {
  const score = marks.filter(Boolean).length;
  const missed = questions.map((qq, i) => ({ qq, i })).filter(({ i }) => marks[i] === false);
  return (
    <section className={cx(card, "space-y-5 p-6 text-center")}>
      <Confetti burst={score >= questions.length * 0.7 ? 1 : 0} />
      <p className="kg-pop text-6xl" aria-hidden>
        {score === questions.length ? "🏆" : score >= questions.length * 0.7 ? "🌟" : "💪"}
      </p>
      <p className="text-sm font-medium text-slate-500">Practice test finished</p>
      <p className="text-5xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {score}
        <span className="text-2xl text-slate-400">/{questions.length}</span>
      </p>
      <p className="text-sm text-slate-600">
        {score === questions.length
          ? "Every question right. Brilliant work!"
          : score >= questions.length * 0.7
            ? "Great effort. Go over the ones marked Not yet."
            : "Good start. Read the chapter parts again, then try the ones marked Not yet."}
      </p>
      {missed.length > 0 && (
        <ul className="space-y-1.5 text-left">
          {missed.map(({ qq, i }) => (
            <li key={i} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              P{i + 1}. {qq.question}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {missed.length > 0 && (
          <button type="button" onClick={() => onRestart(true)} className={button.primary}>
            Try again the ones marked Not yet
          </button>
        )}
        <button type="button" onClick={() => onRestart(false)} className={button.secondary}>
          Start again
        </button>
      </div>
    </section>
  );
}
