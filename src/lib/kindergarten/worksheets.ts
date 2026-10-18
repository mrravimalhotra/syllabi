// Printable kindergarten worksheets, made from a seed like the quizzes:
// "Complete each word family" and "Match the picture to the CVC words".

import { seeded } from "@/lib/practice/random";
import { BOARD_WORDS, CVC_WORDS, VOWELS, type Vowel } from "@/lib/kindergarten/words";

export const SHEET_KINDS = ["family", "match", "board"] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];
export const SHEET_LABELS: Record<SheetKind, string> = {
  family: "Complete each word family",
  match: "Match the picture to the word",
  board: "Hop to the pond (board game)",
};

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

export type BoardCell = { kind: "start" } | { kind: "pond" } | { kind: "pad" } | { kind: "word"; word: string };

export const BOARD_COLUMNS = 6;
export const BOARD_ROWS = 7;
/** How many spaces a player goes back when they land on a lily pad. */
export const PAD_PENALTY = 2;

/**
 * A path board game for reading CVC words: roll a die, move along the path,
 * read the word you land on (right: move ahead 1; stuck: stay), and a lily
 * pad sends you back. Cells are in path order, start first, pond last.
 */
export function makeBoardGame(seed: number, vowels: readonly Vowel[] = VOWELS): BoardCell[] {
  const r = seeded(seed);
  const total = BOARD_COLUMNS * BOARD_ROWS;
  const pool = r.shuffle(vowels.flatMap((v) => BOARD_WORDS[v]));
  const cells: BoardCell[] = [];
  // Lily pads: some way along the path, never next to each other.
  const pads = new Set<number>();
  for (let tries = 0; pads.size < 6 && tries < 200; tries++) {
    const i = r.int(4, total - 4);
    if (!pads.has(i - 1) && !pads.has(i) && !pads.has(i + 1)) pads.add(i);
  }
  let next = 0;
  for (let i = 0; i < total; i++) {
    if (i === 0) cells.push({ kind: "start" });
    else if (i === total - 1) cells.push({ kind: "pond" });
    else if (pads.has(i)) cells.push({ kind: "pad" });
    else cells.push({ kind: "word", word: pool[next++ % pool.length] });
  }
  return cells;
}

/** The word-family sheet the school sent home: -at cat, -an man, -ig pig, -op top, -un sun, -et pet, -en hen, -it sit, -ot pot, -ub cub. */
export function schoolFamilySheet(): FamilyRow[] {
  return ["cat", "man", "pig", "top", "sun", "pet", "hen", "sit", "pot", "cub"].map((example) => {
    const vowel = VOWELS.find((v) => example[1] === v)!;
    return { rime: rime(example), example, vowel };
  });
}

/** The matching sheet the school sent home: ten pictures, with the words in the school's order on the right. */
export function schoolMatchSheet(): MatchSheet {
  const pictureOrder = ["cat", "dog", "cap", "bat", "sun", "pig", "pen", "bed", "bug", "pot"];
  const emojiOf = new Map(ALL.map((w) => [w.word, w.emoji]));
  return {
    pictures: pictureOrder.map((word) => ({ emoji: emojiOf.get(word)!, word })),
    words: ["bat", "sun", "cat", "pot", "bed", "cap", "dog", "pig", "pen", "bug"],
  };
}
