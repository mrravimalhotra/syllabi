"use client";

import { useEffect, useRef, useState } from "react";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { cx } from "@/components/ui";
import type { CvcQuestion } from "@/lib/kindergarten/quiz";

interface Props {
  questions: CvcQuestion[];
  say: (text: string) => Promise<void>;
  prepare: (texts: string[]) => void;
  onAgain: () => void;
  onExit: () => void;
}

/** Build the word shown in the picture by tapping its letters in order. */
export function CvcGame({ questions, say, prepare, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [placed, setPlaced] = useState(0);
  const [used, setUsed] = useState<number[]>([]);
  const [shake, setShake] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [helped, setHelped] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const mistakeMade = useRef(false);
  const question = questions[index];

  useEffect(() => {
    prepare([...questions.slice(index, index + 2).map((q) => q.word), "Great job!", "Try again!"]);
  }, [index, questions, prepare]);

  // Say the word when a question appears, so the child hears what to build.
  useEffect(() => {
    if (question) void say(question.word);
  }, [question, say]);

  if (finished) return <RoundDone stars={stars} helped={helped} onAgain={onAgain} onExit={onExit} />;

  async function tap(trayIndex: number) {
    if (celebrating) return;
    const letter = question.tray[trayIndex];
    if (letter !== question.letters[placed]) {
      mistakeMade.current = true;
      setShake(trayIndex);
      setTimeout(() => setShake(null), 450);
      void say("Try again!");
      return;
    }
    setUsed((u) => [...u, trayIndex]);
    const next = placed + 1;
    setPlaced(next);
    if (next === question.letters.length) {
      setCelebrating(true);
      setStars((s) => s + 1);
      if (mistakeMade.current) setHelped((h) => [...h, question.word]);
      await say(`${question.word}. Great job!`);
      mistakeMade.current = false;
      if (index + 1 >= questions.length) setFinished(true);
      else {
        setIndex(index + 1);
        setPlaced(0);
        setUsed([]);
      }
      setCelebrating(false);
    }
  }

  return (
    <RoundFrame index={index} total={questions.length} stars={stars} onExit={onExit}>
      <div data-word={question.word} className="space-y-6 text-center">
        <button type="button" onClick={() => void say(question.word)} className="mx-auto block text-8xl leading-none" aria-label="Hear the word again">
          <span aria-hidden>{question.emoji}</span>
        </button>
        <p className="text-sm text-slate-500">Tap the letters to spell the word. Tap the picture to hear it again.</p>

        <div className="flex justify-center gap-3" aria-label="The word so far">
          {question.letters.map((letter, i) => (
            <span
              key={i}
              className={cx(
                "flex h-20 w-16 items-center justify-center rounded-2xl border-4 text-5xl font-bold sm:h-24 sm:w-20",
                i < placed ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-dashed border-slate-300 text-transparent"
              )}
            >
              {i < placed ? letter : "_"}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3" role="group" aria-label="Letters to choose from">
          {question.tray.map((letter, i) => (
            <button
              key={i}
              type="button"
              disabled={used.includes(i) || celebrating}
              onClick={() => void tap(i)}
              className={cx(
                "flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-brand-200 bg-brand-50 text-5xl font-bold text-brand-800 shadow-sm transition active:scale-95 disabled:opacity-30",
                shake === i && "kg-shake border-red-300 bg-red-50"
              )}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>
    </RoundFrame>
  );
}
