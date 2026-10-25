"use client";

import { useEffect, useState } from "react";
import { ANSWER_EVENT, type AnswerResult } from "@/components/practice/sounds";
import { cx } from "@/components/ui";

/** How the panda feels: idle (blinks), wave (hello), happy (a right answer), think (a wrong one: kind, never sad), clap (a round done). */
export type PandaMood = "idle" | "wave" | "happy" | "think" | "clap";

const INK = "#1f2937";

/** The children's guide: a panda drawn in code, so it needs no picture files and stays sharp at any size. */
export function Panda({ mood = "idle", className }: { mood?: PandaMood; className?: string }) {
  const smiling = mood === "happy" || mood === "clap" || mood === "wave";
  return (
    <svg viewBox="0 0 120 140" className={cx("panda", `panda-${mood}`, className)} aria-hidden data-mood={mood}>
      {/* Body, legs and belly */}
      <ellipse cx="44" cy="131" rx="13" ry="8" fill={INK} />
      <ellipse cx="76" cy="131" rx="13" ry="8" fill={INK} />
      <ellipse cx="60" cy="110" rx="34" ry="25" fill="#fff" stroke={INK} strokeWidth="2" />
      <ellipse cx="60" cy="114" rx="18" ry="13" fill="#f1f5f9" />
      <g className="panda-head">
        {/* Ears */}
        <circle cx="27" cy="20" r="14" fill={INK} />
        <circle cx="93" cy="20" r="14" fill={INK} />
        <circle cx="27" cy="20" r="6" fill="#f9a8d4" />
        <circle cx="93" cy="20" r="6" fill="#f9a8d4" />
        {/* Head */}
        <ellipse cx="60" cy="50" rx="44" ry="39" fill="#fff" stroke={INK} strokeWidth="2" />
        {/* Eye patches */}
        <ellipse cx="41" cy="50" rx="11" ry="15" fill={INK} transform="rotate(-28 41 50)" />
        <ellipse cx="79" cy="50" rx="11" ry="15" fill={INK} transform="rotate(28 79 50)" />
        {smiling ? (
          <>
            {/* Happy, closed eyes */}
            <path d="M35 51 q6 -7 12 0" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M73 51 q6 -7 12 0" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <g className="panda-eyes">
            <circle cx="42" cy="50" r="5.5" fill="#fff" />
            <circle cx="78" cy="50" r="5.5" fill="#fff" />
            <circle cx={mood === "think" ? 44 : 43} cy={mood === "think" ? 48 : 51} r="3" fill={INK} />
            <circle cx={mood === "think" ? 80 : 79} cy={mood === "think" ? 48 : 51} r="3" fill={INK} />
          </g>
        )}
        {/* Cheeks */}
        <circle cx="28" cy="66" r="6" fill="#fbcfe8" />
        <circle cx="92" cy="66" r="6" fill="#fbcfe8" />
        {/* Nose and mouth */}
        <ellipse cx="60" cy="64" rx="6" ry="4.2" fill={INK} />
        {mood === "think" ? (
          <ellipse cx="62" cy="75" rx="3.2" ry="3.6" fill="none" stroke={INK} strokeWidth="2.2" />
        ) : smiling ? (
          <path d="M51 70 q9 12 18 0" stroke={INK} strokeWidth="2.5" fill="#fb7185" strokeLinecap="round" />
        ) : (
          <path d="M53 71 q7 6 14 0" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
      </g>
      {/* Arms, drawn last so a waving paw shows in front of the head */}
      <g className="panda-arm-left">
        <ellipse cx="29" cy="106" rx="10" ry="16" fill={INK} transform="rotate(20 29 106)" />
      </g>
      <g className="panda-arm-right">
        <ellipse cx="91" cy="106" rx="10" ry="16" fill={INK} transform="rotate(-20 91 106)" />
      </g>
    </svg>
  );
}

/** How long the panda shows a reaction to an answer before going back to `rest`. */
const REACTION_MS = 1600;

/** The panda's mood in a game: happy after a right answer, thinking after a wrong one, then back to `rest`. */
function usePandaMood(rest: PandaMood = "idle"): PandaMood {
  const [reaction, setReaction] = useState<PandaMood | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAnswer = (e: Event) => {
      const result = (e as CustomEvent<AnswerResult>).detail;
      setReaction(result === "right" ? "happy" : "think");
      clearTimeout(timer);
      timer = setTimeout(() => setReaction(null), REACTION_MS);
    };
    window.addEventListener(ANSWER_EVENT, onAnswer);
    return () => {
      window.removeEventListener(ANSWER_EVENT, onAnswer);
      clearTimeout(timer);
    };
  }, []);
  return reaction ?? rest;
}

/** The panda in a game's top bar, reacting to each answer. */
export function GamePanda() {
  const mood = usePandaMood();
  return <Panda mood={mood} className="h-12 w-11 shrink-0 sm:h-14 sm:w-12" />;
}
