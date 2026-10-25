"use client";

import type { RefObject } from "react";
import { Alert, Spinner, button, cx, input } from "@/components/ui";
import { statusLabel } from "@/lib/bug-report";
import type { Snapshot } from "@/lib/debug/capture";

export interface MyReport {
  id: string;
  number: number;
  title: string;
  status: string;
  /** What was done about it, written by an admin for the reporter to read. */
  resolution?: string | null;
}

interface Props {
  title: string;
  description: string;
  includeScreen: boolean;
  snapshot: Snapshot | null;
  sending: boolean;
  error: string | null;
  mine: MyReport[];
  titleRef: RefObject<HTMLInputElement | null>;
  onTitle: (text: string) => void;
  onDescription: (text: string) => void;
  onIncludeScreen: (on: boolean) => void;
  onSend: (e: React.FormEvent) => void;
  onCancel: () => void;
}

/** The form inside the Report a problem box: what went wrong, what was expected, what will be sent, and the person's recent reports. */
export function ReportForm({
  title,
  description,
  includeScreen,
  snapshot,
  sending,
  error,
  mine,
  titleRef,
  onTitle,
  onDescription,
  onIncludeScreen,
  onSend,
  onCancel,
}: Props) {
  return (
    <form onSubmit={onSend} className="space-y-4 overflow-y-auto p-5">
      <p className="text-sm text-slate-600">
        Say what went wrong. Syllabi adds a record of what you just did on this screen, so the problem can be found.
      </p>
      <label className="block text-sm font-medium text-slate-700">
        What went wrong?
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={200}
          placeholder="For example: the answer skipped question 4"
          className={cx(input, "mt-1")}
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        What did you expect instead? <span className="font-normal text-slate-400">(optional)</span>
        <textarea
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          maxLength={5000}
          rows={3}
          className={cx(input, "mt-1")}
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={includeScreen}
          onChange={(e) => onIncludeScreen(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>Include what is on my screen: what I typed and the answer shown (never passwords)</span>
      </label>
      <details className="rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600">
        <summary className="cursor-pointer px-3 py-2 font-medium">
          See exactly what will be sent ({snapshot?.steps.length ?? 0} steps, {snapshot?.requests.length ?? 0} requests)
        </summary>
        <pre className="max-h-60 overflow-auto px-3 pb-3 break-words whitespace-pre-wrap">
          {snapshot ? JSON.stringify(snapshot, null, 1) : ""}
        </pre>
      </details>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={sending} className={button.primary}>
          {sending && <Spinner className="h-4 w-4" />} Send report
        </button>
        <button type="button" onClick={onCancel} className={button.ghost}>
          Cancel
        </button>
      </div>
      {mine.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Your recent reports</p>
          <ul className="space-y-1 text-xs text-slate-600">
            {mine.map((r) => (
              <li key={r.id} className="space-y-0.5">
                <span className="flex justify-between gap-3">
                  <span className="truncate">
                    #{r.number} {r.title}
                  </span>
                  <span className="shrink-0 text-slate-500">{statusLabel(r.status)}</span>
                </span>
                {r.resolution && <span className="block rounded-lg bg-emerald-50 px-2 py-1 text-emerald-900">{r.resolution}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
