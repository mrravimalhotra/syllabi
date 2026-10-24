"use client";

import { Burst } from "@/components/kindergarten/Burst";
import { RIGHT_CARD, WRONG_CARD } from "@/components/kindergarten/feedback";
import { useEffect, useState } from "react";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { cx } from "@/components/ui";
import { compareSpeech, type CompareQuestion } from "@/lib/kindergarten/quiz";

interface Props {
  questions: CompareQuestion[];
  say: (text: string) => Promise<void>;
  prepare: (texts: string[]) => void;
  onAgain: () => void;
  onExit: () => void;
}

type Side = "left" | "right" | "same";

function Group({ count, emoji, tone }: { count: number; emoji: string; tone: "idle" | "right" | "wrong" }) {
  return (
    <span
      className={cx(
        "relative flex min-h-32 flex-1 flex-wrap content-center items-center justify-center gap-1 rounded-3xl border-4 p-3 text-3xl leading-none sm:text-4xl",
        tone === "right" ? RIGHT_CARD : tone === "wrong" ? cx("kg-shake", WRONG_CARD) : "border-brand-200 bg-white"
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} aria-hidden className="kg-pop" style={{ animationDelay: `${i * 0.04}s` }}>
          {emoji}
        </span>
      ))}
      {tone === "right" && <Burst />}
    </span>
  );
}

/** Which group has more (or fewer), or are they the same? */
export function CompareGame({ questions, say, prepare, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<{ side: Side; ok: boolean } | null>(null);
  const [stars, setStars] = useState(0);
  const [helped, setHelped] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [mistake, setMistake] = useState(false);
  const question = questions[index];

  useEffect(() => {
    prepare([...new Set(questions.map(compareSpeech)), "Great job!", "Try again!", "They are the same!"]);
  }, [questions, prepare]);

  useEffect(() => {
    if (question) void say(compareSpeech(question));
  }, [question, say]);

  if (finished) return <RoundDone stars={stars} helped={helped} onAgain={onAgain} onExit={onExit} />;

  async function choose(side: Side) {
    if (picked?.ok) return;
    const ok = side === question.answer;
    setPicked({ side, ok });
    if (!ok) {
      setMistake(true);
      setTimeout(() => setPicked((p) => (p && !p.ok ? null : p)), 450);
      void say("Try again!");
      return;
    }
    setStars((s) => s + 1);
    if (mistake) setHelped((h) => [...h, `${question.left} and ${question.right}`]);
    await say(side === "same" ? "They are the same!" : "Great job!");
    setPicked(null);
    setMistake(false);
    if (index + 1 >= questions.length) setFinished(true);
    else setIndex(index + 1);
  }

  const toneOf = (side: "left" | "right") => (picked?.side === side ? (picked.ok ? "right" : "wrong") : "idle");

  return (
    <RoundFrame index={index} total={questions.length} stars={stars} onExit={onExit}>
      <div data-answer={question.answer} className="space-y-5 text-center">
        <button
          type="button"
          onClick={() => void say(compareSpeech(question))}
          className="mx-auto flex items-center gap-2 rounded-full bg-brand-50 px-5 py-3 text-xl font-semibold text-brand-800"
        >
          <span aria-hidden>🔊</span> {question.ask === "more" ? "Which group has MORE?" : "Which group has FEWER?"}
        </button>
        <div className="flex gap-3">
          <button type="button" aria-label="The left group" onClick={() => void choose("left")} className="flex flex-1 active:scale-95">
            <Group key={index} count={question.left} emoji={question.emoji} tone={toneOf("left")} />
          </button>
          <button type="button" aria-label="The right group" onClick={() => void choose("right")} className="flex flex-1 active:scale-95">
            <Group key={index} count={question.right} emoji={question.emoji} tone={toneOf("right")} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => void choose("same")}
          className={cx(
            "relative mx-auto block rounded-full border-4 px-8 py-3 text-xl font-semibold transition active:scale-95",
            picked?.side === "same" ? (picked.ok ? RIGHT_CARD : cx("kg-shake", WRONG_CARD)) : "border-slate-200 bg-white text-slate-700"
          )}
        >
          They are the same
          {picked?.side === "same" && picked.ok && <Burst />}
        </button>
      </div>
    </RoundFrame>
  );
}
