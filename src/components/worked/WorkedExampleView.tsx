"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, SpeakerIcon, StopIcon } from "@/components/icons";
import { PrintButton } from "@/components/PrintButton";
import { Badge, button, card, cx } from "@/components/ui";
import { speakOnce } from "@/components/study-pack/useSpeech";
import type { Cell, Tone, WorkedExample } from "@/lib/worked/types";
import { spoken } from "@/lib/worked/say";

// Chalkboard colours: one per kind of number, as teachers use coloured chalk.
const TONE: Record<Tone, string> = {
  given: "text-white",
  divisor: "text-orange-300",
  quotient: "text-yellow-300",
  product: "text-sky-300",
  remainder: "text-rose-300",
  carry: "text-emerald-300",
  result: "text-yellow-300 font-semibold",
  muted: "text-white/45",
};

/**
 * A worked example on a chalkboard: steps appear one at a time with the
 * teacher's words, played automatically (read aloud) or stepped through by
 * hand. Printing gives the finished board and every step written out.
 */
export function WorkedExampleView({
  example,
  actions,
  pdfUrl,
}: {
  example: WorkedExample;
  actions?: React.ReactNode;
  /** The saved example's PDF, for printing where the page itself can't be printed. */
  pdfUrl?: string | null;
}) {
  const language = example.problem.language ?? "en";
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(true);
  const last = example.steps.length - 1;
  const step = example.steps[index];
  const cancelRef = useRef<(() => void) | null>(null);

  // Autoplay: read the step aloud (or wait a moment when muted), then move on.
  useEffect(() => {
    if (!playing) return;
    const advance = () => {
      if (index >= last) setPlaying(false);
      else setIndex((i) => i + 1);
    };
    if (voice) {
      cancelRef.current = speakOnce(spoken(step.say, language), language, 0.95, () => setTimeout(advance, 350));
    } else {
      const timer = setTimeout(advance, Math.max(1800, step.say.length * 55));
      cancelRef.current = () => clearTimeout(timer);
    }
    return () => cancelRef.current?.();
  }, [playing, index, voice, step.say, last, language]);

  useEffect(() => () => cancelRef.current?.(), []);

  const go = (i: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, i)));
  };

  return (
    <article className={cx(card, "animate-fade-in overflow-hidden print:border-0 print:shadow-none")}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 print:hidden">
        <div className="min-w-0 flex-1 basis-60 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">Worked example</Badge>
            <Badge tone="success">Exact: worked out by code, no AI</Badge>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{example.title}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {actions}
          <PrintButton pdfUrl={pdfUrl} name={example.title} />
        </div>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-6 print:hidden">
        <Board example={example} upTo={index} />

        <div className="min-h-16 rounded-xl bg-slate-50 px-4 py-3" aria-live="polite">
          <p className="text-xs font-medium text-slate-500">
            Step {index + 1} of {example.steps.length}
          </p>
          <p className="mt-1 text-[15px] leading-6 text-slate-800">{step.say}</p>
        </div>

        {index === last && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Answer: {example.answer}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className={button.secondary} aria-label="Previous step">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                if (index >= last) setIndex(0);
                setPlaying(true);
              }
            }}
            className={button.primary}
          >
            {playing ? <StopIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
            {playing ? "Pause" : index >= last ? "Play again" : index === 0 ? "Play" : "Continue"}
          </button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === last} className={button.secondary} aria-label="Next step">
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => go(last)} disabled={index === last} className={button.ghost}>
            Show all
          </button>
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Read aloud
          </label>
        </div>
      </div>

      {/* Print: the finished board and all the steps. */}
      <div className="hidden space-y-4 print:block">
        <h1 className="text-xl font-semibold">{example.title}</h1>
        <Board example={example} upTo={last} print />
        <p className="font-semibold">Answer: {example.answer}</p>
        <ol className="list-decimal space-y-1 pl-5 text-[11pt]">
          {example.steps.map((s, i) => (
            <li key={i}>{s.say}</li>
          ))}
        </ol>
        <p className="text-xs text-slate-500">Worked out step by step by Syllabi&apos;s calculator (no AI).</p>
      </div>
    </article>
  );
}

