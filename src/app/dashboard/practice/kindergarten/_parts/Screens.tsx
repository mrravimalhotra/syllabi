"use client";

import { ActivityScreen, type Tone } from "@/components/menu/Tiles";
import type { Activity } from "@/app/dashboard/practice/kindergarten/_parts/ActivityGame";
import { CompareChoices, CvcChoices, GameChoices, PlaceChoices, SightChoices } from "@/app/dashboard/practice/kindergarten/_parts/Settings";
import { SoundGuide } from "@/app/dashboard/practice/kindergarten/_parts/SoundGuide";
import { SoundEffectsChoice, VoiceChoice } from "@/app/dashboard/practice/kindergarten/_parts/VoiceChoice";
import type { GameId, GamesSettings } from "@/lib/kindergarten/games";
import type { PlaceSettings } from "@/lib/kindergarten/place-value";
import type { CompareSettings, CvcSettings, SightSettings } from "@/lib/kindergarten/quiz";

export type Screen = "blend" | "cvc" | "explore" | "sight" | "compare" | "place" | "guide" | "voice" | GameId;

/** What each tile and screen shows. */
export const SCREENS: Record<Screen, { emoji: string; tone: Tone; title: string; hint: string; description: string; badge?: string }> = {
  blend: {
    emoji: "👂",
    tone: "sky",
    title: "Listen and blend",
    hint: "Hear the sounds, find the picture",
    badge: "Start here",
    description: "Start here. Hear the sounds of a word one at a time (m… a… p…), put them together, and tap the picture.",
  },
  cvc: {
    emoji: "🐱",
    tone: "sky",
    title: "Spell the word",
    hint: "Tap the letters: c-a-t",
    description: "See a picture, hear the word, and tap its three letters in order: c-a-t, d-o-g, s-u-n.",
  },
  explore: {
    emoji: "🔍",
    tone: "sky",
    title: "Word explorer",
    hint: "Tap a letter, hear its sound",
    description:
      "No questions, no scores. Tap each letter to hear its pure sound, then slide from the first letter to the last to blend them into the word.",
  },
  sight: {
    emoji: "👀",
    tone: "sky",
    title: "Find the word",
    hint: "Words like “the” and “you”",
    description: "Hear a common word like “the” or “you”, then find it among three words.",
  },
  compare: {
    emoji: "🍎",
    tone: "amber",
    title: "More or fewer",
    hint: "Which group has more?",
    description: "Look at two groups of pictures and tap the one with more (or fewer), or “the same”.",
  },
  place: {
    emoji: "🔟",
    tone: "amber",
    title: "Place value",
    hint: "Tens and ones",
    description:
      "Learn what a digit is, and what it is worth where it sits (the 4 in 47 is worth 40), with tens and ones blocks. Then play the quiz.",
  },
  missing: {
    emoji: "🧩",
    tone: "sky",
    title: "Missing letter",
    hint: "c _ t: which letter fits?",
    description: "See a picture and its word with one letter missing (c _ t), hear the word, and tap the letter that fits.",
  },
  read: {
    emoji: "📖",
    tone: "sky",
    title: "Read and match",
    hint: "Read it, tap the picture",
    description:
      "Read a word (pig) or a short phrase (a cat in a hat) and tap its picture. The words are not read aloud: that is the child's job, though “Read it to me” helps.",
  },
  count: {
    emoji: "🔢",
    tone: "amber",
    title: "Count and tap",
    hint: "How many apples?",
    description: "Count the pictures, set out in rows of five, and tap the number.",
  },
  next: {
    emoji: "➡️",
    tone: "amber",
    title: "Before, after, between",
    hint: "14, __, 16",
    description: "Which number comes after 29, before 30, or between 14 and 16?",
  },
  names: {
    emoji: "🔤",
    tone: "amber",
    title: "Number names",
    hint: "7 is “seven”",
    description: "Match a number to its name (7 and “seven”), and a name to its number, the way school papers ask.",
  },
  bonds: {
    emoji: "🖐️",
    tone: "amber",
    title: "Make 5 and 10",
    hint: "3 and how many make 5?",
    description: "Some dots are filled in. How many more make 5, or 10? The first step to adding without counting on fingers.",
  },
  sums: {
    emoji: "➕",
    tone: "amber",
    title: "Add and take away",
    hint: "3 🍎 + 2 🍎",
    description: "Little sums with pictures: put two groups together, or take some away, and tap how many there are.",
  },
  pattern: {
    emoji: "🔴",
    tone: "amber",
    title: "What comes next?",
    hint: "🔴🔵🔴🔵 ?",
    description: "Look at a pattern of pictures and tap the one that comes next.",
  },
  guide: {
    emoji: "🗣️",
    tone: "slate",
    title: "How to say the sounds",
    hint: "Pure sounds, no “uh”",
    description: "How phonics teachers say each sound: the sound a letter makes, not its name, and with no “uh” after it.",
  },
  voice: {
    emoji: "🔊",
    tone: "slate",
    title: "Voice and sounds",
    hint: "Who reads, and the game sounds",
    description: "Choose which voice reads the words and sounds to your child, and whether games play a chime for right answers.",
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
  games: GamesSettings;
  setGames: (next: GamesSettings) => void;
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
    case "missing":
      return (
        <ActivityScreen {...base} onPlay={() => start(screen)}>
          <CvcChoices cvc={p.cvc} setCvc={p.setCvc} shared round={false} />
          <GameChoices id={screen} games={p.games} setGames={p.setGames} />
        </ActivityScreen>
      );
    case "read":
    case "count":
    case "next":
    case "names":
    case "bonds":
    case "sums":
    case "pattern":
      return (
        <ActivityScreen {...base} onPlay={() => start(screen)}>
          <GameChoices id={screen} games={p.games} setGames={p.setGames} />
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
          <SoundEffectsChoice />
        </ActivityScreen>
      );
  }
}
