// Printable kindergarten worksheets, made from a seed like the quizzes:
// "Complete each word family" and "Match the picture to the CVC words".

import { seeded } from "@/lib/practice/random";
import { CVC_WORDS, VOWELS, type Vowel } from "@/lib/kindergarten/words";

export const SHEET_KINDS = ["family", "match"] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];
export const SHEET_LABELS: Record<SheetKind, string> = { family: "Complete each word family", match: "Match the picture to the word" };

const ALL = VOWELS.flatMap((v) => CVC_WORDS[v].map((w) => ({ ...w, vowel: v })));

/** The ending of a CVC word that its family shares: cat, bat, hat → "at". */
const rime = (word: string) => word.slice(1);

export interface FamilyRow {
  rime: string;
  /** One word of the family, shown as the example. */
  example: string;
  vowel: Vowel;
}

/** Ten word families, each with one example word; the child writes more words that end the same way. */
export function makeFamilySheet(seed: number, vowels: readonly Vowel[] = VOWELS): FamilyRow[] {
  const r = seeded(seed);
  const pool = ALL.filter((w) => vowels.includes(w.vowel));
  const byRime = new Map<string, typeof pool>();
  for (const w of pool) byRime.set(rime(w.word), [...(byRime.get(rime(w.word)) ?? []), w]);
  const families = r.shuffle([...byRime.keys()]).slice(0, 10);
  return families.map((family) => {
    const example = r.pick(byRime.get(family)!);
    return { rime: family, example: example.word, vowel: example.vowel };
  });
}

export interface MatchSheet {
  /** Ten pictures in order. */
  pictures: { emoji: string; word: string }[];
  /** The same ten words, in a different order, to draw lines to. */
  words: string[];
}

/** Ten pictures on the left and their words, shuffled, on the right. Only words with a clear picture are used. */
export function makeMatchSheet(seed: number, vowels: readonly Vowel[] = VOWELS): MatchSheet {
  const r = seeded(seed);
  const pool = ALL.filter((w) => w.emoji && vowels.includes(w.vowel));
  const chosen = r.shuffle(pool).slice(0, 10);
  const pictures = chosen.map((w) => ({ emoji: w.emoji!, word: w.word }));
  let words = r.shuffle(pictures.map((p) => p.word));
  // Never leave a word opposite its own picture, so every line has to be drawn.
  for (let attempt = 0; attempt < 20 && words.some((w, i) => w === pictures[i].word); attempt++) words = r.shuffle(words);
  return { pictures, words };
}
