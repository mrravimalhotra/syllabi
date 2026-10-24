"use client";

import { STAGE } from "@/components/kindergarten/RoundFrame";
import { useEffect, useState } from "react";
import { PlaceBlocks } from "@/components/kindergarten/PlaceBlocks";
import { button, cx } from "@/components/ui";
import { onesOf, tensOf, tutorialSteps } from "@/lib/kindergarten/place-value";

interface Props {
  /** The number to teach with. */
  number: number;
  say: (text: string) => Promise<void>;
  prepare: (texts: string[]) => void;
  onAnother: () => void;
  onPlay: () => void;
  onExit: () => void;
}

/** Face value and place value, one short step at a time with blocks, read aloud: Back, Next, and "hear it again". */
export function PlaceValueTutorial({ number, say, prepare, onAnother, onPlay, onExit }: Props) {
  const steps = tutorialSteps(number);
  const [step, setStep] = useState(0);
  const current = steps[step];
  const last = step === steps.length - 1;

  useEffect(() => {
    prepare(steps.map((s) => s.say));
    // The steps depend only on the number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, prepare]);

  useEffect(() => {
    void say(current.say);
  }, [current, say]);

  const lit = (column: "tens" | "ones") => current.light === "both" || current.light === column;

  return (
    <section className={cx(STAGE, "space-y-5 p-4 text-center sm:p-6")} aria-label="Place value lesson">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onExit} className={button.small}>
          ← Menu
        </button>
        <span className="text-sm text-slate-500" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {step + 1} / {steps.length}
        </span>
      </div>

      <p className="flex justify-center gap-2 text-7xl font-bold text-slate-800" aria-label={`The number ${number}`}>
        <span className={cx("rounded-2xl px-3", lit("tens") && "bg-amber-100 ring-4 ring-amber-400")}>{tensOf(number)}</span>
        <span className={cx("rounded-2xl px-3", lit("ones") && "bg-amber-100 ring-4 ring-amber-400")}>{onesOf(number)}</span>
      </p>
      <PlaceBlocks number={number} light={current.light} />

      <button
        type="button"
        onClick={() => void say(current.say)}
        className="mx-auto flex max-w-md items-start gap-2 rounded-2xl bg-brand-50 px-5 py-3 text-left text-lg font-medium text-brand-800"
      >
        <span aria-hidden>🔊</span> <span data-step={step}>{current.say}</span>
      </button>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          className={cx(button.secondary, "min-h-12 px-6 text-lg")}
        >
          ← Back
        </button>
        {last ? (
          <button type="button" onClick={onPlay} className={cx(button.primary, "min-h-12 px-6 text-lg")}>
            ▶ Play the game
          </button>
        ) : (
          <button type="button" onClick={() => setStep(step + 1)} className={cx(button.primary, "min-h-12 px-6 text-lg")}>
            Next →
          </button>
        )}
      </div>
      <button type="button" onClick={onAnother} className="text-sm font-medium text-brand-700 hover:underline">
        Try another number
      </button>
    </section>
  );
}
