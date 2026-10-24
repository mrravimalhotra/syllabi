"use client";

import Link from "next/link";
import { useState } from "react";
import { PrinterIcon } from "@/components/icons";
import { Alert, Field, PageHeader, Spinner, button, card, cx, input } from "@/components/ui";
import { KindPicker } from "@/app/dashboard/practice/_parts/KindPicker";
import { SettingsFields } from "@/app/dashboard/practice/_parts/SettingsFields";
import { NumberView } from "@/components/practice/NumberView";
import { OrderQuiz } from "@/components/practice/OrderQuiz";
import { TutorialsCard } from "@/components/practice/TutorialsCard";
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
import type { NumberKind } from "@/lib/practice/numbers";
import { newSeed, shuffled } from "@/lib/practice/random";
import { usePdfOpener } from "@/components/PdfButton";


function worksheetUrl(settings: OrderSettings, seed: number, answers = true) {
  return `/api/practice/worksheet?settings=${encodeURIComponent(JSON.stringify(settings))}&seed=${seed}${answers ? "" : "&answers=0"}`;
}

/**
 * Practice: quizzes worked out entirely by code (no AI). The first one is
 * putting numbers in order; the level starts from the child's class and can
 * be set from an example number. The class comes from the server with the
 * page, so the menu shows at once instead of waiting for a second request.
 */
export function PracticeView({ classLevel }: { classLevel: string | null }) {
  const [settings, setSettings] = useState<OrderSettings>(() => presetFor("whole", classLevel));
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
    setSettings(normaliseSettings({ ...base, spread: kind === "fraction" ? null : base.spread, questions: settings.questions, ...parsed.settings }));
  };

  const problem = settingsProblem(settings);
  const example = problem ? null : makeQuiz({ ...settings, questions: 1 }, 1)[0];
  const start = () => {
    const seed = newSeed();
    setRun({ quiz: makeQuiz(settings, seed), seed, key: seed });
  };
  const printNew = (answers: boolean) => void worksheet.open(worksheetUrl(settings, newSeed(), answers));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Practice"
        description="Quizzes and maths tutorials for your child, worked out by the app itself: always correct, and no AI used."
      />

      <Link
        href="/dashboard/practice/kindergarten"
        className={cx(card, "flex items-center gap-4 p-4 transition hover:border-brand-300 sm:p-5")}
      >
        <span className="text-4xl" aria-hidden>
          🧸
        </span>
        <span className="min-w-0">
          <span className="block text-base font-semibold text-slate-900">Kindergarten</span>
          <span className="block text-sm text-slate-500">Spell simple words, find sight words, and compare small numbers. Picture-led and read aloud.</span>
        </span>
        <span className="ml-auto text-slate-400" aria-hidden>
          →
        </span>
      </Link>

      <TutorialsCard />

      <section className={cx(card, "space-y-5 p-4 sm:p-6")}>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Put the numbers in order</h2>
          <p className="text-sm text-slate-500">Each question has {settings.size} numbers to arrange from smallest to biggest, or biggest to smallest.</p>
        </div>

        <KindPicker kind={settings.kind} onChoose={chooseKind} />

        <Field
          label="Example number (optional)"
          htmlFor="sample"
          hint={sampleError ? undefined : "Type a number like the ones in your child's book (456, 3.14, 3/7 or 1 3/4) and the quiz will use numbers like it."}
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
          <button type="button" onClick={start} disabled={Boolean(problem)} className={button.primary}>
            Start the quiz
          </button>
          <button type="button" onClick={() => printNew(true)} disabled={Boolean(problem) || worksheet.state === "preparing"} className={button.secondary}>
            {worksheet.state === "preparing" ? <Spinner className="h-4 w-4" /> : <PrinterIcon className="h-4 w-4" />}
            {worksheet.state === "ready" ? "Tap to share the worksheet" : "Worksheet with answers (PDF)"}
          </button>
          <button type="button" onClick={() => printNew(false)} disabled={Boolean(problem)} className={button.ghost}>
            Worksheet without answers (PDF)
          </button>
        </div>
      </section>

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
    </div>
  );
}
