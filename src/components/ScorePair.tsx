import { levelOf, type Level } from "@/lib/generation/confidence";
import { cx } from "@/components/ui";

export const CHIP: Record<Level, string> = {
  green: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  amber: "bg-amber-100 text-amber-900 ring-amber-300",
  red: "bg-red-100 text-red-800 ring-red-300",
};

/** A question's two numbers, "96 : 88": how sure it is correct and grounded, and how much of it is from the books. */
export function ScorePair({ correct, fromBook, label }: { correct: number; fromBook: number; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      data-testid="question-score"
      title={`${label}: ${correct}% sure it is correct and grounded; ${fromBook}% from your books`}
      aria-label={`${label}: ${correct} percent sure it is correct, ${fromBook} percent from your books`}
    >
      <span className={cx("rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1", CHIP[levelOf(correct)])}>{correct}</span>
      <span className="text-slate-400" aria-hidden="true">
        :
      </span>
      <span className={cx("rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1", CHIP[levelOf(fromBook)])}>{fromBook}</span>
    </span>
  );
}
