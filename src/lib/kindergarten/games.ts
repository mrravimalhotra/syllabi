// More kindergarten games, all "look, listen, tap one of three": a missing
// letter, reading words and phrases, counting, number order, number bonds,
// adding and taking away, number names and patterns. Made by code from a seed
// (the same seed always gives the same round), so every answer is certain.

import { seeded, type Random } from "@/lib/practice/random";
import { picturePool, type CvcSettings } from "@/lib/kindergarten/quiz";
import { COUNT_EMOJI, CVC_WORDS, VOWELS } from "@/lib/kindergarten/words";

export type GameId = "missing" | "read" | "count" | "next" | "bonds" | "sums" | "names" | "pattern";
export const GAME_IDS: GameId[] = ["missing", "read", "count", "next", "bonds", "sums", "names", "pattern"];

/** Each game has one choice (its level) and a round size. */
export interface GameSettings {
  level: string;
  questions: number;
}
export type GamesSettings = Record<GameId, GameSettings>;

/** The levels a grown-up can choose for each game, easiest first; the first is the default. */
export const GAME_LEVELS: Record<GameId, { label: string; options: { value: string; label: string }[] }> = {
  missing: {
    label: "Which letter is missing",
    options: [
      { value: "middle", label: "The vowel: c _ t" },
      { value: "ends", label: "First or last: _ a t, c a _" },
      { value: "any", label: "Any letter" },
    ],
  },
  read: {
    label: "What to read",
    options: [
      { value: "words", label: "Words: pig" },
      { value: "phrases", label: "Phrases: a cat in a hat" },
    ],
  },
  count: { label: "How many things", options: ["5", "10", "20"].map((n) => ({ value: n, label: `Up to ${n}` })) },
  next: { label: "Numbers up to", options: ["10", "20", "50", "100"].map((n) => ({ value: n, label: `Up to ${n}` })) },
  bonds: {
    label: "Make which number",
    options: [
      { value: "5", label: "Make 5" },
      { value: "10", label: "Make 10" },
    ],
  },
  sums: {
    label: "Which sums",
    options: [
      { value: "add5", label: "Add, up to 5" },
      { value: "add10", label: "Add, up to 10" },
      { value: "take5", label: "Take away, up to 5" },
      { value: "take10", label: "Take away, up to 10" },
      { value: "both10", label: "Both, up to 10" },
    ],
  },
  names: { label: "Numbers up to", options: ["10", "20", "50", "100"].map((n) => ({ value: n, label: `Up to ${n}` })) },
  pattern: {
    label: "Which patterns",
    options: [
      { value: "ab", label: "Easy: 🔴🔵🔴🔵" },
      { value: "all", label: "All kinds: 🔴🔴🔵, 🔴🔵🟡" },
    ],
  },
};

export const DEFAULT_GAMES = Object.fromEntries(GAME_IDS.map((id) => [id, { level: GAME_LEVELS[id].options[0].value, questions: 5 }])) as GamesSettings;

/** What the screen shows above the three choices. */
export type Show =
  | { kind: "missing"; emoji: string; letters: string[]; gap: number }
  | { kind: "read"; text: string }
  | { kind: "count"; emoji: string; count: number }
  | { kind: "next"; numbers: (number | null)[] }
  | { kind: "bonds"; total: number; have: number }
  | { kind: "sum"; emoji: string; a: number; b: number; op: "+" | "−" }
  | { kind: "name"; text: string }
  | { kind: "pattern"; items: string[] };

export interface ChoiceQuestion {
  show: Show;
  /** What is said aloud when the question appears (never the answer itself). */
  speech: string;
  /** Three choices, shuffled; one is the answer. */
  choices: string[];
  answer: string;
  /** How the grown-up's note names this question when it needed another go. */
  label: string;
  /** Said when the child asks for help ("Read it to me"); the question then counts as needing help. */
  help?: string;
}

/** The answer plus two different wrong choices, taken in order from `wrong` (duplicates and the answer skipped), shuffled. */
function threeOf(r: Random, answer: string, wrong: string[]): string[] {
  const others = [...new Set(wrong)].filter((w) => w !== answer).slice(0, 2);
  return r.shuffle([answer, ...others]);
}

/** Two wrong numbers near the answer, inside [low, high], the closest first in a random order. */
function nearNumbers(r: Random, answer: number, low: number, high: number, avoid: number[] = []): string[] {
  const near = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5].map((d) => answer + d).filter((n) => n >= low && n <= high && !avoid.includes(n));
  return [...r.shuffle(near.slice(0, 2)), ...near.slice(2)].map(String);
}

