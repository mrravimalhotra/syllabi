"use client";

import { useMemo } from "react";
import { BlendGame } from "@/components/kindergarten/BlendGame";
import { CompareGame } from "@/components/kindergarten/CompareGame";
import { ExplorerGame } from "@/components/kindergarten/ExplorerGame";
import { CvcGame } from "@/components/kindergarten/CvcGame";
import { PlaceValueGame } from "@/components/kindergarten/PlaceValueGame";
import { PlaceValueTutorial } from "@/components/kindergarten/PlaceValueTutorial";
import { SightGame } from "@/components/kindergarten/SightGame";
import type { useSay } from "@/components/kindergarten/useSay";
import { makePlaceQuiz, tutorialNumber, type PlaceSettings } from "@/lib/kindergarten/place-value";
import {
  makeBlendQuiz,
  makeCompareQuiz,
  makeCvcQuiz,
  makeSightQuiz,
  type CompareSettings,
  type CvcSettings,
  type SightSettings,
} from "@/lib/kindergarten/quiz";

export type Activity = "blend" | "cvc" | "sight" | "compare" | "place" | "place-learn" | "explore";

interface Props {
  kind: Activity;
  seed: number;
  cvc: CvcSettings;
  sight: SightSettings;
  compare: CompareSettings;
  place: PlaceSettings;
  voice: ReturnType<typeof useSay>;
  onAgain: () => void;
  /** From the lesson to the game. */
  onPlay: () => void;
  onExit: () => void;
}

/** The round being played: its questions are made from the seed and the grown-up's choices, so "Play again" is a new seed. */
export function ActivityGame({ kind, seed, cvc, sight, compare, place, voice, onAgain, onPlay, onExit }: Props) {
  const { say, sound, prepare, prepareSounds } = voice;
  const blendQuiz = useMemo(() => (kind === "blend" ? makeBlendQuiz(cvc, seed) : null), [kind, cvc, seed]);
  const cvcQuiz = useMemo(() => (kind === "cvc" ? makeCvcQuiz(cvc, seed) : null), [kind, cvc, seed]);
  const sightQuiz = useMemo(() => (kind === "sight" ? makeSightQuiz(sight, seed) : null), [kind, sight, seed]);
  const compareQuiz = useMemo(() => (kind === "compare" ? makeCompareQuiz(compare, seed) : null), [kind, compare, seed]);

  const explorerWords = useMemo(() => (kind === "explore" ? makeCvcQuiz({ ...cvc, questions: 10 }, seed) : null), [kind, cvc, seed]);
  const placeQuiz = useMemo(() => (kind === "place" ? makePlaceQuiz(place, seed) : null), [kind, place, seed]);

  if (explorerWords)
    return <ExplorerGame key={seed} words={explorerWords} say={say} sound={sound} prepare={prepare} prepareSounds={prepareSounds} onAgain={onAgain} onExit={onExit} />;
  if (kind === "place-learn")
    return <PlaceValueTutorial key={seed} number={tutorialNumber(seed)} say={say} prepare={prepare} onAnother={onAgain} onPlay={onPlay} onExit={onExit} />;
  if (placeQuiz) return <PlaceValueGame key={seed} questions={placeQuiz} say={say} prepare={prepare} onAgain={onAgain} onExit={onExit} />;
  if (blendQuiz)
    return (
      <BlendGame
        key={seed}
        questions={blendQuiz}
        say={say}
        sound={sound}
        prepare={prepare}
        prepareSounds={prepareSounds}
        onAgain={onAgain}
        onExit={onExit}
      />
    );
  if (cvcQuiz)
    return (
      <CvcGame
        key={seed}
        questions={cvcQuiz}
        say={say}
        sound={sound}
        prepare={prepare}
        prepareSounds={prepareSounds}
        onAgain={onAgain}
        onExit={onExit}
      />
    );
  if (sightQuiz) return <SightGame key={seed} questions={sightQuiz} say={say} prepare={prepare} onAgain={onAgain} onExit={onExit} />;
  if (compareQuiz) return <CompareGame key={seed} questions={compareQuiz} say={say} prepare={prepare} onAgain={onAgain} onExit={onExit} />;
  return null;
}
