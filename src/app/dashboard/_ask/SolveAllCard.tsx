"use client";

import type { useSolveAll } from "@/app/dashboard/_ask/useSolveAll";
import { CheckIcon } from "@/components/icons";
import { Markdown } from "@/components/Markdown";
import { Spinner, button, card, cx } from "@/components/ui";

/** "Solve all exercise questions" in progress: each part of the books with how it is going, and the answers so far. */
export function SolveAllCard({ run }: { run: ReturnType<typeof useSolveAll> }) {
  const parts = run.parts;
  if (!parts) return null;
  const finished = parts.filter((p) => p.status === "done" || p.status === "empty").length;
  const failed = parts.filter((p) => p.status === "failed").length;
  const waiting = parts.some((p) => p.status === "waiting");
  const answered = parts.some((p) => p.status === "done");
  return (
    <div className={cx(card, "animate-fade-in space-y-4 p-5 sm:p-6 print:hidden")} role="status" aria-live="polite" data-testid="solve-all">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">Solving a few pages at a time</p>
          <p className="text-sm text-slate-500">
            {finished} of {parts.length} parts done{run.saving ? ". Putting the answers together..." : run.running ? ". Keep this page open." : "."}
          </p>
        </div>
        {run.running ? (
          <button type="button" onClick={run.stop} className={button.small}>
            Stop
          </button>
        ) : (
          <button type="button" onClick={run.clear} className={button.small} disabled={run.saving}>
            Close
          </button>
        )}
      </div>
      <ol className="space-y-2">
        {parts.map((p) => (
          <li key={p.label} className="text-sm" data-part={p.status}>
            <div className="flex items-start gap-2.5">
              <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", p.status === "done" || p.status === "empty" ? "bg-brand-600 text-white" : p.status === "failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-brand-600")}>
                {p.status === "working" ? <Spinner className="h-4 w-4" /> : p.status === "failed" ? "!" : p.status === "waiting" ? null : <CheckIcon className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx("[overflow-wrap:anywhere]", p.status === "waiting" ? "text-slate-400" : "text-slate-900")}>
                  {p.label}
                  {p.status === "empty" && <span className="text-slate-500"> (no questions here)</span>}
                </p>
                {p.error && <p className="text-xs text-red-700">{p.error}</p>}
                {p.status === "done" && p.text && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-brand-700">See this part&apos;s answers</summary>
                    <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-slate-100 p-3">
                      <Markdown text={p.text} />
                    </div>
                  </details>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {!run.running && !run.saving && (failed > 0 || waiting) && (
        <div className="flex flex-wrap gap-2">
          {failed > 0 && (
            <button type="button" onClick={run.retry} className={button.primary}>
              Try the {failed === 1 ? "failed part" : `${failed} failed parts`} again
            </button>
          )}
          {failed === 0 && waiting && (
            <button type="button" onClick={run.retry} className={button.primary}>
              Carry on
            </button>
          )}
          {answered && (
            <button type="button" onClick={() => void run.save()} className={button.small}>
              Save what&apos;s done
            </button>
          )}
        </div>
      )}
    </div>
  );
}