// ---- 4. Missing letter: c _ t ----

const CONSONANTS = "bcdfghjklmnprstvwz".split("");

function missingQuiz(level: string, questions: number, cvc: CvcSettings, r: Random): ChoiceQuestion[] {
  const order = r.shuffle(picturePool(cvc));
  return Array.from({ length: questions }, (_, i) => {
    const { word, emoji } = order[i % order.length];
    const letters = word.split("");
    const gap = level === "middle" ? 1 : level === "ends" ? r.pick([0, 2]) : r.int(0, 2);
    const answer = letters[gap];
    // Vowels are told apart from vowels, consonants from consonants: the child must hear the sound.
    const pool = gap === 1 ? [...VOWELS] : CONSONANTS.filter((c) => !letters.includes(c));
    return {
      show: { kind: "missing", emoji, letters, gap },
      speech: `Which letter is missing? ${word}.`,
      choices: threeOf(r, answer, r.shuffle(pool)),
      answer,
      label: word,
    };
  });
}

// ---- 6. Read and match: read a word or phrase, tap its picture ----

/** Short phrases made of CVC words and the first sight words; each picture is different, and many share a word with another, so both words must be read. */
export const PHRASES: { text: string; emoji: string }[] = [
  { text: "a cat in a hat", emoji: "🐱🎩" },
  { text: "a rat in a hat", emoji: "🐀🎩" },
  { text: "a cat and a rat", emoji: "🐱🐀" },
  { text: "a cat and a dog", emoji: "🐱🐶" },
  { text: "a dog in bed", emoji: "🐶🛏️" },
  { text: "a pig in bed", emoji: "🐷🛏️" },
  { text: "a hen and a pig", emoji: "🐔🐷" },
  { text: "a fox and a hen", emoji: "🦊🐔" },
  { text: "a fox in a box", emoji: "🦊📦" },
  { text: "a box and a bag", emoji: "📦👜" },
  { text: "a man in a van", emoji: "👨🚐" },
  { text: "a man and a dog", emoji: "👨🐶" },
  { text: "a bus and a van", emoji: "🚌🚐" },
  { text: "a bug in a cup", emoji: "🐛☕" },
  { text: "a bug on a web", emoji: "🐛🕸️" },
  { text: "a nut in a cup", emoji: "🥜☕" },
  { text: "a pen and a cap", emoji: "🖊️🧢" },
  { text: "a cap and a hat", emoji: "🧢🎩" },
  { text: "a dog on a log", emoji: "🐶🪵" },
  { text: "a cub on a log", emoji: "🐻🪵" },
  { text: "a jet and a bus", emoji: "✈️🚌" },
  { text: "the sun is hot", emoji: "☀️🔥" },
  { text: "a pot and a pan", emoji: "🍲🍳" },
  { text: "a cub in a tub", emoji: "🐻🛁" },
];

const wordsOf = (text: string) => text.split(" ").filter((w) => w.length > 2);

function readQuiz(level: string, questions: number, r: Random): ChoiceQuestion[] {
  if (level === "phrases") {
    const order = r.shuffle(PHRASES);
    return Array.from({ length: questions }, (_, i) => {
      const target = order[i % order.length];
      // Wrong pictures share a word with the phrase when they can ("a cat in a hat" against "a rat in a hat").
      const others = r.shuffle(PHRASES.filter((p) => p !== target));
      const sharing = others.filter((p) => wordsOf(p.text).some((w) => wordsOf(target.text).includes(w)));
      return {
        show: { kind: "read", text: target.text },
        speech: "Read it, then find its picture.",
        choices: threeOf(r, target.emoji, [...sharing, ...others].map((p) => p.emoji)),
        answer: target.emoji,
        label: target.text,
        help: target.text,
      };
    });
  }
  const everything = VOWELS.flatMap((v) => CVC_WORDS[v]).filter((w): w is { word: string; emoji: string } => w.emoji !== null);
  const order = r.shuffle(everything);
  return Array.from({ length: questions }, (_, i) => {
    const target = order[i % order.length];
    // Wrong pictures with the same vowel or the same first letter, so the whole word must be read.
    const others = r.shuffle(everything.filter((w) => w.word !== target.word));
    const close = others.filter((w) => w.word[1] === target.word[1] || w.word[0] === target.word[0]);
    return {
      show: { kind: "read", text: target.word },
      speech: "Read the word, then find its picture.",
      choices: threeOf(r, target.emoji, [...close, ...others].map((w) => w.emoji)),
      answer: target.emoji,
      label: target.word,
      help: target.word,
    };
  });
}

