"use client";

import { useEffect, useState } from "react";
import { PrinterIcon } from "@/components/icons";
import { Alert, Field, PageHeader, PageSkeleton, Spinner, button, card, cx, input } from "@/components/ui";
import { NumberView } from "@/components/practice/NumberView";
import { OrderQuiz } from "@/components/practice/OrderQuiz";
import {
  KIND_LABELS,
  describe,
  makeQuiz,
  normaliseSettings,
  parseSample,
  presetFor,
  settingsProblem,
  type OrderQuestion,
  type OrderSettings,
} from "@/lib/practice/order";
import { groupDigits, type NumberKind } from "@/lib/practice/numbers";
import { newSeed } from "@/lib/practice/random";
import { usePdfOpener } from "@/components/PdfButton";

const KINDS: NumberKind[] = ["whole", "decimal", "fraction"];
const select = cx(input, "pr-8");

function worksheetUrl(settings: OrderSettings, seed: number, answers = true) {
  return `/api/practice/worksheet?settings=${encodeURIComponent(JSON.stringify(settings))}&seed=${seed}${answers ? "" : "&answers=0"}`;
}

/**
 * Practice: quizzes worked out entirely by code (no AI). The first one is
 * putting numbers in order; the level starts from the child's class and can
 * be set from an example number.
 */
export default function PracticePage() {
  const [classLevel, setClassLevel] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrderSettings | null>(null);
  const [sample, setSample] = useState("");
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [run, setRun] = useState<{ quiz: OrderQuestion[]; seed: number | null; key: number } | null>(null);
  const worksheet = usePdfOpener("Practice worksheet");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const level = data?.student?.class_level ?? null;
        setClassLevel(level);
        setSettings(presetFor("whole", level));
      })
      .catch(() => setSettings(presetFor("whole", null)));
  }, []);

  if (!settings) return <PageSkeleton rows={2} />;

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
        description="Quick quizzes for your child, worked out by the app itself: always correct, and no AI used. Hand over the phone once it starts."
      />

      <section className={cx(card, "space-y-5 p-4 sm:p-6")}>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Put the numbers in order</h2>
          <p className="text-sm text-slate-500">Each question has {settings.size} numbers to arrange from smallest to biggest, or biggest to smallest.</p>
        </div>

        <div role="radiogroup" aria-label="Kind of numbers" className="grid grid-cols-3 gap-2">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={settings.kind === kind}
              onClick={() => chooseKind(kind)}
              className={cx(
                "min-h-11 rounded-xl border-2 px-2 py-2 text-sm font-medium transition-colors",
                settings.kind === kind ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              )}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>

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

        <div className="grid gap-4 sm:grid-cols-2">
          {settings.kind === "whole" && (
            <Field label="Size of numbers" htmlFor="digits">
              <select id="digits" className={select} value={settings.digits} onChange={(e) => update({ digits: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d} digit{d === 1 ? "" : "s"} ({groupDigits(String(d === 1 ? 1 : 10 ** (d - 1)))} to {groupDigits(String(10 ** d - 1))})
                  </option>
                ))}
              </select>
            </Field>
          )}
          {settings.kind === "decimal" && (
            <>
              <Field label="Before the point" htmlFor="intDigits">
                <select id="intDigits" className={select} value={settings.digits} onChange={(e) => update({ digits: Number(e.target.value) })}>
                  <option value={0}>Just 0 (like 0.25)</option>
                  <option value={1}>1 digit (like 3.25)</option>
                  <option value={2}>2 digits (like 43.25)</option>
                  <option value={3}>3 digits (like 543.25)</option>
                </select>
              </Field>
              <Field label="After the point" htmlFor="places" hint="Mixed lengths (like 3.7 and 3.142) catch the most common mistake.">
                <select
                  id="places"
                  className={select}
                  value={`${settings.minPlaces}-${settings.maxPlaces}`}
                  onChange={(e) => {
                    const [minPlaces, maxPlaces] = e.target.value.split("-").map(Number);
                    update({ minPlaces, maxPlaces });
                  }}
                >
                  {[[1, 1], [2, 2], [1, 2], [1, 3], [2, 3], [1, 4]].map(([a, b]) => (
                    <option key={`${a}-${b}`} value={`${a}-${b}`}>
                      {a === b ? `${a} digit${a === 1 ? "" : "s"}` : `${a} to ${b} digits (mixed)`}
                    </option>
                  ))}
                  {/* A sample like 3.1415 can set a range that isn't in the list above. */}
                  {![[1, 1], [2, 2], [1, 2], [1, 3], [2, 3], [1, 4]].some(([a, b]) => a === settings.minPlaces && b === settings.maxPlaces) && (
                    <option value={`${settings.minPlaces}-${settings.maxPlaces}`}>
                      {settings.minPlaces} to {settings.maxPlaces} digits (mixed)
                    </option>
                  )}
                </select>
              </Field>
            </>
          )}
          {settings.kind === "fraction" && (
            <>
              <Field label="Bottom numbers up to" htmlFor="maxDen">
                <select id="maxDen" className={select} value={settings.maxDenominator} onChange={(e) => update({ maxDenominator: Number(e.target.value) })}>
                  {Array.from({ length: 17 }, (_, i) => i + 4).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset className="space-y-2 self-end">
                <legend className="sr-only">Fractions bigger than 1</legend>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={settings.improper} onChange={(e) => update({ improper: e.target.checked })} className="h-4 w-4 accent-brand-600" />
                  Include fractions bigger than 1
                </label>
                {settings.improper && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={settings.mixed} onChange={(e) => update({ mixed: e.target.checked })} className="h-4 w-4 accent-brand-600" />
                    Write them as mixed numbers (1 3/4)
                  </label>
                )}
              </fieldset>
            </>
          )}
          {settings.kind !== "fraction" && (
            <Field
              label="Keep numbers close (optional)"
              htmlFor="spread"
              hint={settings.kind === "whole" ? "The biggest gap between the smallest and biggest number." : "How far apart the whole number parts may be. 0 keeps them all the same."}
            >
              <input
                id="spread"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Any"
                value={settings.spread ?? ""}
                onChange={(e) => update({ spread: e.target.value === "" ? null : Number(e.target.value) })}
                className={input}
              />
            </Field>
          )}
          <Field label="Questions" htmlFor="questions">
            <select id="questions" className={select} value={settings.questions} onChange={(e) => update({ questions: Number(e.target.value) })}>
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>

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
            {worksheet.state === "ready" ? "Tap to share the worksheet" : "Printable worksheet"}
          </button>
          <button type="button" onClick={() => printNew(false)} disabled={Boolean(problem)} className={button.ghost}>
            Worksheet without answers
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
            setRun({ quiz: questions.map((q) => ({ ...q, numbers: [...q.numbers].sort(() => Math.random() - 0.5) })), seed: null, key: newSeed() })
          }
        />
      )}
    </div>
  );
}
