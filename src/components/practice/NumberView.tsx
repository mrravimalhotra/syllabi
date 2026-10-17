import type { PracticeNumber } from "@/lib/practice/numbers";
import { cx } from "@/components/ui";

/** A number as written in a school book: fractions stacked (top over bottom), mixed numbers with the whole beside. */
export function NumberView({ n, className }: { n: PracticeNumber; className?: string }) {
  const f = n.fraction;
  if (!f) return <span className={cx("tabular-nums", className)}>{n.text}</span>;
  return (
    <span className={cx("inline-flex items-center gap-1 tabular-nums", className)} aria-label={n.text}>
      {f.whole !== undefined && <span aria-hidden="true">{f.whole}</span>}
      {f.top !== 0 && (
        <span className="inline-flex flex-col items-center text-[0.8em] leading-none" aria-hidden="true">
          <span className="px-0.5 pb-0.5">{f.top}</span>
          <span className="w-full border-t-2 border-current" />
          <span className="px-0.5 pt-0.5">{f.bottom}</span>
        </span>
      )}
    </span>
  );
}
