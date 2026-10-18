"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { RoundDone, RoundFrame } from "@/components/kindergarten/RoundFrame";
import { cx } from "@/components/ui";
import { initialFlow, nextFlow } from "@/lib/kindergarten/flow";
import { listenOnce } from "@/lib/kindergarten/listen";
import { PHONEMES, blendStart, isVowel, phoneLabel } from "@/lib/kindergarten/phonics";
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

// Until sounds are scored by a speech-assessment service, the grown-up listens
// and taps "Good" or "Again"; these are the scores that stand for those taps.
const GOOD = 90;
const AGAIN = 30;

/**
 * Say it back: the child hears a sound, says it, then says the whole word. Their
 * voice is recorded (16 kHz) and played back, and the grown-up judges it.
 */
export function SayItGame({ questions, say, sound, prepare, prepareSounds, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [stars, setStars] = useState(0);
  const [helped, setHelped] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const question = questions[index];
  const [flow, send] = useReducer(
    (s: ReturnType<typeof nextFlow>, e: Parameters<typeof nextFlow>[1]) => nextFlow(s, e, question.letters.length),
    initialFlow
  );
  const [level, setLevel] = useState(0);
  const [clip, setClip] = useState<string | null>(null);
  const [micProblem, setMicProblem] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const next = questions.slice(index, index + 2);
    prepare([...next.map((q) => q.word), "Listen.", "Now you.", "Say the whole word.", "Great job!"]);
    prepareSounds(next.flatMap((q) => q.letters));
  }, [index, questions, prepare, prepareSounds]);

  // Each step of the lesson runs once, then tells the flow it is done.
  const step = flow.step;
  const soundIndex = "sound" in flow ? flow.sound : -1;
  const target = flow.step === "guide" ? flow.target : -1;
  const tries = "tries" in flow ? flow.tries : 0;
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    abort.current = controller;
    const run = async () => {
      await Promise.resolve();
      if (!live) return;
      if (step === "init") send({ type: "START" });
      else if (step === "model") {
        await say(tries === 0 ? "Listen." : "Listen again.");
        if (live) await sound(question.letters[soundIndex], true);
        if (live) await say("Now you.");
        if (live) send({ type: "MODEL_DONE" });
      } else if (step === "listen" || step === "listenBlend") {
        try {
          const heard = await listenOnce(setLevel, controller.signal);
          if (!live) return;
          setClip((old) => {
            if (old) URL.revokeObjectURL(old);
            return heard.heard ? URL.createObjectURL(heard.wav) : null;
          });
          send({ type: "HEARD", heard: heard.heard });
        } catch {
          if (live) setMicProblem(true);
        }
      } else if (step === "blending") {
        for (let i = 0; i < question.letters.length && live; i++) await sound(question.letters[i], true);
        if (live) await say(blendStart(question.letters), "sound");
        if (live) await say(question.word);
        if (live) await say("Say the whole word.");
        if (live) send({ type: "BLEND_DONE" });
      } else if (step === "guide") {
        const letter = question.letters[target];
        // A helpful nudge: how to make the sound, then the sound again.
        await say(`Good try! ${PHONEMES[letter].tip}`);
        if (live) await sound(letter, true);
        if (live) send({ type: "GUIDE_DONE" });
      } else if (step === "celebrate") {
        setStars((s) => s + 1);
        if (flow.blendScore === null) setHelped((h) => [...h, question.word]);
        await say(`${question.word}. Great job!`);
        if (!live) return;
        if (index + 1 >= questions.length) setFinished(true);
        else {
          setIndex(index + 1);
          send({ type: "START" });
        }
      }
    };
    void run();
    return () => {
      live = false;
      controller.abort();
      setLevel(0);
    };
    // The flow object itself changes with every event; only these parts decide what runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, soundIndex, tries, target, index]);

  if (finished) return <RoundDone stars={stars} helped={helped} onAgain={onAgain} onExit={onExit} />;

  const judging = step === "evaluating" || step === "evaluateBlend";
  const listening = step === "listen" || step === "listenBlend";
  const current = soundIndex >= 0 ? question.letters[soundIndex] : null;

  return (
    <RoundFrame index={index} total={questions.length} stars={stars} onExit={onExit}>
      <div data-word={question.word} className="space-y-6 text-center">
        <p className="text-sm text-slate-500">Hear the sound, then say it back. Then say the whole word.</p>
        <div className="flex justify-center gap-4" aria-label="The sounds">
          {question.letters.map((letter, i) => (
            <span
              key={i}
              className={cx(
                "flex h-16 w-16 items-center justify-center rounded-full border-4 text-3xl font-bold",
                soundIndex === i ? "scale-125 border-amber-400 bg-amber-100" : "border-slate-200 bg-white",
                (soundIndex > i || soundIndex < 0) && (isVowel(letter) ? "text-red-600" : "text-brand-700")
              )}
            >
              {phoneLabel(letter)}
            </span>
          ))}
        </div>
        {micProblem ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            The microphone is not available. Allow it for this site in the browser, then press ← Menu and start again.
          </p>
        ) : (
          <>
            <div
              className={cx(
                "mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl transition",
                listening ? "bg-red-100" : "bg-slate-100"
              )}
              style={{ transform: `scale(${1 + level * 0.6})` }}
              role="img"
              aria-label={listening ? "Listening" : "Not listening"}
            >
              {listening ? "🎤" : "🔊"}
            </div>
            <p className="text-lg font-medium text-slate-800" aria-live="polite">
              {listening ? "Your turn! Say it now." : judging ? "Well said!" : step === "guide" ? "Let's listen once more." : "Listen…"}
            </p>
          </>
        )}
        {judging && (
          <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">For the grown-up: listen to the child, then choose.</p>
            {clip && <audio src={clip} controls className="mx-auto" />}
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => send({ type: "SCORED", score: GOOD })}
                className="min-h-12 rounded-2xl bg-emerald-600 px-6 text-lg font-semibold text-white active:scale-95"
              >
                👍 Good
              </button>
              <button
                type="button"
                onClick={() => send({ type: "SCORED", score: AGAIN })}
                className="min-h-12 rounded-2xl bg-amber-500 px-6 text-lg font-semibold text-white active:scale-95"
              >
                🔁 Again
              </button>
            </div>
            {step === "evaluating" && current !== null && (
              <p className="text-xs text-slate-500">{PHONEMES[question.letters[soundIndex]].tip}</p>
            )}
          </div>
        )}
      </div>
    </RoundFrame>
  );
}
