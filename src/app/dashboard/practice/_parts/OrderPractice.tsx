"use client";

import { useState } from "react";
import { KindPicker } from "@/app/dashboard/practice/_parts/KindPicker";
import { SettingsFields } from "@/app/dashboard/practice/_parts/SettingsFields";
import { PrinterIcon } from "@/components/icons";
import { usePdfOpener } from "@/components/PdfButton";
import { NumberView } from "@/components/practice/NumberView";
import { OrderQuiz } from "@/components/practice/OrderQuiz";
import { Alert, Field, Spinner, button, cx, input } from "@/components/ui";
import type { NumberKind } from "@/lib/practice/numbers";
import {
  describe,
  makeQuiz,
  normaliseSettings,
  parseSample,
  presetFor,
  settingsProblem,
  type OrderQuestion,
  type OrderSettings,
} from "@/lib/practice/order";
import { newSeed, shuffled } from "@/lib/practice/random";

function worksheetUrl(settings: OrderSettings, seed: number, answers = true) {
  return `/api/practice/worksheet?settings=${encodeURIComponent(JSON.stringify(settings))}&seed=${seed}${answers ? "" : "&answers=0"}`;
}

/**
 * Putting numbers in order: the kind and size of numbers (from the child's class,
 * or from an example number), an example question, then the quiz or a worksheet.
 * The settings live in the page, so they are kept when the screen is left.
 */
export function OrderPractice({
  settings,
  setSettings,
  classLevel,
}: {
  settings: OrderSettings;
  setSettings: (next: OrderSettings) => void;
  classLevel: string | null;
}) {
  const [sample, setSample] = useState("");
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [run, setRun] = useState<{ quiz: OrderQuestion[]; seed: number | null; key: number } | null>(null);
  const worksheet = usePdfOpener("Practice worksheet");

  const update = (changes: Partial<OrderSettings>) => setSettings(normaliseSettings({ ...settings, ...changes }));
  const chooseKind = (kind: NumberKind) => {
    setSample("");
    setSampleError(null);
    setSettings({ ...presetFor(kind, classLevel), questions: settings.questions });
  };
  const onSample = (text: string) => {
    setSample(text);
    const parsed = parseSample(text);
    if (!parsed) return setSampleError(null);
    if ("error" in parsed) return setSampleError(parsed.error);
    setSampleError(null);
    const kind = parsed.settings.kind ?? settings.kind;
    const base = kind === settings.kind ? settings : presetFor(kind, classLevel);
    setSettings(
      normaliseSettings({ ...base, spread: kind === "fraction" ? null : base.spread, questions: settings.questions, ...parsed.settings })
    );
  };

  const problem = settingsProblem(settings);
  const example = problem ? null : makeQuiz({ ...settings, questions: 1 }, 1)[0];
  const start = () => {
    const seed = newSeed();
    setRun({ quiz: makeQuiz(settings, seed), seed, key: seed });
  };
  const printNew = (answers: boolean) => void worksheet.open(worksheetUrl(settings, newSeed(), answers));

  return (
    <>
      <div className="space-y-5">
        <KindPicker kind={settings.kind} onChoose={chooseKind} />

        <Field
          label="Example number (optional)"
          htmlFor="sample"
          hint={
            sampleError
              ? undefined
              : "Type a number like the ones in your child's book (456, 3.14, 3/7 or 1 3/4) and the quiz will use numbers like it."
          }
        >
          <input
            id="sample"
            value={sample}
            onChange={(e) => onSample(e.target.value)}
            placeholder="e.g. 4,507 or 3.14 or 3/7"
            inputMode="decimal"
            autoComplete="off"
            className={cx(input, sampleError && "border-red-400")}
            aria-invalid={Boolean(sampleError)}
          />
          {sampleError && <p className="text-sm text-red-600">{sampleError}</p>}
        </Field>

        <SettingsFields settings={settings} update={update} />

        {problem ? (
          <Alert tone="warning">{problem}</Alert>
        ) : (
          example && (
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{describe(settings)}. For example:</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-lg font-semibold text-slate-800">
                {example.numbers.map((n, i) => (
                  <NumberView key={i} n={n} />
                ))}
              </p>
            </div>
          )
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={start} disabled={Boolean(problem)} className={cx(button.primary, "min-h-12 px-6 text-base")}>
            Start the quiz
          </button>
          <button
            type="button"
            onClick={() => printNew(true)}
            disabled={Boolean(problem) || worksheet.state === "preparing"}
            className={button.secondary}
          >
            {worksheet.state === "preparing" ? <Spinner className="h-4 w-4" /> : <PrinterIcon className="h-4 w-4" />}
            {worksheet.state === "ready" ? "Tap to share the worksheet" : "Worksheet with answers (PDF)"}
          </button>
          <button type="button" onClick={() => printNew(false)} disabled={Boolean(problem)} className={button.ghost}>
            Worksheet without answers (PDF)
          </button>
        </div>
      </div>

      {run && (
        <OrderQuiz
          key={run.key}
          quiz={run.quiz}
          canPrint={run.seed !== null}
          onPrint={() => run.seed !== null && void worksheet.open(worksheetUrl(settings, run.seed))}
          onExit={() => setRun(null)}
          onNewQuiz={start}
          onRetry={(questions) =>
            setRun({ quiz: questions.map((q) => ({ ...q, numbers: shuffled(q.numbers) })), seed: null, key: newSeed() })
          }
        />
      )}
    </>
  );
}
