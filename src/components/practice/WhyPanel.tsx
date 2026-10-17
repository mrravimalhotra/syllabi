import type { Explanation } from "@/lib/practice/order";
import { cx } from "@/components/ui";

/**
 * Why the numbers go in this order: the rule, the numbers lined up by place
 * (or brought to one bottom number), and a reason for each neighbour.
 */
export function WhyPanel({ explanation: e }: { explanation: Explanation }) {
  return (
    <div className="space-y-4 rounded-2xl bg-slate-50 p-4 text-left">
      <p className="text-sm font-medium text-slate-800">{e.rule}</p>

      {e.grid && (
        <div className="overflow-x-auto">
          <table className="mx-auto border-collapse font-mono text-lg tabular-nums">
            <thead>
              <tr>
                {e.grid.headings.map((h, i) => [
                  e.grid!.pointBefore === i && <th key={`p${i}`} aria-label="decimal point" className="border-b border-slate-300" />,
                  <th key={i} scope="col" className="min-w-9 border-b border-slate-300 px-1.5 pb-1 text-center font-sans text-[11px] font-semibold text-slate-500">
                    {h}
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {e.grid.rows.map((row) => (
                <tr key={row.text}>
                  {row.cells.map((c, i) => [
                    e.grid!.pointBefore === i && (
                      <td key={`p${i}`} className="px-0.5 font-bold text-slate-900">
                        .
                      </td>
                    ),
                    <td key={i} className={cx("px-1.5 py-0.5 text-center", row.added[i] ? "text-slate-400" : "text-slate-900")}>
                      {c}
                    </td>,
                  ])}
                </tr>
              ))}
            </tbody>
          </table>
          {e.grid.rows.some((r) => r.added.some(Boolean)) && (
            <p className="mt-1 text-center text-xs text-slate-500">Grey zeros were added so every number has the same number of decimal places.</p>
          )}
        </div>
      )}

      {e.common && (
        <ul className="flex flex-wrap justify-center gap-2">
          {e.common.rows.map((r) => (
            <li key={r.text} className="rounded-lg bg-white px-3 py-1.5 text-sm tabular-nums shadow-xs ring-1 ring-slate-200">
              {r.text} = <span className="font-semibold text-brand-700">{r.top}/{r.bottom}</span>
            </li>
          ))}
        </ul>
      )}

      <ol className="space-y-2">
        {e.steps.map((s) => (
          <li key={s.relation} className="text-sm leading-6 text-slate-700">
            <span className="mr-1.5 rounded-md bg-white px-1.5 py-0.5 font-semibold whitespace-nowrap text-slate-900 tabular-nums ring-1 ring-slate-200">
              {s.relation}
            </span>
            {s.reason}
          </li>
        ))}
      </ol>
    </div>
  );
}
