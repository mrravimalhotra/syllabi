"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon, ChevronRightIcon, LightbulbIcon } from "@/components/icons";
import { button, card, cx, input } from "@/components/ui";
import { type Speech } from "@/components/study-pack/useSpeech";
import { normaliseResponse } from "@/lib/study-pack/auto-key";
import type { PackQuestion, PackSection } from "@/lib/study-pack/types";

import { AnswerBlock, QuestionMeta, QuestionText } from "@/components/study-pack/PackParts";

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
  const finished = index >= questions.length;
  const score = marks.filter(Boolean).length;
  const q = questions[index];

  function mark(correct: boolean) {
    setMarks((m) => m.map((v, i) => (i === index ? correct : v)));
    speech.stop();
    setRevealed(false);
    setShowHint(false);
    setAutoResult(null);
    setIndex((i) => i + 1);
  }

  /** The child answered an objective question: marked at once by comparing with the key. */
  function respond(correct: boolean) {
    setAutoResult(correct);
    setRevealed(true);
  }

  function restart(onlyMissed: boolean) {
    if (onlyMissed) {
      const first = marks.findIndex((m) => m === false);
      setIndex(first === -1 ? 0 : first);
    } else {
      setMarks(questions.map(() => null));
      setIndex(0);
    }
    setRevealed(false);
    setShowHint(false);
    setAutoResult(null);
  }

  if (finished) {
    const missed = questions.map((qq, i) => ({ qq, i })).filter(({ i }) => marks[i] === false);
    return (
      <section className={cx(card, "space-y-5 p-6 text-center")}>
        <p className="text-sm font-medium text-slate-500">Practice test finished</p>
        <p className="text-5xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {score}
          <span className="text-2xl text-slate-400">/{questions.length}</span>
        </p>
        <p className="text-sm text-slate-600">
          {score === questions.length
            ? "Every question right. Brilliant work!"
            : score >= questions.length * 0.7
              ? "Great effort. Go over the ones marked Not yet."
              : "Good start. Read the chapter parts again, then try the ones marked Not yet."}
        </p>
        {missed.length > 0 && (
          <ul className="space-y-1.5 text-left">
            {missed.map(({ qq, i }) => (
              <li key={i} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                P{i + 1}. {qq.question}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {missed.length > 0 && (
            <button type="button" onClick={() => restart(true)} className={button.primary}>
              Try again the ones marked Not yet
            </button>
          )}
          <button type="button" onClick={() => restart(false)} className={button.secondary}>
            Start again
          </button>
        </div>
      </section>
    );
  }

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

/**
 * The child's own answer to an objective question: tap an option, True or
 * False, or type the missing word. Marked by code against the key.
 */
function ObjectiveResponse({ q, locked, onRespond }: { q: PackQuestion; locked: boolean; onRespond: (correct: boolean) => void }) {
  const [chosen, setChosen] = useState<number | boolean | null>(null);
  const [typed, setTyped] = useState("");
  const key = q.autoKey!;

  const choiceClass = (selected: boolean, right: boolean) =>
    cx(
      "rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:cursor-default",
      locked && right
        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
        : locked && selected
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50"
    );

  if (key.kind === "option") {
    return (
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Choose an answer">
        {q.options.map((option, i) => (
          <button
            key={option}
            type="button"
            disabled={locked}
            onClick={() => {
              setChosen(i);
              onRespond(i === key.index);
            }}
            className={choiceClass(chosen === i, i === key.index)}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  if (key.kind === "truefalse") {
    return (
      <div className="flex gap-2" role="group" aria-label="True or false">
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            disabled={locked}
            onClick={() => {
              setChosen(value);
              onRespond(value === key.value);
            }}
            className={cx(choiceClass(chosen === value, value === key.value), "flex-1 text-center font-medium")}
          >
            {value ? "True" : "False"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (typed.trim()) onRespond(key.answers.includes(normaliseResponse(typed)));
      }}
    >
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={locked}
        placeholder="Type the missing word"
        aria-label="Your answer"
        className={cx(input, "min-w-0 flex-1")}
      />
      <button type="submit" disabled={locked || !typed.trim()} className={button.primary}>
        Check
      </button>
    </form>
  );
}
