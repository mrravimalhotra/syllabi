import { cx } from "@/components/ui";
import { onesOf, tensOf } from "@/lib/kindergarten/place-value";

/** A number drawn as blocks: a rod for every ten and a small cube for every one. */
export function PlaceBlocks({ number, light = "none" }: { number: number; light?: "tens" | "ones" | "both" | "none" }) {
  const tens = tensOf(number);
  const ones = onesOf(number);
  const lit = (column: "tens" | "ones") => light === "both" || light === column;
  return (
    <div className="flex items-end justify-center gap-4" role="img" aria-label={`${tens} tens and ${ones} ones`}>
      <div className={cx("flex min-h-24 flex-1 flex-col items-center gap-2 rounded-2xl border-4 p-2 transition", lit("tens") ? "border-amber-400 bg-amber-50" : "border-slate-200")}>
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Tens</span>
        <div className="flex flex-wrap items-end justify-center gap-1.5">
          {Array.from({ length: tens }, (_, i) => (
            <span key={i} className="flex h-20 w-4 flex-col overflow-hidden rounded-sm border border-brand-700 bg-brand-400" aria-hidden>
              {Array.from({ length: 10 }, (_, k) => (
                <span key={k} className="flex-1 border-b border-brand-600/60 last:border-b-0" />
              ))}
            </span>
          ))}
        </div>
      </div>
      <div className={cx("flex min-h-24 flex-1 flex-col items-center gap-2 rounded-2xl border-4 p-2 transition", lit("ones") ? "border-amber-400 bg-amber-50" : "border-slate-200")}>
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Ones</span>
        <div className="flex flex-wrap items-end justify-center gap-1.5">
          {Array.from({ length: ones }, (_, i) => (
            <span key={i} className="h-4 w-4 rounded-sm border border-emerald-700 bg-emerald-400" aria-hidden />
          ))}
          {ones === 0 && <span className="text-sm text-slate-400">none</span>}
        </div>
      </div>
    </div>
  );
}
