"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon, ChevronRightIcon, LightbulbIcon } from "@/components/icons";
import { button, card, cx } from "@/components/ui";
import { type Speech } from "@/components/study-pack/useSpeech";
import type { PackQuestion, PackSection } from "@/lib/study-pack/types";

import { AnswerBlock, QuestionMeta, QuestionText } from "@/components/study-pack/PackParts";
import { ObjectiveResponse } from "@/components/study-pack/ObjectiveResponse";
import { TestResults } from "@/components/study-pack/TestResults";

/** One question at a time; the child answers, then marks themselves. */
export function PracticeTest({
  questions,
  answerId,
  speech,
  onChange,
}: {
  questions: PackQuestion[];
  answerId: string | null;
  speech: Speech;
  onChange: (section: PackSection, index: number, question: PackQuestion) => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // For objective questions marked by code: whether the child's choice was right.
  const [autoResult, setAutoResult] = useState<boolean | null>(null);
  const [marks, setMarks] = useState<(boolean | null)[]>(() => questions.map(() => null));
  // "Try again the ones marked Not yet": only those questions are asked, in order; null means all of them.
  const [retry, setRetry] = useState<number[] | null>(null);
  const finished = index >= questions.length;
  const score = marks.filter(Boolean).length;
  const q = questions[index];

  function mark(correct: boolean) {
    setMarks((m) => m.map((v, i) => (i === index ? correct : v)));
    speech.stop();
    setRevealed(false);
    setShowHint(false);
    setAutoResult(null);
    setIndex((i) => (retry ? (retry[retry.indexOf(i) + 1] ?? questions.length) : i + 1));
  }

  /** The child answered an objective question: marked at once by comparing with the key. */
  function respond(correct: boolean) {
    setAutoResult(correct);
    setRevealed(true);
  }

  function restart(onlyMissed: boolean) {
    if (onlyMissed) {
      const missed = marks.flatMap((m, i) => (m === false ? [i] : []));
      setRetry(missed.length > 0 ? missed : null);
      if (missed.length === 0) setMarks(questions.map(() => null));
      setIndex(missed[0] ?? 0);
    } else {
      setRetry(null);
      setMarks(questions.map(() => null));
      setIndex(0);
    }
    setRevealed(false);
    setShowHint(false);
    setAutoResult(null);
  }

  if (finished) return <TestResults questions={questions} marks={marks} onRestart={restart} />;

  return (
    <section className={cx(card, "space-y-4 p-5 sm:p-6")}>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span className="tabular-nums">Score so far: {score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <QuestionText q={q} label={`P${index + 1}.`} hideOptions={q.autoKey?.kind === "option"} />
      <QuestionMeta q={q} />
      {q.autoKey && <ObjectiveResponse key={index} q={q} locked={revealed} onRespond={respond} />}
      {showHint && q.hint && (
        <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <LightbulbIcon className="mt-0.5 h-4 w-4 shrink-0" /> {q.hint}
        </p>
      )}
      {!revealed ? (
        <div className="flex flex-wrap gap-2">
          {q.hint && !showHint && (
            <button type="button" onClick={() => setShowHint(true)} className={button.secondary}>
              <LightbulbIcon className="h-4 w-4" /> Hint
            </button>
          )}
          <button type="button" onClick={() => setRevealed(true)} className={q.autoKey ? button.secondary : button.primary}>
            Show the answer
          </button>
        </div>
      ) : (
        <>
          {autoResult !== null && (
            <p
              role="status"
              className={cx(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                autoResult ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
              )}
            >
              {autoResult ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
              {autoResult ? "Correct!" : "Not quite. See the answer below."}
            </p>
          )}
          <AnswerBlock q={q} section="practiceQuestions" index={index} answerId={answerId} speech={speech} onChange={onChange} />
          {autoResult !== null ? (
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button type="button" onClick={() => mark(autoResult)} className={button.primary}>
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-600">Did they get it?</span>
              <button type="button" onClick={() => mark(true)} className={button.success}>
                <CheckIcon className="h-4 w-4" /> Got it
              </button>
              <button type="button" onClick={() => mark(false)} className={button.secondary}>
                Not yet
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
