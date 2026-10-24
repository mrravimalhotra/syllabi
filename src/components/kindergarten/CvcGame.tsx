"use client";

import { Burst } from "@/components/kindergarten/Burst";
import { CONSONANT_TEXT, pause, SOUND_GAP_MS, VOWEL_TEXT, WRONG_CARD } from "@/components/kindergarten/feedback";
import { useEffect, useRef, useState } from "react";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { button, cx } from "@/components/ui";
import type { CvcQuestion } from "@/lib/kindergarten/quiz";
import { blendStart, isVowel, phoneLabel } from "@/lib/kindergarten/phonics";

interface Props {
  questions: CvcQuestion[];
  say: (text: string, kind?: "phrase" | "sound") => Promise<void>;
  sound: (letter: string, slow?: boolean) => Promise<void>;
  prepare: (texts: string[]) => void;
  prepareSounds: (letters: string[]) => void;
  onAgain: () => void;
  onExit: () => void;
}

/** Build the word shown in the picture by tapping its letters in order. */
export function CvcGame({ questions, say, sound, prepare, prepareSounds, onAgain, onExit }: Props) {
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
  // The first two tiles lit together while their sounds are slid into one ("ma...").
  const [pair, setPair] = useState(false);
  const [blended, setBlended] = useState(false);
  // The finger sweeping under the word while it is said fast.
  const [sweep, setSweep] = useState(false);
  const mistakeMade = useRef(false);
  const question = questions[index];

  useEffect(() => {
    const next = questions.slice(index, index + 2);
    prepare([...next.map((q) => q.word), "Great job!", "Try again!"]);
    prepareSounds(next.flatMap((q) => q.letters));
  }, [index, questions, prepare, prepareSounds]);

  // Say the word when a question appears, so the child hears what to build.
  useEffect(() => {
    if (question) void say(question.word);
  }, [question, say]);

  /**
   * Sounding a word out the way phonics teaches it, in three steps:
   * 1. Segment: touch each letter and say its sound (m… a… p…).
   * 2. Slide: join the first two sounds (ma…).
   * 3. Finish: slide a finger under the whole word while saying it: map.
   */
  async function soundOut(q: CvcQuestion, blend: boolean) {
    for (let i = 0; i < q.letters.length; i++) {
      if (i > 0) await pause(SOUND_GAP_MS);
      setLit(i);
      await sound(q.letters[i], true);
    }
    setLit(-1);
    setPair(true);
    await say(blendStart(q.letters), "sound");
    setPair(false);
    setSweep(true);
    await say(q.word);
    if (blend) setBlended(true);
    setSweep(false);
  }

  if (finished) return <RoundDone stars={stars} helped={helped} onAgain={onAgain} onExit={onExit} />;

  async function tap(trayIndex: number) {
    if (celebrating) return;
    const letter = question.tray[trayIndex];
    if (letter !== question.letters[placed]) {
      mistakeMade.current = true;
      setShake(trayIndex);
      setTimeout(() => setShake(null), 450);
      // The tapped letter still says its sound, so every click is heard.
      void sound(letter).then(() => say("Try again!"));
      return;
    }
    setUsed((u) => [...u, trayIndex]);
    const next = placed + 1;
    setPlaced(next);
    if (next < question.letters.length) {
      // Each right letter says its sound, so the child learns what it sounds like.
      void sound(letter);
    } else {
      setCelebrating(true);
      setStars((s) => s + 1);
      if (mistakeMade.current) setHelped((h) => [...h, question.word]);
      // The last letter is heard at once, like the others, before the whole word is sounded out.
      await sound(letter);
      await soundOut(question, true);
      // Let the child see the whole equation (k · a · t = cat) before moving on.
      await new Promise((r) => setTimeout(r, 900));
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
        <button
          type="button"
          onClick={() => void say(question.word)}
          className="mx-auto block text-8xl leading-none"
          aria-label="Hear the word again"
        >
          <span key={question.word} aria-hidden className="kg-pop inline-block">
            <span className="kg-bob inline-block">{question.emoji ?? "🔊"}</span>
          </span>
        </button>
        <p className="text-sm text-slate-500">Tap the letters to spell the word. Tap the picture to hear it again.</p>
        <button
          type="button"
          disabled={celebrating}
          onClick={() => {
            setCelebrating(true);
            void soundOut(question, false).finally(() => setCelebrating(false));
          }}
          className={cx(button.primary, "mx-auto rounded-full px-6 text-lg disabled:opacity-50")}
        >
          <span aria-hidden>🔊</span> Sound it out
        </button>

        <div className="relative flex justify-center gap-3" aria-label="The word so far">
          {blended && <Burst />}
          {question.letters.map((letter, i) => (
            <span
              key={i}
              className={cx(
                "flex h-20 w-16 items-center justify-center rounded-2xl border-4 text-5xl font-bold transition-transform sm:h-24 sm:w-20",
                (lit === i || (pair && i < 2)) && "scale-110 border-amber-400 bg-amber-100",
                lit !== i &&
                  !(pair && i < 2) &&
                  (i < placed
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-dashed border-sky-300 bg-white/60 text-transparent"),
                i < placed && isVowel(letter) && VOWEL_TEXT
              )}
            >
              {i < placed ? (
                <span key={`${question.word}-${i}`} className="kg-pop">
                  {letter}
                </span>
              ) : (
                "_"
              )}
            </span>
          ))}
        </div>

        <div className="mx-auto h-2 w-56 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div
            className={cx(
              "h-full rounded-full bg-amber-400 transition-[width] ease-linear",
              sweep ? "w-full duration-1000" : "w-0 duration-0"
            )}
          />
        </div>
        {blended && (
          <p
            className="kg-star text-4xl font-bold tracking-wide text-slate-800 sm:text-5xl"
            aria-label={`The sounds ${question.letters.join(", ")} make the word ${question.word}`}
          >
            {question.letters.map((l, i) => (
              <span key={i} className={isVowel(l) ? VOWEL_TEXT : CONSONANT_TEXT}>
                {phoneLabel(l)}
                {i < question.letters.length - 1 ? <span className="px-1 text-slate-300"> · </span> : null}
              </span>
            ))}
            <span className="px-2 text-slate-400">=</span>
            {question.word}
          </p>
        )}

        <LetterTray word={question.word} tray={question.tray} used={used} busy={celebrating} shake={shake} onTap={(i) => void tap(i)} />
      </div>
    </RoundFrame>
  );
}

/** The letters to choose from; they arrive one after another for each new word. */
function LetterTray({
  word,
  tray,
  used,
  busy,
  shake,
  onTap,
}: {
  word: string;
  tray: string[];
  used: number[];
  busy: boolean;
  shake: number | null;
  onTap: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3" role="group" aria-label="Letters to choose from">
      {tray.map((letter, i) => (
        <button
          key={i}
          type="button"
          disabled={used.includes(i) || busy}
          onClick={() => onTap(i)}
          className={cx(
            "flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-brand-200 bg-brand-50 text-5xl font-bold text-brand-800 shadow-sm transition active:scale-95 disabled:opacity-30",
            shake === i && cx("kg-shake", WRONG_CARD)
          )}
        >
          <span key={word} className="kg-pop" style={{ animationDelay: `${i * 0.06}s` }}>
            {letter}
          </span>
        </button>
      ))}
    </div>
  );
}
