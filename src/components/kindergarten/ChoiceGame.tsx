"use client";

import { cheer, oops } from "@/components/practice/sounds";
import { Burst } from "@/components/kindergarten/Burst";
import { CONSONANT_TEXT, RIGHT_CARD, VOWEL_TEXT, WRONG_CARD } from "@/components/kindergarten/feedback";
import { useEffect, useState } from "react";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { cx } from "@/components/ui";
import type { ChoiceQuestion, Show } from "@/lib/kindergarten/games";
import { VOWELS } from "@/lib/kindergarten/words";

interface Props {
  questions: ChoiceQuestion[];
  say: (text: string) => Promise<void>;
  prepare: (texts: string[]) => void;
  onAgain: () => void;
  onExit: () => void;
}

const isVowel = (c: string) => (VOWELS as readonly string[]).includes(c);

/** The empty box a missing answer goes in, filled once it is found. */
function Gap({ filled, className }: { filled: string | null; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded-2xl border-4 px-2",
        filled ? cx("kg-pop", RIGHT_CARD) : "border-dashed border-brand-300 bg-white text-brand-300",
        className
      )}
    >
      {filled ?? "?"}
    </span>
  );
}

/** Pictures laid out in rows of five, so they are easy to count. */
function Rows({ count, emoji, faded = 0 }: { count: number; emoji: string; faded?: number }) {
  return (
    <span
      className="grid justify-items-center gap-1 text-3xl leading-none sm:text-4xl"
      style={{ gridTemplateColumns: `repeat(${Math.min(count, 5)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => {
        const gone = i >= count - faded;
        return (
          <span key={i} aria-hidden className={cx("kg-pop relative", gone && "opacity-35")} style={{ animationDelay: `${i * 0.03}s` }}>
            {emoji}
            {gone && <span className="absolute inset-0 flex items-center justify-center text-2xl text-red-500">✕</span>}
          </span>
        );
      })}
    </span>
  );
}

const PANEL = "rounded-3xl border-4 border-brand-200 bg-white p-4";

/** What the question shows above the choices; `found` is the answer once it is tapped, to fill the gap. */
function Picture({ show, found, onHelp }: { show: Show; found: string | null; onHelp: () => void }) {
  switch (show.kind) {
    case "missing":
      return (
        <div className="space-y-4">
          <p className="text-8xl leading-none" aria-hidden>
            {show.emoji}
          </p>
          <p className="flex justify-center gap-2 text-6xl font-bold" aria-label="The word with a letter missing">
            {show.letters.map((c, i) =>
              i === show.gap ? (
                <Gap key={i} filled={found} className="min-h-20 min-w-16" />
              ) : (
                <span key={i} className={cx("min-w-12", isVowel(c) ? VOWEL_TEXT : CONSONANT_TEXT)}>
                  {c}
                </span>
              )
            )}
          </p>
        </div>
      );
    case "read":
    case "name":
      return (
        <div className="space-y-3">
          <p className={cx(PANEL, "font-bold text-slate-900", show.text.length > 12 ? "text-4xl sm:text-5xl" : "text-6xl sm:text-7xl")}>{show.text}</p>
          {show.kind === "read" || /[a-z]/.test(show.text) ? (
            <button type="button" onClick={onHelp} className="mx-auto block text-sm font-medium text-brand-700 underline underline-offset-4">
              Read it to me
            </button>
          ) : null}
        </div>
      );
    case "count":
      return (
        <div className={PANEL}>
          <Rows count={show.count} emoji={show.emoji} />
        </div>
      );
    case "next":
      return (
        <p className="flex flex-wrap justify-center gap-3 text-5xl font-bold tabular-nums text-slate-900 sm:text-6xl">
          {show.numbers.map((n, i) =>
            n === null ? (
              <Gap key={i} filled={found} className="min-h-20 min-w-24" />
            ) : (
              <span key={i} className={cx(PANEL, "min-w-24 py-2")}>
                {n}
              </span>
            )
          )}
        </p>
      );
    case "bonds":
      return (
        <div className="space-y-3">
          <div className={cx(PANEL, "mx-auto grid w-fit grid-cols-5 gap-2")} aria-label={`${show.have} of ${show.total} filled`}>
            {Array.from({ length: show.total }, (_, i) => (
              <span
                key={i}
                className={cx(
                  "h-12 w-12 rounded-full border-4 sm:h-14 sm:w-14",
                  i < show.have ? "border-brand-500 bg-brand-500" : found && i < show.have + Number(found) ? "kg-pop border-amber-400 bg-amber-300" : "border-dashed border-slate-300"
                )}
              />
            ))}
          </div>
          <p className="flex items-center justify-center gap-2 text-4xl font-bold tabular-nums text-slate-900">
            {show.have} + <Gap filled={found} className="min-h-14 min-w-16" /> = {show.total}
          </p>
        </div>
      );
    case "sum":
      return (
        <div className="space-y-3">
          {show.op === "+" ? (
            <div className="flex items-center justify-center gap-2">
              <span className={PANEL}>
                <Rows count={show.a} emoji={show.emoji} />
              </span>
              <span className="text-4xl font-bold text-slate-500">+</span>
              <span className={PANEL}>
                <Rows count={show.b} emoji={show.emoji} />
              </span>
            </div>
          ) : (
            <div className={PANEL}>
              <Rows count={show.a} emoji={show.emoji} faded={show.b} />
            </div>
          )}
          <p className="flex items-center justify-center gap-2 text-4xl font-bold tabular-nums text-slate-900">
            {show.a} {show.op} {show.b} = <Gap filled={found} className="min-h-14 min-w-16" />
          </p>
        </div>
      );
    case "pattern":
      return (
        <p
          className={cx(
            PANEL,
            "flex flex-wrap items-center justify-center gap-1 px-2 leading-none sm:gap-2",
            show.items.length > 6 ? "text-2xl sm:text-4xl" : "text-3xl sm:text-5xl"
          )}
        >
          {show.items.map((item, i) => (
            <span key={i} aria-hidden className="kg-pop" style={{ animationDelay: `${i * 0.05}s` }}>
              {item}
            </span>
          ))}
          <Gap filled={found} className="min-h-12 min-w-12" />
        </p>
      );
  }
}

/** Look (or listen), then tap the right one of three: the shared screen of the newer kindergarten games. */
export function ChoiceGame({ questions, say, prepare, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [shake, setShake] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [helped, setHelped] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [mistake, setMistake] = useState(false);
  const question = questions[index];

  useEffect(() => {
    const next = questions.slice(index, index + 2);
    prepare([...new Set(next.flatMap((q) => (q.help ? [q.speech, q.help] : [q.speech]))), "Great job!", "Try again!"]);
  }, [index, questions, prepare]);

  useEffect(() => {
    if (question) void say(question.speech);
  }, [question, say]);

  if (finished) return <RoundDone stars={stars} helped={helped} onAgain={onAgain} onExit={onExit} />;

  async function choose(choice: string) {
    if (right) return;
    if (choice !== question.answer) {
      setMistake(true);
      setShake(choice);
      setTimeout(() => setShake(null), 450);
      oops();
      void say("Try again!");
      return;
    }
    setRight(choice);
    setStars((s) => s + 1);
    cheer();
    if (mistake) setHelped((h) => [...h, question.label]);
    await say("Great job!");
    setRight(null);
    setMistake(false);
    if (index + 1 >= questions.length) setFinished(true);
    else setIndex(index + 1);
  }

  // Being read to counts as needing help, so the grown-up's note mentions it.
  const help = () => {
    setMistake(true);
    void say(question.help ?? question.speech);
  };

  // Long choices (number names) stack; short ones sit in a row.
  const long = question.choices.some((c) => /[a-z]{4}/.test(c));

  return (
    <RoundFrame index={index} total={questions.length} stars={stars} onExit={onExit}>
      <div data-answer={question.answer} className="space-y-6 text-center">
        <button
          type="button"
          onClick={() => void say(question.speech)}
          className="mx-auto flex items-center gap-2 rounded-full bg-brand-50 px-5 py-3 text-lg font-medium text-brand-800"
        >
          <span aria-hidden>🔊</span> {question.speech}
        </button>
        <Picture key={index} show={question.show} found={right} onHelp={help} />
        <div className={cx("grid gap-3", long ? "grid-cols-1" : "grid-cols-3")} role="group" aria-label="Choices">
          {question.choices.map((choice, i) => (
            <button
              key={`${index}-${choice}`}
              type="button"
              onClick={() => void choose(choice)}
              className={cx(
                "relative min-h-24 rounded-3xl border-4 bg-white font-bold text-slate-800 shadow-sm transition active:scale-95",
                long ? "text-4xl" : "text-5xl sm:text-6xl",
                right === choice ? RIGHT_CARD : shake === choice ? cx("kg-shake", WRONG_CARD) : "border-brand-200"
              )}
            >
              <span className="kg-pop inline-block" style={{ animationDelay: `${i * 0.08}s` }}>
                {choice}
              </span>
              {right === choice && <Burst />}
            </button>
          ))}
        </div>
      </div>
    </RoundFrame>
  );
}
