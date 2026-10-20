"use client";

import { useState } from "react";
import { describeDetails, levelOf, type AnswerConfidence, type Level } from "@/lib/generation/confidence";
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
        <span
          className={cx("rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1", CHIP[correctLevel])}
          title={`Correct and grounded: ${WORD[correctLevel]}`}
        >
          {correct}
        </span>
        <span className="text-slate-400" aria-hidden="true">
          :
        </span>
        <span
          className={cx("rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1", CHIP[bookLevel])}
          title={`From your books: ${WORD[bookLevel]}`}
        >
          {fromBook}
        </span>
      </summary>
      <div className="mt-2 max-w-xl space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p>
          <span className={cx("mr-1.5 rounded-md px-1.5 py-0.5 font-semibold ring-1", CHIP[correctLevel])}>{correct}%</span>
          <span className="font-medium text-slate-800">Correct and grounded:</span> {WORD[correctLevel]}. How sure we are the answers are
          right and follow your books, without assumptions.
        </p>
        <p>
          <span className={cx("mr-1.5 rounded-md px-1.5 py-0.5 font-semibold ring-1", CHIP[bookLevel])}>{fromBook}%</span>
          <span className="font-medium text-slate-800">From your books:</span> {fromBook}% from your books, {100 - fromBook}% from outside
          them (general knowledge or the web).
        </p>
        <ul className="list-disc space-y-0.5 pl-5">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <Diagnostics confidence={confidence} />
        <p className="text-slate-500">
          Green is 80 or more, amber 60 to 79, red below 60. These are estimates made by Syllabi&apos;s own checks, not a guarantee: still
          read the answer before using it.
        </p>
      </div>
    </details>
  );
}

/** The facts behind the numbers, for finding out why a score is low: where the passages came from, how they were found, and which statements were not in the books. */
function Diagnostics({ confidence }: { confidence: AnswerConfidence }) {
  const [copied, setCopied] = useState(false);
  const d = confidence.details;
  if (!d) return <p className="text-slate-400">This answer was made before the details were kept.</p>;
  const text = describeDetails(confidence);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is on screen to select.
    }
  }
  return (
    <details className="rounded-lg border border-slate-200 bg-white" data-testid="confidence-details">
      <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">Details for finding the cause</summary>
      <div className="space-y-2 px-3 pb-3">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-slate-500">Statements</dt>
          <dd>
            {d.statements} judged: {d.grounded} found in the books, {d.statements - d.grounded} not found
          </dd>
          <dt className="text-slate-500">Passages</dt>
          <dd>
            {d.passages} from your books ({d.passageChars.toLocaleString("en-IN")} characters): {d.pages || "none"}
          </dd>
          <dt className="text-slate-500">How found</dt>
          <dd>{d.retrieval}</dd>
          <dt className="text-slate-500">Match</dt>
          <dd>
            closest {d.topSimilarity === null ? "n/a" : d.topSimilarity.toFixed(2)}
            {d.coverageLow ? ", weak: the books matched the request only weakly" : ", good"}
          </dd>
          <dt className="text-slate-500">Other</dt>
          <dd>
            web search {d.usedSearchGrounding ? "used" : "not used"}; {d.weakPages} hard-to-read pages; {d.failedChecks} failed checks
          </dd>
        </dl>
        {d.outside.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-slate-700">Statements furthest from the books</p>
            <ul className="space-y-1.5">
              {d.outside.map((o) => (
                <li key={o.text} className="rounded-md bg-slate-50 p-2">
                  <span className="mr-1 font-semibold tabular-nums">{o.found}%</span>
                  {o.text}
                  {o.missing.length > 0 && <span className="block text-slate-500">not found in the books: {o.missing.join(", ")}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
        >
          {copied ? "Copied" : "Copy these details"}
        </button>
      </div>
    </details>
  );
}