// ---- 7. Count and tap ----

/** The name of each counted picture, for "How many apples?". */
const COUNT_NAMES: Record<(typeof COUNT_EMOJI)[number], string> = {
  "🍎": "apples",
  "⭐": "stars",
  "🐟": "fish",
  "🎈": "balloons",
  "🐥": "chicks",
  "🌸": "flowers",
  "🚗": "cars",
  "🍪": "biscuits",
};

function countQuiz(level: string, questions: number, r: Random): ChoiceQuestion[] {
  const max = Number(level);
  return Array.from({ length: questions }, () => {
    const count = r.int(1, max);
    const emoji = r.pick(COUNT_EMOJI);
    return {
      show: { kind: "count", emoji, count },
      speech: `How many ${COUNT_NAMES[emoji]}?`,
      choices: threeOf(r, String(count), nearNumbers(r, count, 1, max)),
      answer: String(count),
      label: `${count} ${COUNT_NAMES[emoji]}`,
    };
  });
}

// ---- 8. What comes next, before or between ----

function nextQuiz(level: string, questions: number, r: Random): ChoiceQuestion[] {
  const max = Number(level);
  return Array.from({ length: questions }, () => {
    const ask = r.pick(["after", "before", "between"] as const);
    const n = r.int(ask === "after" ? 1 : 2, ask === "before" ? max : max - 1);
    const answer = ask === "after" ? n + 1 : ask === "before" ? n - 1 : n;
    const numbers = ask === "after" ? [n, null] : ask === "before" ? [null, n] : [n - 1, null, n + 1];
    const shown = numbers.filter((x): x is number => x !== null);
    const speech =
      ask === "after" ? `What comes after ${n}?` : ask === "before" ? `What comes before ${n}?` : `What comes between ${n - 1} and ${n + 1}?`;
    // Bigger numbers also offer the ten-off slip (49 or 69 for 59).
    const tens = max > 20 ? [answer + 10, answer - 10].filter((x) => x >= 1 && x <= max) : [];
    const wrong = nearNumbers(r, answer, 1, max, shown);
    return {
      show: { kind: "next", numbers },
      speech,
      choices: threeOf(r, String(answer), max > 20 && r.next() < 0.5 ? [wrong[0], ...tens.map(String), ...wrong.slice(1)] : wrong),
      answer: String(answer),
      label: shown.join(", "),
    };
  });
}

// ---- 9. Number bonds: how many more make 5 or 10 ----

function bondsQuiz(level: string, questions: number, r: Random): ChoiceQuestion[] {
  const total = Number(level);
  return Array.from({ length: questions }, () => {
    const have = r.int(1, total - 1);
    const answer = total - have;
    return {
      show: { kind: "bonds", total, have },
      speech: `There ${have === 1 ? "is" : "are"} ${have}. How many more make ${total}?`,
      // The commonest slip is giving the number already there.
      choices: threeOf(r, String(answer), [...(have !== answer ? [String(have)] : []), ...nearNumbers(r, answer, 0, total)]),
      answer: String(answer),
      label: `${have} and ${answer} make ${total}`,
    };
  });
}

// ---- 10. Add and take away with pictures ----

function sumsQuiz(level: string, questions: number, r: Random): ChoiceQuestion[] {
  const max = level.endsWith("10") ? 10 : 5;
  return Array.from({ length: questions }, () => {
    const add = level.startsWith("add") || (level.startsWith("both") && r.next() < 0.5);
    const emoji = r.pick(COUNT_EMOJI);
    const name = COUNT_NAMES[emoji];
    // Adding: both parts at least 1, the total at most `max`. Taking away: leaves at least 1.
    const a = add ? r.int(1, max - 1) : r.int(2, max);
    const b = add ? r.int(1, max - a) : r.int(1, a - 1);
    const answer = add ? a + b : a - b;
    return {
      show: { kind: "sum", emoji, a, b, op: add ? "+" : "−" },
      speech: add ? `${a} ${name} and ${b} more. How many altogether?` : `${a} ${name}. Take away ${b}. How many are left?`,
      choices: threeOf(r, String(answer), nearNumbers(r, answer, 0, max)),
      answer: String(answer),
      label: `${a} ${add ? "+" : "−"} ${b}`,
    };
  });
}

// ---- 11. Number names ----

