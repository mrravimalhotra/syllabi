"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { Alert, PageHeader, Spinner, button, card, cx } from "@/components/ui";

interface Check {
  name: string;
  ok: boolean;
  skipped?: boolean;
  detail: string;
  ms: number;
}

/** Runs the server's self-test and shows each service's result, with the real error when one fails. */
export default function HealthPage() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runChecks() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `The check itself failed (${res.status}).`);
      setChecks(data.checks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check itself failed.");
    } finally {
      setRunning(false);
    }
  }

  const failed = checks?.filter((c) => !c.ok).length ?? 0;
  const skipped = checks?.filter((c) => c.skipped).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health check"
        description="Tests the database, Gemini, Google Search, book search and file storage, and shows the exact error if one fails. Uses a few hundred tokens."
        actions={
          <button type="button" onClick={runChecks} disabled={running} className={button.primary}>
            {running && <Spinner />}
            {running ? "Checking..." : "Run checks"}
          </button>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {checks && (
        <Alert tone={failed ? "error" : "success"}>
          {failed
            ? `${failed} of ${checks.length} checks failed.`
            : skipped
              ? `Everything required works. ${skipped} optional extra${skipped === 1 ? " isn't" : "s aren't"} set up.`
              : `All ${checks.length} checks passed.`}
        </Alert>
      )}
      {checks && (
        <ul className={cx(card, "divide-y divide-slate-100")}>
          {checks.map((c) => (
            <li key={c.name} className="flex gap-3 px-5 py-4">
              <span
                className={cx(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  c.skipped ? "bg-slate-100 text-slate-400" : c.ok ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}
              >
                {c.skipped ? <span aria-label="Not set up" className="text-base leading-none">–</span> : c.ok ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium text-slate-900">
                  {c.name}
                  <span className="text-xs font-normal text-slate-400 tabular-nums">{(c.ms / 1000).toFixed(1)}s</span>
                </p>
                <p className={cx("mt-1 text-sm break-words", c.ok ? "text-slate-600" : "font-mono text-xs text-red-700")}>
                  {c.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
