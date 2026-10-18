"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { AnswerView } from "@/components/AnswerView";
import { StudyPackView } from "@/components/study-pack/StudyPackView";
import { WorkedExampleView } from "@/components/worked/WorkedExampleView";
import { ArrowRightIcon } from "@/components/icons";
import { Alert, cx, link } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { WorkedExample } from "@/lib/worked/types";
import type { GenerationResult } from "@/app/dashboard/_ask/constants";
import { TimingNote } from "@/app/dashboard/_ask/Parts";

/** Everything shown after a question: a calculation worked out by code, or the answer with its sources, timings and "worked out" examples. */
export function ResultSection({
  worked,
  result,
  resultRef,
  workedInQuestion,
  openWorked,
  onOpenWorked,
  onMakeNewAnswer,
}: {
  worked: { example: WorkedExample; id: string | null } | null;
  result: GenerationResult | null;
  resultRef: RefObject<HTMLDivElement | null>;
  workedInQuestion: WorkedExample[];
  openWorked: number | null;
  onOpenWorked: (index: number | null) => void;
  onMakeNewAnswer: () => void;
}) {
  return (
    <>
  {worked && (
    <div className="space-y-3">
      <WorkedExampleView key={worked.example.title} example={worked.example} pdfUrl={worked.id ? `/api/documents/${worked.id}/pdf` : null} />
      {worked.id && (
        <p className="text-center text-xs text-slate-500 print:hidden">
          Saved to{" "}
          <Link href={`/dashboard/documents/${worked.id}`} className={link}>
            My Documents <ArrowRightIcon className="inline h-3 w-3" />
          </Link>
        </p>
      )}
    </div>
  )}

  {result && (
    <div ref={resultRef} className="space-y-3">
      {result.reusedFrom && (
        <Alert tone="info" className="print:hidden">
          <span>
            You asked this before ({formatDate(result.reusedFrom)}), so your saved answer is shown instantly. No AI
            was used.
          </span>{" "}
          <button type="button" onClick={onMakeNewAnswer} className="font-medium underline">
            Generate a fresh answer instead
          </button>{" "}
          <span className="text-xs">(uses your monthly allowance)</span>
        </Alert>
      )}
      {result.pack ? (
        <StudyPackView pack={result.pack} answerId={result.id} pdfUrl={result.pdfUrl} />
      ) : (
        <AnswerView answer={result} />
      )}
      {result.timings && <TimingNote timings={result.timings} />}
      {!result.pack && workedInQuestion.length > 0 && (
        <div className="space-y-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-700">See it worked out:</span>
            {workedInQuestion.map((w, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={openWorked === i}
                onClick={() => onOpenWorked(openWorked === i ? null : i)}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  openWorked === i
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-300"
                )}
              >
                {w.title}
              </button>
            ))}
          </div>
          {openWorked !== null && workedInQuestion[openWorked] && <WorkedExampleView key={workedInQuestion[openWorked].title} example={workedInQuestion[openWorked]} />}
        </div>
      )}
      {result.id && (
        <p className="text-center text-xs text-slate-500 print:hidden">
          Saved to{" "}
          <Link href={`/dashboard/documents/${result.id}`} className={link}>
            My Documents <ArrowRightIcon className="inline h-3 w-3" />
          </Link>
        </p>
      )}
    </div>
  )}
    </>
  );
}