const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A number from 0 to 100 in words, the way it is written in school: 21 is "twenty-one". */
export function numberName(n: number): string {
  if (n === 100) return "one hundred";
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

/** Numbers easily mixed up with n: 13 and 30, 14 and 40; 6 and 9; 21 and 12. */
function confusable(n: number, max: number): number[] {
  const out: number[] = [];
  if (n >= 13 && n <= 19) out.push((n - 10) * 10);
  if (n >= 30 && n <= 90 && n % 10 === 0) out.push(n / 10 + 10);
  if (n === 6 || n === 9) out.push(15 - n);
  if (n >= 12 && n <= 98 && n % 10 !== 0 && n % 11 !== 0) out.push(Number(String(n).split("").reverse().join("")));
  return out.filter((x) => x >= 1 && x <= max && x !== n);
}

function namesQuiz(level: string, questions: number, r: Random): ChoiceQuestion[] {
  const max = Number(level);
  return Array.from({ length: questions }, () => {
    const n = r.int(1, max);
    const wrong = [...r.shuffle(confusable(n, max)), ...nearNumbers(r, n, 1, max)].map(Number);
    // Half the questions show the number and ask for its name, half the other way round.
    if (r.next() < 0.5)
      return {
        show: { kind: "name", text: String(n) },
        speech: "Tap the name of this number.",
        choices: threeOf(r, numberName(n), wrong.map(numberName)),
        answer: numberName(n),
        label: `${n} (${numberName(n)})`,
      };
    return {
      show: { kind: "name", text: numberName(n) },
      speech: "Which number is this?",
      choices: threeOf(r, String(n), wrong.map(String)),
      answer: String(n),
      label: `${numberName(n)} (${n})`,
      help: numberName(n),
    };
  });
}

// ---- 13. Patterns: what comes next ----

const PATTERN_SETS = [
  ["🔴", "🔵", "🟡", "🟢"],
  ["⭐", "🌙", "☀️", "☁️"],
  ["🍎", "🍌", "🍇", "🍊"],
  ["🐶", "🐱", "🐭", "🐰"],
  ["🟥", "🟦", "🟨", "🟩"],
  ["🚗", "🚌", "🚲", "✈️"],
];
const UNITS: Record<string, number[]> = { ab: [0, 1], aab: [0, 0, 1], abb: [0, 1, 1], abc: [0, 1, 2], aabb: [0, 0, 1, 1] };

function patternQuiz(level: string, questions: number, r: Random): ChoiceQuestion[] {
  return Array.from({ length: questions }, () => {
    const unitName = level === "ab" ? "ab" : r.pick(Object.keys(UNITS));
    const unit = UNITS[unitName];
    const set = r.shuffle(r.pick(PATTERN_SETS));
    // At least two whole repeats, then up to one more part-way, so the gap can fall anywhere in the unit.
    const length = unit.length * 2 + r.int(0, unit.length - 1);
    const items = Array.from({ length }, (_, i) => set[unit[i % unit.length]]);
    const answer = set[unit[length % unit.length]];
    return {
      show: { kind: "pattern", items },
      speech: "What comes next?",
      // The pattern's other pictures first, then one not in it.
      choices: threeOf(r, answer, r.shuffle(set.slice(0, Math.max(...unit) + 1)).concat(set.slice(Math.max(...unit) + 1))),
      answer,
      label: unitName.toUpperCase().split("").join(" "),
    };
  });
}

/** A round of one game, from the grown-up's choices and a seed. Missing letter draws its words from the shared vowel choices. */
export function makeGameQuiz(id: GameId, settings: GameSettings, cvc: CvcSettings, seed: number): ChoiceQuestion[] {
  const r = seeded(seed);
  const { level, questions } = settings;
  switch (id) {
    case "missing":
      return missingQuiz(level, questions, cvc, r);
    case "read":
      return readQuiz(level, questions, r);
    case "count":
      return countQuiz(level, questions, r);
    case "next":
      return nextQuiz(level, questions, r);
    case "bonds":
      return bondsQuiz(level, questions, r);
    case "sums":
      return sumsQuiz(level, questions, r);
    case "names":
      return namesQuiz(level, questions, r);
    case "pattern":
      return patternQuiz(level, questions, r);
  }
}

/** Saved choices are read back from the browser, so each game's is checked before it is trusted. */
export const isGames = (v: unknown): v is GamesSettings => {
  const s = v as GamesSettings;
  return (
    Boolean(s) &&
    GAME_IDS.every((id) => s[id] && GAME_LEVELS[id].options.some((o) => o.value === s[id].level) && (s[id].questions === 5 || s[id].questions === 10))
  );
};