/** Sizes in px for one cell row and for a column of width w characters. */
const ROW = 40;
// A width below 1 is a narrow column (the decimal point).
const colPx = (w: number) => (w < 1 ? 16 : w === 1 ? 34 : w * 15 + 14);

function Board({ example, upTo, print }: { example: WorkedExample; upTo: number; print?: boolean }) {
  const widths = useMemo(
    () => Array.from({ length: example.cols }, (_, c) => colPx(example.colWidths?.[c] ?? 1)),
    [example.cols, example.colWidths]
  );
  const left = useMemo(() => widths.reduce<number[]>((acc, w, i) => [...acc, (acc[i - 1] ?? 0) + (i ? widths[i - 1] : 0)], []), [widths]);
  const leftOf = (col: number) => (col < widths.length ? left[col] : left[widths.length - 1] + widths[widths.length - 1]);
  const width = leftOf(widths.length) + 8;
  const height = example.rows * ROW + 8;

  // Everything shown so far; the latest step's additions animate in.
  const visible = example.steps.slice(0, upTo + 1);
  const cells: (Cell & { fresh: boolean })[] = [];
  visible.forEach((s, i) => {
    for (const cell of s.cells ?? []) {
      // A later cell in the same place replaces an earlier one.
      const existing = cells.findIndex((c) => c.row === cell.row && c.col === cell.col);
      const entry = { ...cell, fresh: i === upTo && !print };
      if (existing >= 0) cells[existing] = entry;
      else cells.push(entry);
    }
  });
  const rules = visible.flatMap((s, i) => (s.rules ?? []).map((r) => ({ ...r, fresh: i === upTo && !print })));
  const vlines = visible.flatMap((s) => s.vlines ?? []);
  const focus = print ? [] : (example.steps[upTo]?.focus ?? []);

  return (
    <div
      className={cx(
        "overflow-x-auto rounded-2xl p-4",
        print ? "border border-slate-300 bg-white" : "bg-[#1E3F20] shadow-inner ring-4 ring-[#5b3a1e]"
      )}
    >
      <div className="relative mx-auto font-mono" style={{ width, height }} role="img" aria-label={`${example.title}: step ${upTo + 1}`}>
        {focus.map((f, i) => (
          <div
            key={`f${i}`}
            className="absolute rounded-md ring-2 ring-yellow-300/90"
            style={{ left: leftOf(f.col) + 2, top: f.row * ROW + 2, width: widths[f.col] - 4, height: ROW - 4 }}
          />
        ))}
        {cells.map((c) => {
          // Text wider than its column (a label like "HCF = 6") runs on to the right.
          const overflows = c.text.length > Math.max(3, example.colWidths?.[c.col] ?? 1);
          return (
            <div
              key={`${c.row}-${c.col}`}
              className={cx(
                "absolute flex items-center justify-center text-2xl",
                print ? "text-slate-900" : TONE[c.tone ?? "given"],
                c.fresh && "animate-fade-in",
                // Carries and borrows are written small, above the column.
                c.tone === "carry" || c.small ? "text-base" : c.text.length === 2 ? "text-xl" : c.text.length > 3 && "text-lg",
                overflows && "justify-start whitespace-nowrap"
              )}
              style={{ left: leftOf(c.col), top: (c.row + (c.mid ? 0.5 : 0)) * ROW, width: overflows ? undefined : widths[c.col], height: ROW }}
            >
              {c.text}
            </div>
          );
        })}
        {rules.map((r, i) => (
          <div
            key={`r${i}`}
            className={cx("absolute h-0.5", print ? "bg-slate-800" : "bg-white/80", r.fresh && "animate-fade-in")}
            style={{ left: leftOf(r.fromCol) + 2, top: (r.row + 1) * ROW - 1, width: leftOf(r.toCol + 1) - leftOf(r.fromCol) - 4 }}
          />
        ))}
        {vlines.map((v, i) => (
          <div
            key={`v${i}`}
            className={cx("absolute w-0.5", print ? "bg-slate-800" : "bg-white/80")}
            style={{ left: leftOf(v.col) - 1, top: v.fromRow * ROW + 3, height: (v.toRow - v.fromRow + 1) * ROW - 6 }}
          />
        ))}
      </div>
    </div>
  );
}
