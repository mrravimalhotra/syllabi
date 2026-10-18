"use client";

import { useEffect, useRef, useState } from "react";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { cx } from "@/components/ui";
import type { CvcQuestion } from "@/lib/kindergarten/quiz";
import { LETTER_SOUNDS, isVowelLetter } from "@/lib/kindergarten/words";

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
  // Which sound is being said right now (-1 none), and whether the sounds have been blended into the word.
  const [lit, setLit] = useState(-1);
  const [blended, setBlended] = useState(false);
  const mistakeMade = useRef(false);
  const question = questions[index];

  useEffect(() => {
    const next = questions.slice(index, index + 2);
    prepare([...next.flatMap((q) => [q.word, ...q.letters.map((l) => LETTER_SOUNDS[l])]), "Great job!", "Try again!"]);
  }, [index, questions, prepare]);

  // Say the word when a question appears, so the child hears what to build.
  useEffect(() => {
    if (question) void say(question.word);
  }, [question, say]);

  /** Says each sound in turn while its box lights up, then the whole word: m, a, p, map. */
  async function soundOut(q: CvcQuestion, blend: boolean) {
    for (let i = 0; i < q.letters.length; i++) {
      setLit(i);
      await say(LETTER_SOUNDS[q.letters[i]]);
    }
    setLit(-1);
    if (blend) setBlended(true);
    await say(q.word);
  }

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
    if (next < question.letters.length) {
      // Each right letter says its sound, so the child learns what it sounds like.
      void say(LETTER_SOUNDS[letter]);
    } else {
      setCelebrating(true);
      setStars((s) => s + 1);
      if (mistakeMade.current) setHelped((h) => [...h, question.word]);
      await soundOut(question, true);
      await say("Great job!");
      setBlended(false);
      mistakeMade.current = false;
      if (index + 1 >= questions.length) setFinished(true);
      else {
        setIndex(index + 1);
        setPlaced(0);
        setUsed([]);
        setBlended(false);
      }
      setCelebrating(false);
    }
  }

  return (
    <RoundFrame index={index} total={questions.length} stars={stars} onExit={onExit}>
      <div data-word={question.word} className="space-y-6 text-center">
        <button type="button" onClick={() => void say(question.word)} className="mx-auto block text-8xl leading-none" aria-label="Hear the word again">
          <span aria-hidden>{question.emoji ?? "🔊"}</span>
        </button>
        <p className="text-sm text-slate-500">Tap the letters to spell the word. Tap the picture to hear it again.</p>
        <button
          type="button"
          disabled={celebrating}
          onClick={() => {
            setCelebrating(true);
            void soundOut(question, false).finally(() => setCelebrating(false));
          }}
          className="mx-auto flex items-center gap-2 rounded-full bg-amber-50 px-5 py-2 text-base font-medium text-amber-900 disabled:opacity-50"
        >
          <span aria-hidden>🔊</span> Sound it out
        </button>

        <div className="flex justify-center gap-3" aria-label="The word so far">
          {question.letters.map((letter, i) => (
            <span
              key={i}
              className={cx(
                "flex h-20 w-16 items-center justify-center rounded-2xl border-4 text-5xl font-bold transition-transform sm:h-24 sm:w-20",
                lit === i && "scale-110 border-amber-400 bg-amber-100",
                lit !== i && (i < placed ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-dashed border-slate-300 text-transparent"),
                i < placed && isVowelLetter(letter) && "text-red-600"
              )}
            >
              {i < placed ? letter : "_"}
            </span>
          ))}
        </div>

        {blended && (
          <p className="kg-star text-5xl font-bold tracking-wide text-slate-800" aria-label={`The sounds ${question.letters.join(", ")} make the word ${question.word}`}>
            {question.letters.map((l, i) => (
              <span key={i} className={isVowelLetter(l) ? "text-red-600" : "text-brand-700"}>
                {l}
                {i < question.letters.length - 1 ? <span className="px-1 text-slate-300"> · </span> : null}
              </span>
            ))}
            <span className="px-2 text-slate-400">=</span>
            {question.word}
          </p>
        )}

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
