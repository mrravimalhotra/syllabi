// Place value and face value for two-digit numbers, made by code from a seed (no AI: every answer is known for
// certain). Face value is the digit itself; place value is what the digit is worth where it sits (the 4 in 47 is
// worth 40). Used by the tutorial and the game.

import { seeded } from "@/lib/practice/random";

export const PLACE_MAX = [20, 50, 99] as const;
type PlaceMax = (typeof PLACE_MAX)[number];

export interface PlaceSettings {
  /** The biggest number asked about (the smallest is 11). */
  max: PlaceMax;
  questions: 5 | 10;
}

export const DEFAULT_PLACE: PlaceSettings = { max: 50, questions: 5 };

type PlaceKind = "face" | "place" | "build" | "which";
type Column = "tens" | "ones";

export interface PlaceQuestion {
  kind: PlaceKind;
  number: number;
  /** For "face" and "place": the digit asked about, and the column it sits in. For "which": the column asked about. */
  column: Column;
  /** The right answer, as the text of the button. */
  answer: string;
  /** Three choices, shuffled, one of them the answer. */
  choices: string[];
}

export const tensOf = (n: number) => Math.floor(n / 10);
export const onesOf = (n: number) => n % 10;
const digitIn = (n: number, column: Column) => (column === "tens" ? tensOf(n) : onesOf(n));
/** What a digit is worth in its column. */
export const placeValue = (digit: number, column: Column) => (column === "tens" ? digit * 10 : digit);

/** The sentences of the tutorial for one number: what is said, and which column to light up. */
export interface TutorialStep {
  say: string;
  light: Column | "both" | "none";
}

export function tutorialSteps(n: number): TutorialStep[] {
  const t = tensOf(n);
  const o = onesOf(n);
  const tensWord = t === 1 ? "ten" : "tens";
  const onesWord = o === 1 ? "one" : "ones";
  return [
    { say: `Look at the number ${n}. It is made of ${t} ${tensWord} and ${o} ${onesWord}.`, light: "none" },
    { say: `Face value is the digit itself, just as you see it. Place value is what the digit is worth because of where it sits.`, light: "none" },
    { say: `The ${t} sits in the tens place. Its face value is ${t}. Its place value is ${t * 10}, because ${t} tens make ${t * 10}.`, light: "tens" },
    o === 0
      ? { say: `The 0 sits in the ones place. Its face value is 0, and its place value is 0 too: there are no ones.`, light: "ones" }
      : { say: `The ${o} sits in the ones place. Its face value is ${o}. Its place value is ${o}, because ${o} ${onesWord} make ${o}.`, light: "ones" },
    { say: `Put the place values together: ${t * 10} plus ${o} makes ${n}.`, light: "both" },
  ];
}

/** The number a lesson teaches with: two different digits, and no zero, so each digit can be pointed at. */
export function tutorialNumber(seed: number): number {
  const r = seeded(seed);
  const candidates = Array.from({ length: 87 }, (_, i) => i + 12).filter((n) => tensOf(n) !== onesOf(n) && onesOf(n) !== 0);
  return r.pick(candidates);
}

export function makePlaceQuiz(settings: PlaceSettings, seed: number): PlaceQuestion[] {
  const r = seeded(seed);
  const kinds: PlaceKind[] = ["face", "place", "build", "which"];
  const quiz: PlaceQuestion[] = [];
  let last = 0;
  for (let i = 0; i < settings.questions; i++) {
    const kind = kinds[(i + r.int(0, 3)) % kinds.length];
    let n = r.int(11, settings.max);
    // Numbers with two equal digits (44) cannot say which 4 is meant; a number ending in 0 has a boring ones digit.
    for (let tries = 0; tries < 20 && (n === last || tensOf(n) === onesOf(n) || onesOf(n) === 0); tries++) n = r.int(11, settings.max);
    if (tensOf(n) === onesOf(n) || onesOf(n) === 0) n = settings.max === 20 ? 13 : 47;
    last = n;
    quiz.push(makeQuestion(kind, n, r));
  }
  return quiz;
}

function makeQuestion(kind: PlaceKind, n: number, r: ReturnType<typeof seeded>): PlaceQuestion {
  const column: Column = r.next() < 0.5 ? "tens" : "ones";
  const t = tensOf(n);
  const o = onesOf(n);
  const digit = digitIn(n, column);
  if (kind === "face") return choose(kind, n, column, String(digit), [String(placeValue(digit, column) === digit ? digit * 10 : placeValue(digit, column)), String(column === "tens" ? o : t)], r);
  if (kind === "place") {
    const trap = column === "tens" ? digit : digit * 10;
    return choose(kind, n, column, String(placeValue(digit, column)), [String(trap), String(column === "tens" ? o * 10 : t)], r);
  }
  if (kind === "which") {
    return choose(kind, n, column, String(digit), [String(column === "tens" ? o : t), String(r.pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== t && d !== o)))], r);
  }
  // build: the blocks show the number; the trap is the digits swapped.
  return choose(kind, n, column, String(n), [String(o * 10 + t), String(t * 10 + r.pick([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== o)))], r);
}

/** The answer and two wrong choices (the first is the tempting mistake), made distinct, in a shuffled order. */
function choose(kind: PlaceKind, number: number, column: Column, answer: string, wrong: string[], r: ReturnType<typeof seeded>): PlaceQuestion {
  const options = [answer];
  for (const w of wrong) if (!options.includes(w)) options.push(w);
  for (let extra = 1; options.length < 3; extra++) {
    const w = String(Number(answer) + extra * (Number(answer) >= 10 ? 10 : 1));
    if (!options.includes(w)) options.push(w);
  }
  return { kind, number, column, answer, choices: r.shuffle(options.slice(0, 3)) };
}

/** The sentence spoken for a question. */
export function placeSpeech(q: PlaceQuestion): string {
  const digit = digitIn(q.number, q.column);
  switch (q.kind) {
    case "face":
      return `What is the face value of ${digit} in ${q.number}?`;
    case "place":
      return `What is the place value of ${digit} in ${q.number}?`;
    case "which":
      return `Which digit is in the ${q.column} place of ${q.number}?`;
    case "build":
      return `How many tens and ones are here? Tap the number.`;
  }
}
