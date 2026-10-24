"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { cx } from "@/components/ui";
import { isVowel, phoneLabel } from "@/lib/kindergarten/phonics";
import type { BlendQuestion } from "@/lib/kindergarten/quiz";

interface Props {
  questions: BlendQuestion[];
  say: (text: string, kind?: "phrase" | "sound") => Promise<void>;
  sound: (letter: string, slow?: boolean) => Promise<void>;
  prepare: (texts: string[]) => void;
  prepareSounds: (letters: string[]) => void;
  onAgain: () => void;
  onExit: () => void;
}

/**
 * Listen and blend: the grown-up's voice says the sounds of a word one at a
 * time (m... a... p), with a finger dot touching each, and the child says the
 * word and taps its picture. The way children are first taught to blend.
 */
export function BlendGame({ questions, say, sound, prepare, prepareSounds, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [lit, setLit] = useState(-1);
  const [shake, setShake] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [helped, setHelped] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [mistake, setMistake] = useState(false);
  const [listening, setListening] = useState(false);
  // Stops the "listen" in progress (when another starts, an answer is tapped, or the question changes).
  const cancelListen = useRef<(() => void) | null>(null);
  const question = questions[index];

  useEffect(() => {
    const next = questions.slice(index, index + 2);
    prepare([...next.map((q) => q.word), "Listen.", "What word is it?", "Great job!", "Try again!"]);
    prepareSounds(next.flatMap((q) => q.letters));
  }, [index, questions, prepare, prepareSounds]);

  /** The sounds, one at a time with a finger dot on each, then the question. */
  const listen = useCallback(
    async (q: BlendQuestion) => {
      cancelListen.current?.();
      let cancelled = false;
      const mine = () => {
        cancelled = true;
      };
      cancelListen.current = mine;
      await Promise.resolve();
      setListening(true);
      try {
        await say("Listen.");
        for (let i = 0; i < q.letters.length; i++) {
          if (cancelled) return;
          setLit(i);
          await sound(q.letters[i], true);
        }
        setLit(-1);
        if (!cancelled) await say("What word is it?");
      } finally {
        // Cut short by a tapped answer: clear the finger dot and let "hear again" work. A newer listen has taken over otherwise.
        if (cancelListen.current === mine || !cancelled) {
          setLit(-1);
          setListening(false);
        }
      }
    },
    [say, sound]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new question starts by playing its sounds
    if (question) void listen(question);
    return () => {
      cancelListen.current?.();
    };
  }, [question, listen]);

  if (finished) return <RoundDone stars={stars} helped={helped} onAgain={onAgain} onExit={onExit} />;

  async function choose(word: string) {
    if (right) return;
    if (word !== question.word) {
      cancelListen.current?.();
      setMistake(true);
      setShake(word);
      setTimeout(() => setShake(null), 450);
      void say("Try again!");
      return;
    }
    cancelListen.current?.();
    setRight(word);
    setStars((s) => s + 1);
    if (mistake) setHelped((h) => [...h, question.word]);
    await say(`${question.word}. Great job!`);
    setRight(null);
    setMistake(false);
    if (index + 1 >= questions.length) setFinished(true);
    else setIndex(index + 1);
  }

  return (
    <RoundFrame index={index} total={questions.length} stars={stars} onExit={onExit}>
      <div data-word={question.word} className="space-y-6 text-center">
        <p className="text-sm text-slate-500">Listen to the sounds. Put them together. Which picture is it?</p>
        <div className="flex justify-center gap-4" aria-label="The sounds">
          {question.letters.map((letter, i) => (
            <span
              key={i}
              className={cx(
                "flex h-16 w-16 items-center justify-center rounded-full border-4 text-3xl font-bold transition-transform",
                lit === i ? "scale-125 border-amber-400 bg-amber-100" : "border-slate-200 bg-white",
                right && (isVowel(letter) ? "text-red-600" : "text-brand-700")
              )}
            >
              {right ? phoneLabel(letter) : lit === i ? "👆" : "●"}
            </span>
          ))}
        </div>
        <button
          type="button"
          disabled={listening || Boolean(right)}
          onClick={() => void listen(question)}
          className="mx-auto flex items-center gap-2 rounded-full bg-amber-50 px-5 py-2 text-base font-medium text-amber-900 disabled:opacity-50"
        >
          <span aria-hidden>🔊</span> Hear the sounds again
        </button>
        <div className="grid grid-cols-3 gap-3">
          {question.choices.map((choice) => (
            <button
              key={choice.word}
              type="button"
              aria-label={choice.word}
              onClick={() => void choose(choice.word)}
              className={cx(
                "flex aspect-square items-center justify-center rounded-3xl border-4 bg-white text-6xl shadow-sm transition active:scale-95 sm:text-7xl",
                right === choice.word
                  ? "border-emerald-400 bg-emerald-50"
                  : shake === choice.word
                    ? "kg-shake border-red-300 bg-red-50"
                    : "border-brand-200"
              )}
            >
              <span aria-hidden>{choice.emoji}</span>
            </button>
          ))}
        </div>
        {right && (
          <p className="kg-star text-5xl font-bold tracking-wide text-slate-800">
            {question.letters.map((l, i) => (
              <span key={i} className={isVowel(l) ? "text-red-600" : "text-brand-700"}>
                {phoneLabel(l)}
                {i < question.letters.length - 1 ? <span className="px-1 text-slate-300"> · </span> : null}
              </span>
            ))}
            <span className="px-2 text-slate-400">=</span>
            {question.word}
          </p>
        )}
      </div>
    </RoundFrame>
  );
}
