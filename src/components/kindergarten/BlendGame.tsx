"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CONSONANT_TEXT, pause, RIGHT_CARD, SOUND_GAP_MS, VOWEL_TEXT, WRONG_CARD } from "@/components/kindergarten/feedback";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { button, cx } from "@/components/ui";
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
 * After the right picture the question stays, so the sounds and the word can
 * be heard again, until Next.
 */
export function BlendGame({ questions, say, sound, prepare, prepareSounds, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [lit, setLit] = useState(-1);
  const [shake, setShake] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [right, setRight] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [helped, setHelped] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [listening, setListening] = useState(false);
  // Stops the "listen" in progress (when another starts, an answer is tapped, or the question changes).
  const cancelListen = useRef<(() => void) | null>(null);
  const question = questions[index];

  useEffect(() => {
    const next = questions.slice(index, index + 2);
    prepare([...next.map((q) => q.word), "Listen.", "What word is it?", "Great job!", "Try again!"]);
    prepareSounds(next.flatMap((q) => q.letters));
  }, [index, questions, prepare, prepareSounds]);

  /** The sounds, one at a time with a finger dot on each, then the question (or the word, once solved). */
  const listen = useCallback(
    async (q: BlendQuestion, solved = false) => {
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
          if (i > 0) await pause(SOUND_GAP_MS);
          setLit(i);
          await sound(q.letters[i], true);
        }
        setLit(-1);
        if (!cancelled) await say(solved ? q.word : "What word is it?");
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

  function choose(word: string) {
    if (right) return;
    cancelListen.current?.();
    if (word !== question.word) {
      setWrong((w) => (w.includes(word) ? w : [...w, word]));
      setShake(word);
      setTimeout(() => setShake(null), 450);
      void say("Try again!");
      return;
    }
    setRight(word);
    setStars((s) => s + 1);
    if (wrong.length) setHelped((h) => [...h, question.word]);
    void say(`${question.word}. Great job!`);
  }

  function next() {
    cancelListen.current?.();
    setRight(null);
    setWrong([]);
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
                right && (isVowel(letter) ? VOWEL_TEXT : CONSONANT_TEXT)
              )}
            >
              {right ? phoneLabel(letter) : lit === i ? "👆" : "●"}
            </span>
          ))}
        </div>
        <button
          type="button"
          disabled={listening}
          onClick={() => void listen(question, Boolean(right))}
          className={cx(button.primary, "mx-auto rounded-full px-6 text-lg disabled:opacity-50")}
        >
          <span aria-hidden>🔊</span> Play again
        </button>
        <div className="grid grid-cols-3 gap-3">
          {question.choices.map((choice) => (
            <button
              key={choice.word}
              type="button"
              aria-label={choice.word}
              onClick={() => choose(choice.word)}
              className={cx(
                "relative flex aspect-square items-center justify-center rounded-3xl border-4 bg-white text-6xl shadow-sm transition active:scale-95 sm:text-7xl",
                right === choice.word ? RIGHT_CARD : wrong.includes(choice.word) ? WRONG_CARD : "border-brand-200",
                shake === choice.word && "kg-shake"
              )}
            >
              <span aria-hidden>{choice.emoji}</span>
              {(right === choice.word || wrong.includes(choice.word)) && (
                <span
                  aria-hidden
                  className={cx("absolute top-2 right-3 text-3xl font-bold", right === choice.word ? "text-emerald-600" : "text-red-600")}
                >
                  {right === choice.word ? "✓" : "✗"}
                </span>
              )}
            </button>
          ))}
        </div>
        {right && (
          <>
            <p className="kg-star text-5xl font-bold tracking-wide text-slate-800">
              {question.letters.map((l, i) => (
                <span key={i} className={isVowel(l) ? VOWEL_TEXT : CONSONANT_TEXT}>
                  {phoneLabel(l)}
                  {i < question.letters.length - 1 ? <span className="px-1 text-slate-300"> · </span> : null}
                </span>
              ))}
              <span className="px-2 text-slate-400">=</span>
              {question.word}
            </p>
            <button type="button" onClick={next} className={cx(button.primary, "mx-auto px-8 text-lg")}>
              Next →
            </button>
          </>
        )}
      </div>
    </RoundFrame>
  );
}
