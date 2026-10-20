"use client";

import { levelOf, type AnswerConfidence, type Level } from "@/lib/generation/confidence";
import { cx } from "@/components/ui";

const CHIP: Record<Level, string> = {
  green: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  amber: "bg-amber-100 text-amber-900 ring-amber-300",
  red: "bg-red-100 text-red-800 ring-red-300",
};
const WORD: Record<Level, string> = { green: "High", amber: "Medium", red: "Low" };

/**
 * The two numbers for an answer, as "95 : 89" in red, amber or green: how sure we are the answers are correct and
 * grounded in the books, and how much of the answer comes from the books. Opens to say what they mean and why.
 */
export function ConfidenceBadge({ confidence }: { confidence: AnswerConfidence | null | undefined }) {
  if (!confidence) return null;
  const { correct, fromBook, reasons } = confidence;
  const correctLevel = levelOf(correct);
  const bookLevel = levelOf(fromBook);
  return (
    <details className="group text-xs text-slate-600 print:hidden" data-testid="confidence">
      <summary
        className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pr-2.5 pl-2 select-none hover:bg-slate-50"
        aria-label={`Confidence: ${correct} percent sure the answers are correct and grounded, ${fromBook} percent from your books, ${100 - fromBook} percent from outside. Press for details.`}
      >
        <span className="font-medium text-slate-500">Confidence</span>
        <span className={cx("rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1", CHIP[correctLevel])} title={`Correct and grounded: ${WORD[correctLevel]}`}>
          {correct}
        </span>
        <span className="text-slate-400" aria-hidden="true">
          :
        </span>
        <span className={cx("rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1", CHIP[bookLevel])} title={`From your books: ${WORD[bookLevel]}`}>
          {fromBook}
        </span>
      </summary>
      <div className="mt-2 max-w-xl space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p>
          <span className={cx("mr-1.5 rounded-md px-1.5 py-0.5 font-semibold ring-1", CHIP[correctLevel])}>{correct}%</span>
          <span className="font-medium text-slate-800">Correct and grounded:</span> {WORD[correctLevel]}. How sure we are the answers are right and follow your books, without assumptions.
        </p>
        <p>
          <span className={cx("mr-1.5 rounded-md px-1.5 py-0.5 font-semibold ring-1", CHIP[bookLevel])}>{fromBook}%</span>
          <span className="font-medium text-slate-800">From your books:</span> {fromBook}% from your books, {100 - fromBook}% from outside them (general knowledge or the web).
        </p>
        <ul className="list-disc space-y-0.5 pl-5">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-slate-500">Green is 80 or more, amber 60 to 79, red below 60. These are estimates made by Syllabi&apos;s own checks, not a guarantee: still read the answer before using it.</p>
      </div>
    </details>
  );
}
