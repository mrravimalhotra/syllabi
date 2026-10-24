"use client";

import { Burst } from "@/components/kindergarten/Burst";
import { RIGHT_CARD, WRONG_CARD } from "@/components/kindergarten/feedback";
import { useEffect, useState } from "react";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { cx } from "@/components/ui";
import type { SightQuestion } from "@/lib/kindergarten/quiz";

interface Props {
  questions: SightQuestion[];
  say: (text: string) => Promise<void>;
  prepare: (texts: string[]) => void;
  onAgain: () => void;
  onExit: () => void;
}

const prompt = (word: string) => `Find the word. ${word}.`;

/** Hear a word, then find it among three written words. */
export function SightGame({ questions, say, prepare, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [shake, setShake] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [helped, setHelped] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [mistake, setMistake] = useState(false);
  const question = questions[index];

  useEffect(() => {
    prepare([...questions.slice(index, index + 2).map((q) => prompt(q.word)), "Great job!", "Try again!"]);
  }, [index, questions, prepare]);

  useEffect(() => {
    if (question) void say(prompt(question.word));
  }, [question, say]);

  if (finished) return <RoundDone stars={stars} helped={helped} onAgain={onAgain} onExit={onExit} />;

  async function choose(word: string) {
    if (right) return;
    if (word !== question.word) {
      setMistake(true);
      setShake(word);
      setTimeout(() => setShake(null), 450);
      void say("Try again!");
      return;
    }
    setRight(word);
    setStars((s) => s + 1);
    if (mistake) setHelped((h) => [...h, question.word]);
    await say("Great job!");
    setRight(null);
    setMistake(false);
    if (index + 1 >= questions.length) setFinished(true);
    else setIndex(index + 1);
  }

  return (
    <RoundFrame index={index} total={questions.length} stars={stars} onExit={onExit}>
      <div data-word={question.word} className="space-y-6 text-center">
        <button
          type="button"
          onClick={() => void say(prompt(question.word))}
          className="mx-auto flex items-center gap-2 rounded-full bg-brand-50 px-5 py-3 text-lg font-medium text-brand-800"
        >
          <span aria-hidden>🔊</span> Hear the word
        </button>
        <p className="text-sm text-slate-500">Find the word you heard.</p>
        <div className="grid gap-3">
          {question.choices.map((word, i) => (
            <button
              key={`${index}-${word}`}
              type="button"
              onClick={() => void choose(word)}
              className={cx(
                "relative min-h-24 rounded-3xl border-4 bg-white text-6xl font-bold text-slate-800 shadow-sm transition active:scale-95",
                right === word ? RIGHT_CARD : shake === word ? cx("kg-shake", WRONG_CARD) : "border-brand-200"
              )}
            >
              <span className="kg-pop inline-block" style={{ animationDelay: `${i * 0.08}s` }}>
                {word}
              </span>
              {right === word && <Burst />}
            </button>
          ))}
        </div>
      </div>
    </RoundFrame>
  );
}
