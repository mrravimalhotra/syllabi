"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, PrinterIcon, VolumeIcon, VolumeOffIcon, XIcon } from "@/components/icons";
import { button, cx } from "@/components/ui";
import { NumberView } from "@/components/practice/NumberView";
import { WhyPanel } from "@/components/practice/WhyPanel";
import { Confetti } from "@/components/practice/Confetti";
import { playCorrect, playWrong } from "@/components/practice/sounds";
import { explain, markOrder, type OrderQuestion } from "@/lib/practice/order";
import type { PracticeNumber } from "@/lib/practice/numbers";

export interface QuizResult {
  question: OrderQuestion;
  picked: PracticeNumber[];
  marks: boolean[];
  correct: boolean;
}

const SOUND_KEY = "syllabi.practice.sound";
const PRAISE = ["Correct!", "Well done!", "Spot on!", "Brilliant!", "Great work!"];
const ENCOURAGE = ["Not quite", "Nearly there", "Good try"];

function readSoundSetting(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * A quiz on the whole screen (the menus hidden, so a child can be handed the
 * phone): tap the numbers in order, check, see what was right and why, then
 * a results screen.
 */
export function OrderQuiz({
  quiz,
  canPrint,
  onPrint,
  onExit,
  onNewQuiz,
  onRetry,
}: {
  quiz: OrderQuestion[];
  canPrint: boolean;
  onPrint: () => void;
  onExit: () => void;
  onNewQuiz: () => void;
  onRetry: (questions: OrderQuestion[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [feedback, setFeedback] = useState<QuizResult | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [burst, setBurst] = useState(0);
  const [sound, setSound] = useState(readSoundSetting);
  const feedbackTitle = useRef<HTMLParagraphElement>(null);
  const finished = results.length === quiz.length && !feedback;
  const q = quiz[index];

  // The page behind doesn't scroll while the quiz covers it.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const toggleSound = () => {
    setSound((on) => {
      try {
        localStorage.setItem(SOUND_KEY, on ? "off" : "on");
      } catch {
        // Not saved; the switch still works for this visit.
      }
      return !on;
    });
  };

  const exit = () => {
    const midway = !finished && (results.length > 0 || picked.length > 0);
    if (!midway || window.confirm("Leave this quiz? The answers so far won't be kept.")) onExit();
  };

  const check = () => {
    const answer = picked.map((i) => q.numbers[i]);
    const marks = markOrder(q, answer);
    const result = { question: q, picked: answer, marks, correct: marks.every(Boolean) };
    if (result.correct) {
      setBurst((b) => b + 1);
      if (sound) playCorrect();
    } else if (sound) playWrong();
    setResults((r) => [...r, result]);
    setFeedback(result);
    setShowWhy(!result.correct);
  };

  // Move focus to the result (keyboard and screen-reader users land on it; the sheet opens at the top).
  useEffect(() => {
    if (feedback) feedbackTitle.current?.focus({ preventScroll: true });
  }, [feedback]);

  const next = () => {
    setFeedback(null);
    setPicked([]);
    if (index < quiz.length - 1) setIndex(index + 1);
  };

  // Drawn on <body>, above the app's menus: an animated parent would otherwise trap a fixed layer inside the page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-50" role="dialog" aria-modal="true" aria-label="Practice quiz">
      <Confetti burst={burst} />
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2">
          <button type="button" onClick={exit} className={button.icon} aria-label="Leave the quiz">
            <XIcon className="h-5 w-5" />
          </button>
          <p className="flex-1 text-center text-sm font-medium text-slate-700" aria-live="polite">
            {finished ? "All done" : `Question ${index + 1} of ${quiz.length}`}
          </p>
          <button type="button" onClick={toggleSound} className={button.icon} aria-label={sound ? "Turn sound off" : "Turn sound on"} aria-pressed={sound}>
            {sound ? <VolumeIcon className="h-5 w-5" /> : <VolumeOffIcon className="h-5 w-5" />}
          </button>
        </div>
        <div className="h-1.5 bg-slate-100">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${(results.length / quiz.length) * 100}%` }} />
        </div>
      </div>

      {finished ? (
        <Results results={results} canPrint={canPrint} onPrint={onPrint} onNewQuiz={onNewQuiz} onRetry={onRetry} onExit={onExit} />
      ) : (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 pb-40">
          <p
            className={cx(
              "mx-auto rounded-full px-5 py-2 text-center text-lg font-semibold",
              q.ascending ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
            )}
          >
            <span aria-hidden="true">{q.ascending ? "Smallest → Biggest" : "Biggest → Smallest"}</span>
            <span className="sr-only">{q.ascending ? "Put the numbers in order from smallest to biggest" : "Put the numbers in order from biggest to smallest"}</span>
          </p>

          <section aria-label="Numbers to put in order">
            <p className="mb-2 text-center text-sm text-slate-500">Tap the numbers in order</p>
            <div className="flex flex-wrap justify-center gap-3">
              {q.numbers.map((n, i) => {
                const used = picked.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={used || feedback !== null}
                    onClick={() => setPicked((p) => [...p, i])}
                    className={cx(
                      "flex min-h-16 min-w-20 items-center justify-center rounded-2xl border-2 bg-white px-4 py-2 text-2xl font-semibold text-slate-900 shadow-sm transition",
                      used ? "border-slate-200 opacity-25" : "border-slate-200 hover:-translate-y-0.5 hover:border-brand-400 active:scale-95"
                    )}
                    aria-label={used ? `${n.text}, already placed` : n.text}
                  >
                    <NumberView n={n} />
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Your order">
            <p className="mb-2 text-center text-sm text-slate-500">Your order {picked.length > 0 && "(tap one to take it back)"}</p>
            <ol className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-3">
              {q.numbers.map((_, slot) => {
                const n = picked[slot] !== undefined ? q.numbers[picked[slot]] : null;
                return (
                  <li key={slot} className="flex items-center gap-1.5">
                    {slot > 0 && <span className="text-xl font-semibold text-slate-400" aria-hidden="true">{q.ascending ? "<" : ">"}</span>}
                    {n ? (
                      <button
                        type="button"
                        disabled={feedback !== null}
                        onClick={() => setPicked((p) => p.filter((_, k) => k !== slot))}
                        className="flex min-h-16 min-w-16 animate-pop-in items-center justify-center rounded-xl bg-brand-600 px-3 text-xl font-semibold text-white shadow-sm"
                        aria-label={`${n.text}, place ${slot + 1}. Tap to take it back.`}
                      >
                        <NumberView n={n} />
                      </button>
                    ) : (
                      <span className="flex min-h-16 min-w-16 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-400">
                        {slot + 1}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="mx-auto flex w-full max-w-sm gap-3">
            <button type="button" onClick={() => setPicked([])} disabled={!picked.length || feedback !== null} className={cx(button.secondary, "flex-1")}>
              Clear
            </button>
            <button type="button" onClick={check} disabled={picked.length < q.numbers.length || feedback !== null} className={cx(button.primary, "flex-[2]")}>
              <CheckIcon className="h-4 w-4" /> Check
            </button>
          </div>
        </main>
      )}

      {feedback && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/30" onClick={(e) => e.target === e.currentTarget && next()}>
          <div className="pb-safe flex max-h-[88dvh] w-full max-w-xl animate-slide-up flex-col rounded-t-3xl bg-white shadow-2xl sm:mb-6 sm:rounded-3xl">
            <div className="overflow-y-auto px-5 pt-5">
              <p
                ref={feedbackTitle}
                tabIndex={-1}
                className={cx("text-2xl font-semibold outline-none", feedback.correct ? "text-emerald-700" : "text-amber-700")}
                role="status"
              >
                {feedback.correct ? PRAISE[index % PRAISE.length] : ENCOURAGE[index % ENCOURAGE.length]}
              </p>
              <div className="mt-3 space-y-3">
                <OrderRow label="Your order" numbers={feedback.picked} marks={feedback.marks} ascending={feedback.question.ascending} />
                {!feedback.correct && <OrderRow label="Right order" numbers={feedback.question.answer} ascending={feedback.question.ascending} />}
              </div>
              <div className="mt-4">
                <button type="button" onClick={() => setShowWhy((s) => !s)} className={button.ghost} aria-expanded={showWhy}>
                  {showWhy ? "Hide why" : "Why is this the order?"}
                </button>
                {showWhy && (
                  <div className="mt-2 animate-fade-in">
                    <WhyPanel explanation={explain(feedback.question)} />
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-slate-100 p-4">
              <button type="button" onClick={next} className={cx(button.primary, "w-full")}>
                {index < quiz.length - 1 ? "Next question" : "See my score"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

/** A row of numbers in an order, each marked right (green) or wrong (red) when marks are given. */
function OrderRow({ label, numbers, marks, ascending }: { label: string; numbers: PracticeNumber[]; marks?: boolean[]; ascending: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <ol className="flex flex-wrap items-center gap-1.5">
        {numbers.map((n, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-400" aria-hidden="true">{ascending ? "<" : ">"}</span>}
            <span
              className={cx(
                "flex min-h-11 items-center rounded-lg px-2.5 text-lg font-semibold ring-1",
                !marks ? "bg-amber-50 text-amber-900 ring-amber-200" : marks[i] ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
              )}
            >
              <NumberView n={n} />
              {marks && <span className="sr-only">{marks[i] ? " (right place)" : " (wrong place)"}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Results({
  results,
  canPrint,
  onPrint,
  onNewQuiz,
  onRetry,
  onExit,
}: {
  results: QuizResult[];
  canPrint: boolean;
  onPrint: () => void;
  onNewQuiz: () => void;
  onRetry: (questions: OrderQuestion[]) => void;
  onExit: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const score = results.filter((r) => r.correct).length;
  const missed = results.filter((r) => !r.correct);
  const ratio = score / results.length;
  const stars = Math.max(1, Math.round(ratio * 5));
  const message = ratio === 1 ? "Perfect score!" : ratio >= 0.8 ? "Excellent work!" : ratio >= 0.6 ? "Good job, keep going!" : ratio >= 0.4 ? "Good try. Practice makes perfect." : "Keep practising, you'll get there.";

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 pb-24">
      <div className="space-y-2 text-center">
        <p className="text-3xl tracking-widest text-amber-400" aria-label={`${stars} out of 5 stars`}>
          {"★".repeat(stars)}
          <span className="text-slate-200">{"★".repeat(5 - stars)}</span>
        </p>
        <p className="text-5xl font-bold text-slate-900 tabular-nums">
          {score}
          <span className="text-2xl font-medium text-slate-400"> / {results.length}</span>
        </p>
        <p className="text-lg font-medium text-slate-700">{message}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {missed.length > 0 && (
          <button type="button" onClick={() => onRetry(missed.map((r) => r.question))} className={button.primary}>
            Practise the {missed.length} I missed
          </button>
        )}
        <button type="button" onClick={onNewQuiz} className={missed.length ? button.secondary : button.primary}>
          New quiz
        </button>
        {canPrint && (
          <button type="button" onClick={onPrint} className={button.secondary}>
            <PrinterIcon className="h-4 w-4" /> Print this quiz
          </button>
        )}
        <button type="button" onClick={onExit} className={button.ghost}>
          Change settings
        </button>
      </div>

      {missed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">The ones to look at again</h2>
          {missed.map((r, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <OrderRow label="Your order" numbers={r.picked} marks={r.marks} ascending={r.question.ascending} />
              <div className="mt-2">
                <OrderRow label="Right order" numbers={r.question.answer} ascending={r.question.ascending} />
              </div>
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className={cx(button.ghost, "mt-2")} aria-expanded={open === i}>
                {open === i ? "Hide why" : "Why?"}
              </button>
              {open === i && <WhyPanel explanation={explain(r.question)} />}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
