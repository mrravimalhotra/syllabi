"use client";

import { memo, useEffect, useState } from "react";
import { CheckIcon } from "@/components/icons";
import { Markdown } from "@/components/Markdown";
import { Skeleton, Spinner, button, card, cx } from "@/components/ui";
import type { DownscaledImage } from "@/lib/downscale-image";

export const Thumb = memo(function Thumb({ image, alt }: { image: DownscaledImage; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
    <img
      src={`data:${image.mimeType};base64,${image.imageBase64}`}
      alt={alt}
      decoding="async"
      className="h-16 w-auto max-w-28 rounded-lg border border-slate-200 object-cover"
    />
  );
});

/** Shown while an answer is being written: progress steps and a placeholder answer. */
export function GeneratingCard({ steps, draft, onStop }: { steps: { after: number; text: string }[]; draft: string; onStop: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const step = steps.filter((s) => seconds >= s.after).length - 1;

  return (
    <div className={cx(card, "animate-fade-in space-y-5 p-5 sm:p-6 print:hidden")} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <ol className="space-y-2.5">
          {steps.slice(0, 3).map((s, i) => {
            const done = i < step;
            const current = i === Math.min(step, 2);
            return (
              <li key={s.text} className={cx("flex items-center gap-2.5 text-sm", done || current ? "text-slate-900" : "text-slate-400")}>
                <span
                  className={cx(
                    "flex h-5 w-5 items-center justify-center rounded-full",
                    done ? "bg-brand-600 text-white" : current ? "text-brand-600" : "bg-slate-100"
                  )}
                >
                  {done ? <CheckIcon className="h-3.5 w-3.5" /> : current ? <Spinner className="h-4 w-4" /> : null}
                </span>
                {s.text}
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={onStop} className={button.small}>
          Stop
        </button>
      </div>
      {step === 3 && <p className="text-xs text-slate-500">{steps[3].text}. Keep this page open.</p>}
      {draft ? (
        // The first draft as it is written; the checked answer replaces it when done.
        <div className="max-h-[60vh] overflow-y-auto border-t border-slate-100 pt-4">
          <Markdown text={draft} />
          <p className="mt-3 text-xs text-slate-400">Still writing. Syllabi checks the answer when it finishes.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      )}
      <p className="text-xs tabular-nums text-slate-400">{seconds}s</p>
    </div>
  );
}
