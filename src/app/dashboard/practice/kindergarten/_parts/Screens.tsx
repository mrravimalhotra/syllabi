"use client";

import { ActivityScreen, type Tone } from "@/app/dashboard/practice/kindergarten/_parts/ActivityCard";
import type { Activity } from "@/app/dashboard/practice/kindergarten/_parts/ActivityGame";
import { CompareChoices, CvcChoices, PlaceChoices, SightChoices } from "@/app/dashboard/practice/kindergarten/_parts/Settings";
import { SoundGuide } from "@/app/dashboard/practice/kindergarten/_parts/SoundGuide";
import { VoiceChoice } from "@/app/dashboard/practice/kindergarten/_parts/VoiceChoice";
import type { PlaceSettings } from "@/lib/kindergarten/place-value";
import type { CompareSettings, CvcSettings, SightSettings } from "@/lib/kindergarten/quiz";

export type Screen = "blend" | "cvc" | "explore" | "sight" | "compare" | "place" | "guide" | "voice";

/** What each tile and screen shows. */
export const SCREENS: Record<Screen, { emoji: string; tone: Tone; title: string; hint: string; description: string; badge?: string }> = {
  blend: {
    emoji: "👂",
    tone: "letters",
    title: "Listen and blend",
    hint: "Hear the sounds, find the picture",
    badge: "Start here",
    description: "Start here. Hear the sounds of a word one at a time (m… a… p…), put them together, and tap the picture.",
  },
  cvc: {
    emoji: "🐱",
    tone: "letters",
    title: "Spell the word",
    hint: "Tap the letters: c-a-t",
    description: "See a picture, hear the word, and tap its three letters in order: c-a-t, d-o-g, s-u-n.",
  },
  explore: {
    emoji: "🔍",
    tone: "letters",
    title: "Word explorer",
    hint: "Tap a letter, hear its sound",
    description:
      "No questions, no scores. Tap each letter to hear its pure sound, then slide from the first letter to the last to blend them into the word.",
  },
  sight: {
    emoji: "👀",
    tone: "letters",
    title: "Find the word",
    hint: "Words like “the” and “you”",
    description: "Hear a common word like “the” or “you”, then find it among three words.",
  },
  compare: {
    emoji: "🍎",
    tone: "numbers",
    title: "More or fewer",
    hint: "Which group has more?",
    description: "Look at two groups of pictures and tap the one with more (or fewer), or “the same”.",
  },
  place: {
    emoji: "🔟",
    tone: "numbers",
    title: "Place value",
    hint: "Tens and ones",
    description:
      "Learn what a digit is, and what it is worth where it sits (the 4 in 47 is worth 40), with tens and ones blocks. Then play the quiz.",
  },
  guide: {
    emoji: "🗣️",
    tone: "grownups",
    title: "How to say the sounds",
    hint: "Pure sounds, no “uh”",
    description: "How phonics teachers say each sound: the sound a letter makes, not its name, and with no “uh” after it.",
  },
  voice: {
    emoji: "🔊",
    tone: "grownups",
    title: "Voice",
    hint: "Who reads to your child",
    description: "Choose which voice reads the words and sounds to your child.",
  },
};

interface Props {
  screen: Screen;
  cvc: CvcSettings;
  setCvc: (next: CvcSettings) => void;
  sight: SightSettings;
  setSight: (next: SightSettings) => void;
  compare: CompareSettings;
  setCompare: (next: CompareSettings) => void;
  place: PlaceSettings;
  setPlace: (next: PlaceSettings) => void;
  voice: "natural" | "phone";
  chooseVoice: (next: "natural" | "phone") => void;
  start: (kind: Activity) => void;
  onBack: () => void;
}

/** One activity's own screen, with its choices and the buttons to start. */
export function KindergartenScreen({ screen, start, onBack, ...p }: Props) {
  const info = SCREENS[screen];
  const base = { emoji: info.emoji, tone: info.tone, title: info.title, description: info.description, onBack };
  switch (screen) {
    case "blend":
    case "cvc":
    case "explore":
      return (
        <ActivityScreen {...base} onPlay={() => start(screen)}>
          <CvcChoices cvc={p.cvc} setCvc={p.setCvc} shared={screen !== "cvc"} />
        </ActivityScreen>
      );
    case "sight":
      return (
        <ActivityScreen {...base} onPlay={() => start("sight")}>
          <SightChoices sight={p.sight} setSight={p.setSight} />
        </ActivityScreen>
      );
    case "compare":
      return (
        <ActivityScreen {...base} onPlay={() => start("compare")}>
          <CompareChoices compare={p.compare} setCompare={p.setCompare} />
        </ActivityScreen>
      );
    case "place":
      return (
        <ActivityScreen {...base} onLearn={() => start("place-learn")} onPlay={() => start("place")}>
          <PlaceChoices place={p.place} setPlace={p.setPlace} />
        </ActivityScreen>
      );
    case "guide":
      return (
        <ActivityScreen {...base}>
          <SoundGuide />
        </ActivityScreen>
      );
    case "voice":
      return (
        <ActivityScreen {...base}>
          <VoiceChoice voice={p.voice} onChoose={p.chooseVoice} />
        </ActivityScreen>
      );
  }
}
