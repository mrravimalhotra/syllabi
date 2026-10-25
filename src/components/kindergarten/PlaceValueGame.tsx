"use client";

import { cheer, oops } from "@/components/practice/sounds";
import { Burst } from "@/components/kindergarten/Burst";
import { RIGHT_CARD, WRONG_CARD } from "@/components/kindergarten/feedback";
import { useEffect, useState } from "react";
import { PlaceBlocks } from "@/components/kindergarten/PlaceBlocks";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { cx } from "@/components/ui";
import { onesOf, placeSpeech, tensOf, type PlaceQuestion } from "@/lib/kindergarten/place-value";

interface Props {
  questions: PlaceQuestion[];
  say: (text: string) => Promise<void>;
  prepare: (texts: string[]) => void;
  onAgain: () => void;
  onExit: () => void;
}

/** The number in big digits, with the digit being asked about picked out. */
function BigNumber({ q }: { q: PlaceQuestion }) {
  const digits = [tensOf(q.number), onesOf(q.number)];
  const asked = q.kind === "face" || q.kind === "place" ? q.column : null;
  return (
    <p className="flex justify-center gap-2 text-7xl font-bold text-slate-800" aria-label={`The number ${q.number}`}>
      {digits.map((d, i) => (
        <span key={i} className={cx("rounded-2xl px-3", asked === (i === 0 ? "tens" : "ones") ? "bg-amber-100 ring-4 ring-amber-400" : "")}>
          {d}
        </span>
      ))}
    </p>
  );
}

/** Face value, place value, which digit sits where, and reading a number from blocks: tap the right answer. */
export function PlaceValueGame({ questions, say, prepare, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [shake, setShake] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [helped, setHelped] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [mistake, setMistake] = useState(false);
  const question = questions[index];

  useEffect(() => {
    prepare([...questions.slice(index, index + 2).map(placeSpeech), "Great job!", "Try again!"]);
  }, [index, questions, prepare]);

  useEffect(() => {
    if (question) void say(placeSpeech(question));
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
    if (mistake) setHelped((h) => [...h, String(question.number)]);
    await say("Great job!");
    setRight(null);
    setMistake(false);
    if (index + 1 >= questions.length) setFinished(true);
    else setIndex(index + 1);
  }

  return (
    <RoundFrame index={index} total={questions.length} stars={stars} onExit={onExit}>
      <div data-answer={question.answer} data-number={question.number} className="space-y-5 text-center">
        <button
          type="button"
          onClick={() => void say(placeSpeech(question))}
          className="mx-auto flex items-center gap-2 rounded-full bg-brand-50 px-5 py-3 text-xl font-semibold text-brand-800"
        >
          <span aria-hidden>🔊</span> {placeSpeech(question)}
        </button>
        {question.kind === "build" ? <PlaceBlocks number={question.number} /> : <BigNumber q={question} />}
        <div className="grid grid-cols-3 gap-3">
          {question.choices.map((choice, i) => (
            <button
              key={`${index}-${choice}`}
              type="button"
              onClick={() => void choose(choice)}
              className={cx(
                "relative min-h-24 rounded-3xl border-4 bg-white text-5xl font-bold text-slate-800 shadow-sm transition active:scale-95",
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
