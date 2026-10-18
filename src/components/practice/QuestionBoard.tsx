"use client";

import { CheckIcon } from "@/components/icons";
import { NumberView } from "@/components/practice/NumberView";
import { button, cx } from "@/components/ui";
import type { OrderQuestion } from "@/lib/practice/order";

interface Props {
  q: OrderQuestion;
  /** The indexes of the numbers picked so far, in the order picked. */
  picked: number[];
  /** The result is showing, so nothing can be changed. */
  locked: boolean;
  onPick: (index: number) => void;
  onTakeBack: (slot: number) => void;
  onClear: () => void;
  onCheck: () => void;
}

/** One question: the numbers to tap, the slots they land in, and Clear and Check. */
export function QuestionBoard({
  q,
  picked,
  locked,
  onPick,
  onTakeBack,
  onClear,
  onCheck,
}: Props) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 pb-40">
      <p
        className={cx(
          "mx-auto rounded-full px-5 py-2 text-center text-lg font-semibold",
          q.ascending
            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
            : "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
        )}
      >
        <span aria-hidden="true">
          {q.ascending ? "Smallest → Biggest" : "Biggest → Smallest"}
        </span>
        <span className="sr-only">
          {q.ascending
            ? "Put the numbers in order from smallest to biggest"
            : "Put the numbers in order from biggest to smallest"}
        </span>
      </p>

      <section aria-label="Numbers to put in order">
        <p className="mb-2 text-center text-sm text-slate-500">
          Tap the numbers in order
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {q.numbers.map((n, i) => {
            const used = picked.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={used || locked}
                onClick={() => onPick(i)}
                className={cx(
                  "flex min-h-16 min-w-20 items-center justify-center rounded-2xl border-2 bg-white px-4 py-2 text-2xl font-semibold text-slate-900 shadow-sm transition",
                  used
                    ? "border-slate-200 opacity-25"
                    : "border-slate-200 hover:-translate-y-0.5 hover:border-brand-400 active:scale-95",
                )}
                aria-label={used ? `${n.text}, already placed` : n.text}
              >
                <NumberView n={n} />
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Your order">
        <p className="mb-2 text-center text-sm text-slate-500">
          Your order {picked.length > 0 && "(tap one to take it back)"}
        </p>
        <ol className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-3">
          {q.numbers.map((_, slot) => {
            const n =
              picked[slot] !== undefined ? q.numbers[picked[slot]] : null;
            return (
              <li key={slot} className="flex items-center gap-1.5">
                {slot > 0 && (
                  <span
                    className="text-xl font-semibold text-slate-400"
                    aria-hidden="true"
                  >
                    {q.ascending ? "<" : ">"}
                  </span>
                )}
                {n ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onTakeBack(slot)}
                    className="flex min-h-16 min-w-16 animate-pop-in items-center justify-center rounded-xl bg-brand-600 px-3 text-xl font-semibold text-white shadow-sm"
                    aria-label={`${n.text}, place ${slot + 1}. Tap to take it back.`}
                  >
                    <NumberView n={n} />
                  </button>
                ) : (
                  <span className="flex min-h-16 min-w-16 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-400">
                    {slot + 1}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mx-auto flex w-full max-w-sm gap-3">
        <button
          type="button"
          onClick={onClear}
          disabled={!picked.length || locked}
          className={cx(button.secondary, "flex-1")}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onCheck}
          disabled={picked.length < q.numbers.length || locked}
          className={cx(button.primary, "flex-[2]")}
        >
          <CheckIcon className="h-4 w-4" /> Check
        </button>
      </div>
    </main>
  );
}
