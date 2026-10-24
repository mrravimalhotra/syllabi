// Kindergarten questions, made by code from a seed (the same seed always gives
// the same questions). No AI: every answer is known for certain.

import { seeded } from "@/lib/practice/random";
import { COUNT_EMOJI, CVC_WORDS, SIGHT_SETS, VOWELS, rimeOf, type CvcWord, type SightLevel, type Vowel } from "@/lib/kindergarten/words";

export const ROUND_SIZES = [5, 10] as const;

// ---- Building a word from letters ----

export interface CvcQuestion {
  word: string;
  /** null when the word has no clear picture (a speaker is shown instead). */
  emoji: string | null;
  /** The letters in order, e.g. ["c", "a", "t"]. */
  letters: string[];
  /** The letters to choose from: the word's own plus two that don't belong, shuffled. */
  tray: string[];
}

export interface CvcSettings {
  vowels: Vowel[];
  questions: number;
  /** Practise one word family only ("at": cat, bat, mat...); all the chosen vowels' words when absent. */
  family?: string;
}

/** The words a round draws from: the chosen vowels, narrowed to one family when it has words there. */
export function cvcPool(settings: CvcSettings): CvcWord[] {
  const vowels = settings.vowels.length ? settings.vowels : VOWELS.slice();
  const all = vowels.flatMap((v) => CVC_WORDS[v]);
  const family = settings.family ? all.filter((w) => rimeOf(w.word) === settings.family) : [];
  return family.length > 0 ? family : all;
}

export const DEFAULT_CVC: CvcSettings = { vowels: ["a"], questions: 5 };

export function makeCvcQuiz(settings: CvcSettings, seed: number): CvcQuestion[] {
  const r = seeded(seed);
  const order = r.shuffle(cvcPool(settings));
  const quiz: CvcQuestion[] = [];
  for (let i = 0; i < settings.questions; i++) {
    const entry = order[i % order.length];
    const letters = entry.word.split("");
    // Distractors: other letters, never the same as one already in the tray.
    const spare = r.shuffle("abcdefghijklmnoprstuvwxyz".split("").filter((c) => !letters.includes(c)));
    quiz.push({ ...entry, letters, tray: r.shuffle([...letters, spare[0], spare[1]]) });
  }
  return quiz;
}

// ---- Recognising a sight word ----

export interface SightQuestion {
  word: string;
  /** Three words to choose from, shuffled; one is the word. */
  choices: string[];
}

export interface SightSettings {
  level: SightLevel;
  questions: number;
}

export const DEFAULT_SIGHT: SightSettings = { level: "set1", questions: 5 };

export function makeSightQuiz(settings: SightSettings, seed: number): SightQuestion[] {
  const r = seeded(seed);
  const list: readonly string[] = SIGHT_SETS[settings.level];
  const order = r.shuffle(list);
  const quiz: SightQuestion[] = [];
  for (let i = 0; i < settings.questions; i++) {
    const word = order[i % order.length];
    // Wrong choices start with a different letter from the word, so each choice can be told apart at a glance.
    const others = r.shuffle(list.filter((w) => w.toLowerCase() !== word.toLowerCase() && w[0].toLowerCase() !== word[0].toLowerCase()));
    quiz.push({ word, choices: r.shuffle([word, others[0], others[1]]) });
  }
  return quiz;
}

// ---- More, fewer or the same ----

type CompareAsk = "more" | "fewer";

export interface CompareQuestion {
  ask: CompareAsk;
  emoji: string;
  left: number;
  right: number;
  /** "left", "right", or "same" when the groups are equal. */
  answer: "left" | "right" | "same";
}

export interface CompareSettings {
  /** The biggest group size. */
  max: 5 | 10 | 20;
  questions: number;
}

export const DEFAULT_COMPARE: CompareSettings = { max: 5, questions: 5 };

export function makeCompareQuiz(settings: CompareSettings, seed: number): CompareQuestion[] {
  const r = seeded(seed);
  const quiz: CompareQuestion[] = [];
  for (let i = 0; i < settings.questions; i++) {
    const left = r.int(1, settings.max);
    // About one question in five has equal groups.
    const right = r.next() < 0.2 ? left : r.int(1, settings.max);
    const ask: CompareAsk = r.next() < 0.5 ? "more" : "fewer";
    quiz.push({
      ask,
      emoji: r.pick(COUNT_EMOJI),
      left,
      right,
      answer: left === right ? "same" : (left > right) === (ask === "more") ? "left" : "right",
    });
  }
  return quiz;
}

/** The sentence spoken for a question. */
export function compareSpeech(q: CompareQuestion): string {
  return q.ask === "more" ? "Which group has more?" : "Which group has fewer?";
}

// ---- Listen to the sounds, then pick the picture ----

export interface BlendQuestion {
  word: string;
  emoji: string;
  letters: string[];
  /** Three pictures to choose from, shuffled; one is the word. */
  choices: { word: string; emoji: string }[];
}

/**
 * Oral blending: the child hears the sounds of a word one at a time (m... a...
 * p) and picks the picture they make. Only words with a clear picture are used.
 */
export function makeBlendQuiz(settings: CvcSettings, seed: number): BlendQuestion[] {
  const r = seeded(seed);
  const picture = (w: { word: string; emoji: string | null }): w is { word: string; emoji: string } => w.emoji !== null;
  // A family with no picture words falls back to all the chosen vowels' picture words.
  const familyPool = cvcPool(settings).filter(picture);
  const pool = familyPool.length > 0 ? familyPool : cvcPool({ ...settings, family: undefined }).filter(picture);
  const everything = VOWELS.flatMap((v) => CVC_WORDS[v]).filter(picture);
  const order = r.shuffle(pool);
  const quiz: BlendQuestion[] = [];
  for (let i = 0; i < settings.questions; i++) {
    const target = order[i % order.length];
    // Wrong pictures come from the same vowel when there are enough, so the child must listen to the whole word.
    const sameVowel = r.shuffle(everything.filter((w) => w.word[1] === target.word[1] && w.word !== target.word));
    const others = sameVowel.length >= 2 ? sameVowel : r.shuffle(everything.filter((w) => w.word !== target.word));
    quiz.push({
      word: target.word,
      emoji: target.emoji,
      letters: target.word.split(""),
      choices: r.shuffle([target, others[0], others[1]]).map((w) => ({ word: w.word, emoji: w.emoji })),
    });
  }
  return quiz;
}
