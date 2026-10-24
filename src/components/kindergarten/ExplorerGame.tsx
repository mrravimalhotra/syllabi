"use client";

import { useEffect, useState } from "react";
import { cx, button, card } from "@/components/ui";
import { IPA, blendStart, phoneLabel } from "@/lib/kindergarten/phonics";
import type { CvcQuestion } from "@/lib/kindergarten/quiz";

interface Props {
  words: CvcQuestion[];
  say: (text: string, kind?: "phrase" | "sound") => Promise<void>;
  sound: (letter: string, slow?: boolean) => Promise<void>;
  prepare: (texts: string[]) => void;
  prepareSounds: (letters: string[]) => void;
  onAgain: () => void;
  onExit: () => void;
}

/**
 * Word explorer: no questions and no scores. Tap a letter tile to hear its pure sound (never "puh"), then slide
 * from the first letter to the last: the first two sounds join ("ma…"), and at the end the whole word is said.
 */
export function ExplorerGame({ words, say, sound, prepare, prepareSounds, onAgain, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [popped, setPopped] = useState<number | null>(null);
  // 0: the separate sounds, 1: the first two joined, 2: the whole word.
  const [position, setPosition] = useState(0);
  const word = words[index];

  useEffect(() => {
    const next = words.slice(index, index + 2);
    prepare(next.map((w) => w.word));
    prepareSounds(next.flatMap((w) => w.letters));
  }, [index, words, prepare, prepareSounds]);

  function tapTile(i: number) {
    setPopped(i);
    setTimeout(() => setPopped((p) => (p === i ? null : p)), 300);
    void sound(word.letters[i]);
  }

  function slide(to: number) {
    if (to === position) return;
    setPosition(to);
    if (to === 1 && position < 1) void say(blendStart(word.letters), "sound");
    else if (to === 2) void say(word.word);
  }

  function nextWord() {
    setPosition(0);
    setPopped(null);
    setIndex((i) => (i + 1) % words.length);
  }

  const shown = position === 0 ? word.letters.join("   ") : position === 1 ? `${word.letters[0]}${word.letters[1]}…` : word.word;

  return (
    <section className={cx(card, "space-y-5 p-4 text-center sm:p-6")} aria-label="Word explorer">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onExit} className={button.small}>
          ← Menu
        </button>
        <span className="text-sm text-slate-500">
          Word {index + 1} of {words.length}
        </span>
        <button type="button" onClick={onAgain} className={button.small}>
          New words
        </button>
      </div>

      <button type="button" onClick={() => void say(word.word)} className="mx-auto block text-8xl leading-none" aria-label="Hear the word">
        <span aria-hidden>{word.emoji ?? "🔊"}</span>
      </button>

      <div data-word={word.word} className="flex justify-center gap-3" role="group" aria-label="Tap a letter to hear its sound">
        {word.letters.map((letter, i) => (
          <button
            key={i}
            type="button"
            onClick={() => tapTile(i)}
            className={cx(
              "flex min-h-28 w-24 flex-col items-center justify-center rounded-3xl border-4 bg-white text-6xl font-bold shadow-sm transition active:scale-95",
              popped === i ? "scale-110 border-amber-400 bg-amber-50" : "border-brand-200"
            )}
            aria-label={`Letter ${phoneLabel(letter)}`}
          >
            {letter}
            <span className="text-base font-medium text-slate-400">/{IPA[letter] ?? letter}/</span>
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-xs space-y-2">
        <label htmlFor="blend-slider" className="block text-sm font-medium text-slate-600">
          Slide to blend
        </label>
        <input
          id="blend-slider"
          type="range"
          min={0}
          max={2}
          step={1}
          value={position}
          onChange={(e) => slide(Number(e.target.value))}
          className="h-10 w-full accent-brand-600"
        />
        <p className="text-3xl font-bold tracking-wide text-slate-800" aria-live="polite">
          {shown}
          {position === 2 ? "!" : ""}
        </p>
      </div>

      <button type="button" onClick={nextWord} className={cx(button.primary, "min-h-12 px-6 text-lg")}>
        Next word →
      </button>
    </section>
  );
}
