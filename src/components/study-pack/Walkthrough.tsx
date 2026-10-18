"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { button, card, cx } from "@/components/ui";
import { type Speech } from "@/components/study-pack/useSpeech";
import { SceneView } from "@/components/study-pack/SceneView";
import type { StudyPack } from "@/lib/study-pack/types";

import { ListenButton } from "@/components/study-pack/PackParts";

export function Walkthrough({ pack, speech }: { pack: StudyPack; speech: Speech }) {
  const [index, setIndex] = useState(0);
  const part = pack.walkthrough[index];
  const go = (i: number) => {
    speech.stop();
    setIndex(i);
  };

  return (
    <div className="space-y-3">
      <ol className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Parts">
        {pack.walkthrough.map((p, i) => (
          <li key={i} className="shrink-0">
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === index ? "step" : undefined}
              className={cx(
                "flex max-w-52 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition",
                i === index
                  ? "border-brand-500 bg-brand-50 text-brand-900"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              <span
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  i === index ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                )}
              >
                {i + 1}
              </span>
              <span className="truncate">{p.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className={cx(card, "space-y-5 p-5 sm:p-6")} aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-brand-700">
              Part {index + 1} of {pack.walkthrough.length}
            </p>
            <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">{part.title}</h3>
          </div>
          <ListenButton id={`part-${index}`} text={part.narration} speech={speech} label="Read aloud" />
        </div>

        {part.scene && <SceneView scene={part.scene} speaking={speech.speakingId === `part-${index}`} />}

        <p className="text-[15px] leading-7 text-slate-700">{part.summary}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-brand-50/60 p-4">
            <p className="text-xs font-semibold tracking-wide text-brand-800 uppercase">Why it matters</p>
            <p className="mt-1.5 text-sm leading-6 text-slate-700">{part.whyItMatters}</p>
          </div>
          {part.feelings && (
            <div className="rounded-xl bg-amber-50/70 p-4">
              <p className="text-xs font-semibold tracking-wide text-amber-800 uppercase">Feelings</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-700">{part.feelings}</p>
            </div>
          )}
        </div>

        {part.vocabulary.length > 0 && (
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Words from the book</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              {part.vocabulary.map((v) => (
                <div key={v.word} className="rounded-xl border border-slate-200 p-3">
                  <dt className="text-sm font-semibold text-slate-900">{v.word}</dt>
                  <dd className="mt-0.5 text-sm text-slate-600">{v.meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <details className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-900">Read-aloud script</summary>
          <p className="mt-2 leading-6">{part.narration}</p>
        </details>

        <div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className={button.secondary}>
            <ChevronLeftIcon className="h-4 w-4" /> Previous
          </button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === pack.walkthrough.length - 1} className={button.primary}>
            Next <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
