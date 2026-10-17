// "Put the numbers in order": whole numbers, decimals and fractions. Besides
// plain random sets, questions are built around the mistakes children make:
// thinking a longer decimal is bigger (3.142 vs 3.7), numbers with the same
// digits in a different order (4,507 vs 4,075), and fractions with the same
// top or the same bottom (2/7 vs 2/5). A wrong answer is explained with the
// numbers lined up by place, or brought to a common denominator.

import { compare, decimal, fraction, gcd, groupDigits, lcm, whole, type NumberKind, type PracticeNumber } from "@/lib/practice/numbers";
import { seeded, type Random } from "@/lib/practice/random";

export interface OrderSettings {
  kind: NumberKind;
  /** Whole numbers: how many digits (1–7). Decimals: digits before the point (0–3; 0 gives 0.x). */
  digits: number;
  /** Decimals: digits after the point, from min to max (1–4); mixing lengths is what catches the "longer is bigger" mistake. */
  minPlaces: number;
  maxPlaces: number;
  /** Fractions: the biggest bottom number (4–20). */
  maxDenominator: number;
  /** Fractions: include ones bigger than 1, and write them as mixed numbers (1 3/4) or not (7/4). */
  improper: boolean;
  mixed: boolean;
  /** Whole numbers and decimals: the biggest gap between the smallest and largest whole part; null for any. */
  spread: number | null;
  /** Numbers in each question. */
  size: number;
  /** Questions in the quiz. */
  questions: number;
}

export interface OrderQuestion {
  /** As shown to the child (shuffled). */
  numbers: PracticeNumber[];
  ascending: boolean;
  /** The correct order. */
  answer: PracticeNumber[];
}

export const KIND_LABELS: Record<NumberKind, string> = { whole: "Whole numbers", decimal: "Decimals", fraction: "Fractions" };

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
};

/** Settings read from anywhere (a URL, a saved session) made safe to use. */
export function normaliseSettings(raw: unknown): OrderSettings {
  const r = (raw ?? {}) as Partial<Record<keyof OrderSettings, unknown>>;
  const kind: NumberKind = r.kind === "decimal" || r.kind === "fraction" ? r.kind : "whole";
  const minPlaces = clamp(r.minPlaces, 1, 4, 1);
  const improper = r.improper === true;
  return {
    kind,
    digits: kind === "decimal" ? clamp(r.digits, 0, 3, 1) : clamp(r.digits, 1, 7, 3),
    minPlaces,
    maxPlaces: clamp(r.maxPlaces, minPlaces, 4, Math.max(minPlaces, 2)),
    maxDenominator: clamp(r.maxDenominator, 4, 20, 12),
    improper,
    mixed: improper && r.mixed === true,
    spread: r.spread === null || r.spread === undefined || r.spread === "" ? null : clamp(r.spread, 0, 999_999, 0),
    size: clamp(r.size, 4, 6, 5),
    questions: clamp(r.questions, 1, 20, 10),
  };
}

/** Sensible settings for the child's class (from the Account page), for each kind of number. */
export function presetFor(kind: NumberKind, classLevel: string | null | undefined): OrderSettings {
  const grade = Number(/\d+/.exec(classLevel ?? "")?.[0]) || null;
  const base = { kind, spread: null, size: 5, questions: 10, improper: false, mixed: false, minPlaces: 1, maxPlaces: 2, maxDenominator: 12 };
  if (kind === "whole") {
    const digits = grade ? Math.min(7, Math.max(2, grade + 1)) : 4;
    return { ...base, digits };
  }
  if (kind === "decimal") {
    const maxPlaces = grade === null ? 2 : grade <= 4 ? 1 : grade === 5 ? 2 : 3;
    return { ...base, digits: 1, maxPlaces };
  }
  const maxDenominator = grade === null ? 12 : grade <= 3 ? 8 : grade === 4 ? 10 : grade === 5 ? 12 : 15;
  return { ...base, digits: 1, maxDenominator };
}

export type SampleResult = { settings: Partial<OrderSettings> } | { error: string };

/** "456", "3.14", "0.5", "3/7", "7/4" or "1 3/4": settings for numbers like it. */
export function parseSample(textIn: string): SampleResult | null {
  const text = textIn.trim();
  if (!text) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(text))) {
    const bottom = Number(m[3]);
    if (bottom < 2 || Number(m[2]) === 0) return { error: "Check the fraction: for example 1 3/4." };
    return { settings: { kind: "fraction", improper: true, mixed: true, maxDenominator: Math.min(20, Math.max(5, bottom) + 2) } };
  }
  if ((m = /^(\d+)\s*\/\s*(\d+)$/.exec(text))) {
    const [top, bottom] = [Number(m[1]), Number(m[2])];
    if (bottom < 2 || top === 0) return { error: "Check the fraction: for example 3/7." };
    return { settings: { kind: "fraction", improper: top > bottom, mixed: false, maxDenominator: Math.min(20, Math.max(5, bottom) + 2) } };
  }
  if ((m = /^(\d[\d,]*)?\.(\d+)$/.exec(text))) {
    const intDigits = (m[1] ?? "").replace(/,/g, "").replace(/^0+/, "").length;
    const places = m[2].length;
    if (intDigits > 3) return { error: "Decimals can have up to 3 digits before the point." };
    if (places > 4) return { error: "Decimals can have up to 4 digits after the point." };
    return { settings: { kind: "decimal", digits: intDigits, minPlaces: Math.max(1, places - 1), maxPlaces: Math.min(4, places + 1) } };
  }
  if (/^\d[\d,]*$/.test(text)) {
    const digits = text.replace(/,/g, "").replace(/^0+(?=\d)/, "").length;
    if (digits > 7) return { error: "Whole numbers can have up to 7 digits (ten lakhs)." };
    return { settings: { kind: "whole", digits } };
  }
  return { error: "Type a number like 456, 3.14, 3/7 or 1 3/4." };
}

/** Why these settings can't make a quiz, or null when they can. */
export function settingsProblem(s: OrderSettings): string | null {
  if (s.kind === "whole") {
    const lo = s.digits === 1 ? 1 : 10 ** (s.digits - 1);
    const range = 10 ** s.digits - 1 - lo + 1;
    if (range < s.size) return `There aren't ${s.size} different ${s.digits}-digit numbers.`;
    if (s.spread !== null && s.spread < s.size - 1) return `A spread of ${s.spread} is too small for ${s.size} different numbers. Use at least ${s.size - 1}.`;
  }
  return null;
}

/** One line describing the numbers, e.g. "4-digit whole numbers". */
export function describe(s: OrderSettings): string {
  const spread = s.spread !== null && s.kind !== "fraction" ? `, at most ${groupDigits(String(s.spread))} apart` : "";
  if (s.kind === "whole") return `${s.digits}-digit whole numbers${spread}`;
  if (s.kind === "decimal") {
    const after = `${s.minPlaces === s.maxPlaces ? s.minPlaces : `${s.minPlaces}–${s.maxPlaces}`} after the point`;
    if (s.digits === 0) return `Decimals less than 1, with ${after}`;
    return `Decimals: ${s.digits} digit${s.digits === 1 ? "" : "s"} before the point, ${after}${spread}`;
  }
  return `Fractions with bottom numbers up to ${s.maxDenominator}${s.improper ? (s.mixed ? ", including mixed numbers" : ", including ones bigger than 1") : ""}`;
}

// ---------------------------------------------------------------------------
// Making questions

const ATTEMPTS = 400;

/** Collects `size` numbers of different value from `make`; null if it can't. */
function distinct(size: number, make: () => PracticeNumber | null): PracticeNumber[] | null {
  const out: PracticeNumber[] = [];
  for (let i = 0; i < ATTEMPTS && out.length < size; i++) {
    const n = make();
    if (n && !out.some((x) => compare(x, n) === 0)) out.push(n);
  }
  return out.length === size ? out : null;
}

function wholeRange(digits: number) {
  return { lo: digits === 1 ? 1 : 10 ** (digits - 1), hi: 10 ** digits - 1 };
}

/** A window of width `spread` inside [lo, hi], or the whole range. */
function spreadWindow(r: Random, lo: number, hi: number, spread: number | null) {
  if (spread === null || spread >= hi - lo) return { lo, hi };
  const start = r.int(lo, hi - spread);
  return { lo: start, hi: start + spread };
}

function wholeSet(r: Random, s: OrderSettings): PracticeNumber[] | null {
  const { lo, hi } = wholeRange(s.digits);
  const plain = () => {
    const w = spreadWindow(r, lo, hi, s.spread);
    return distinct(s.size, () => whole(r.int(w.lo, w.hi)));
  };
  if (s.spread !== null || s.digits < 3) return plain();
  const pattern = r.pick(["random", "sameDigits", "sameStart"] as const);
  if (pattern === "sameDigits") {
    // The same digits in different orders: only place value tells them apart.
    const digits = r.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, s.digits);
    const set = distinct(s.size, () => {
      const order = r.shuffle(digits);
      return order[0] === 0 ? null : whole(Number(order.join("")));
    });
    if (set) return set;
  }
  if (pattern === "sameStart") {
    // Same leading digits, different further on.
    const keep = Math.ceil(s.digits / 2);
    const start = String(r.int(lo, hi)).slice(0, keep);
    const set = distinct(s.size, () => {
      let rest = "";
      for (let i = keep; i < s.digits; i++) rest += r.int(0, 9);
      return whole(Number(start + rest));
    });
    if (set) return set;
  }
  return plain();
}

/** Digits after the point, `places` long, ending in a non-zero digit (so 3.10 is never written). */
function fractionDigits(r: Random, places: number, leadingZero: boolean): string {
  let digits = "";
  for (let i = 0; i < places - 1; i++) digits += i === 0 && leadingZero ? "0" : r.int(0, 9);
  return digits + r.int(1, 9);
}

function decimalSet(r: Random, s: OrderSettings): PracticeNumber[] | null {
  const lo = s.digits === 0 ? 0 : s.digits === 1 ? 1 : 10 ** (s.digits - 1);
  const hi = s.digits === 0 ? 0 : 10 ** s.digits - 1;
  const places = () => r.int(s.minPlaces, s.maxPlaces);
  // A chosen spread means different whole parts within it; otherwise mostly the "longer is bigger" trap.
  const pattern = lo === hi ? "sameWhole" : s.spread !== null ? "random" : r.pick(["random", "sameWhole", "sameWhole"] as const);
  if (pattern === "sameWhole") {
    // One whole part, decimal parts of different lengths: 3.7, 3.142, 3.07...
    const w = spreadWindow(r, lo, hi, s.spread);
    const intPart = r.int(w.lo, w.hi);
    const set = distinct(s.size, () => {
      const p = places();
      return decimal(intPart, fractionDigits(r, p, p > 1 && r.next() < 0.35));
    });
    if (set) return set;
  }
  const w = spreadWindow(r, lo, hi, s.spread);
  return distinct(s.size, () => decimal(r.int(w.lo, w.hi), fractionDigits(r, places(), false)));
}

function fractionSet(r: Random, s: OrderSettings): PracticeNumber[] | null {
  const D = s.maxDenominator;
  const topLimit = (bottom: number) => (s.improper ? 2 * bottom - 1 : bottom - 1);
  const make = (top: number, bottom: number) => (top % bottom === 0 ? null : fraction(top, bottom, s.mixed));
  const pattern = r.pick(["random", "random", "sameBottom", "sameTop"] as const);
  if (pattern === "sameBottom") {
    // Same bottom: compare the tops.
    const bottom = r.int(Math.min(D, s.size + 2), D);
    const set = distinct(s.size, () => make(r.int(1, topLimit(bottom)), bottom));
    if (set) return set;
  }
  if (pattern === "sameTop") {
    // Same top: the bigger the bottom, the smaller the pieces.
    const top = r.int(1, Math.max(1, Math.min(5, D - s.size - 1)));
    const set = distinct(s.size, () => {
      const bottom = r.int(2, D);
      return bottom === top || (!s.improper && bottom < top) ? null : make(top, bottom);
    });
    if (set) return set;
  }
  return distinct(s.size, () => {
    const bottom = r.int(2, D);
    const top = r.int(1, topLimit(bottom));
    const g = gcd(top, bottom);
    return make(top / g, bottom / g);
  });
}

/** The quiz for these settings and seed: the same seed always gives the same questions. */
export function makeQuiz(settings: OrderSettings, seed: number): OrderQuestion[] {
  const r = seeded(seed);
  const make = settings.kind === "whole" ? wholeSet : settings.kind === "decimal" ? decimalSet : fractionSet;
  const quiz: OrderQuestion[] = [];
  for (let i = 0; i < settings.questions; i++) {
    const numbers = make(r, settings);
    if (!numbers) break;
    const ascending = r.next() < 0.5;
    const answer = [...numbers].sort((a, b) => (ascending ? compare(a, b) : compare(b, a)));
    quiz.push({ numbers: r.shuffle(numbers), ascending, answer });
  }
  return quiz;
}

/** For each place in the child's order: is it the right number? */
export function markOrder(q: OrderQuestion, picked: PracticeNumber[]): boolean[] {
  return q.answer.map((n, i) => picked[i] !== undefined && compare(n, picked[i]) === 0);
}

// ---------------------------------------------------------------------------
// Explaining the order

const PLACE_NAMES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "lakhs", "ten lakhs"];
const PLACE_SHORT = ["O", "T", "H", "Th", "TTh", "L", "TL"];
const DECIMAL_NAMES = ["tenths", "hundredths", "thousandths", "ten-thousandths"];
const DECIMAL_SHORT = ["1/10", "1/100", "1/1000", "1/10000"];

export interface PlaceGrid {
  /** Column headings (O, T, H... and 1/10, 1/100...). */
  headings: string[];
  /** Index of the first column after the decimal point, if any. */
  pointBefore: number | null;
  /** One row per number in the correct order; "" for an empty place. */
  rows: { text: string; cells: string[]; added: boolean[] }[];
}

export interface FractionRow {
  text: string;
  /** The same fraction over the common denominator. */
  top: number;
  bottom: number;
}

export interface Explanation {
  /** The rule in one sentence. */
  rule: string;
  grid?: PlaceGrid;
  /** Fractions over one common denominator, when it stays small enough to read. */
  common?: { denominator: number; rows: FractionRow[] };
  /** Why each neighbour in the answer comes before the next. */
  steps: { relation: string; reason: string }[];
}

function digitsOf(n: PracticeNumber): { int: string; frac: string } {
  const [int, frac = ""] = n.text.replace(/,/g, "").split(".");
  return { int, frac };
}

function placeGrid(answer: PracticeNumber[]): PlaceGrid {
  const parts = answer.map(digitsOf);
  const intLen = Math.max(...parts.map((p) => p.int.length));
  const fracLen = Math.max(...parts.map((p) => p.frac.length));
  const headings = [
    ...Array.from({ length: intLen }, (_, i) => PLACE_SHORT[intLen - 1 - i] ?? ""),
    ...DECIMAL_SHORT.slice(0, fracLen),
  ];
  return {
    headings,
    pointBefore: fracLen ? intLen : null,
    rows: answer.map((n, k) => {
      const { int, frac } = parts[k];
      const intCells = int.padStart(intLen, " ").split("").map((c) => (c === " " ? "" : c));
      const fracCells = frac.padEnd(fracLen, "0").split("");
      return {
        text: n.text,
        cells: [...intCells, ...fracCells],
        added: [...intCells.map(() => false), ...fracCells.map((_, i) => i >= frac.length)],
      };
    }),
  };
}

/** "3 is less than 7" for an ascending question, "7 is greater than 3" for a descending one. */
function relate(small: string | number, big: string | number, ascending: boolean): string {
  return ascending ? `${small} is less than ${big}` : `${big} is greater than ${small}`;
}

/** Why `small` < `big`, worded in the direction of the question. */
function placeReason(small: PracticeNumber, big: PracticeNumber, ascending: boolean): string {
  const [ps, pb] = [digitsOf(small), digitsOf(big)];
  if (small.kind === "whole" && ps.int.length !== pb.int.length) {
    return `${big.text} has ${pb.int.length} digits and ${small.text} has ${ps.int.length}. More digits means a bigger number.`;
  }
  if (ps.int !== pb.int) {
    if (small.kind === "decimal") return `Compare the whole number parts first: ${relate(groupDigits(ps.int), groupDigits(pb.int), ascending)}.`;
    const i = [...ps.int].findIndex((d, k) => d !== pb.int[k]);
    const same = i > 0 ? "The digits on the left are the same. " : "";
    return `${same}In the ${PLACE_NAMES[ps.int.length - 1 - i]} place, ${relate(ps.int[i], pb.int[i], ascending)}.`;
  }
  const len = Math.max(ps.frac.length, pb.frac.length);
  const [fs, fb] = [ps.frac.padEnd(len, "0"), pb.frac.padEnd(len, "0")];
  const i = [...fs].findIndex((d, k) => d !== fb[k]);
  const longer = ps.frac.length > pb.frac.length ? ` ${small.text} has more digits, but that doesn't make it bigger.` : "";
  return `The whole number parts are the same (${groupDigits(ps.int)}). In the ${DECIMAL_NAMES[i]} place, ${relate(fs[i], fb[i], ascending)}.${longer}`;
}

/** Why `small` < `big` for fractions and mixed numbers, worded in the direction of the question. */
function fractionReason(small: PracticeNumber, big: PracticeNumber, common: number | null, ascending: boolean): string {
  const [fs, fb] = [small.fraction!, big.fraction!];
  const [ws, wb] = [fs.whole ?? 0, fb.whole ?? 0];
  if (ws !== wb) {
    if (ws === 0) return `${small.text} is less than 1, and ${big.text} is more than 1.`;
    return `Compare the whole numbers first: ${relate(ws, wb, ascending)}.`;
  }
  // Whole parts equal (or none): compare what is left as fractions.
  const [ts, bs, tb, bb] = [Number(small.num) - ws * fs.bottom, fs.bottom, Number(big.num) - wb * fb.bottom, fb.bottom];
  if (bs === bb) return `Same bottom number (${bs}), so compare the tops: ${relate(ts, tb, ascending)}.`;
  if (ts === tb) return `Same top number (${ts}): a bigger bottom number means smaller pieces, so ${relate(`${ts}/${bs}`, `${tb}/${bb}`, ascending)}.`;
  if (common) {
    const [cs, cb] = [(ts * common) / bs, (tb * common) / bb];
    return `Over ${common}: ${ts}/${bs} = ${cs}/${common} and ${tb}/${bb} = ${cb}/${common}, and ${relate(cs, cb, ascending)}.`;
  }
  return `Cross-multiply: ${ts} × ${bb} = ${ts * bb} and ${tb} × ${bs} = ${tb * bs}, and ${relate(ts * bb, tb * bs, ascending)}.`;
}

/** Biggest common denominator still easy to read. */
const MAX_COMMON = 360;

export function explain(q: OrderQuestion): Explanation {
  const steps: Explanation["steps"] = [];
  const kind = q.answer[0].kind;
  let common: Explanation["common"];
  let rule: string;
  let grid: PlaceGrid | undefined;

  if (kind === "fraction") {
    const bottoms = q.answer.map((n) => Number(n.den));
    const L = bottoms.reduce(lcm);
    const allSameBottom = q.answer.every((n) => n.fraction!.bottom === q.answer[0].fraction!.bottom);
    if (!allSameBottom && L <= MAX_COMMON) {
      common = { denominator: L, rows: q.answer.map((n) => ({ text: n.text, top: (Number(n.num) * L) / Number(n.den), bottom: L })) };
    }
    rule = allSameBottom
      ? "When the bottom numbers are the same, compare the top numbers."
      : common
        ? `Write every fraction with the same bottom number (${L}, the LCM of the bottoms), then compare the tops.`
        : "Compare two fractions by cross-multiplying: top of one × bottom of the other.";
  } else {
    grid = placeGrid(q.answer);
    rule =
      kind === "decimal"
        ? "Line up the decimal points and fill empty places with zeros. Then compare from the left, place by place."
        : "More digits means a bigger number. With the same number of digits, compare from the left, place by place.";
  }

  for (let i = 0; i < q.answer.length - 1; i++) {
    const [x, y] = [q.answer[i], q.answer[i + 1]];
    const [small, big] = q.ascending ? [x, y] : [y, x];
    const reason = kind === "fraction" ? fractionReason(small, big, common ? common.denominator : null, q.ascending) : placeReason(small, big, q.ascending);
    steps.push({ relation: `${x.text} ${q.ascending ? "<" : ">"} ${y.text}`, reason });
  }
  return { rule, grid, common, steps };
}

// ---------------------------------------------------------------------------
// Printing

const directions = (ascending: boolean) => (ascending ? "Smallest to biggest" : "Biggest to smallest");

/** The quiz as a worksheet (Markdown), with the answer key after a page break. */
export function worksheetMarkdown(settings: OrderSettings, quiz: OrderQuestion[]): string {
  // One list item per question (items never split across pages), with a line below to write on.
  // Non-breaking spaces keep a mixed number (1 3/4) on one line.
  const written = (n: PracticeNumber) => n.text.replace(/ /g, "\u00a0");
  const questions = quiz.map(
    (q, i) => `${i + 1}. ${directions(q.ascending)}:   ${q.numbers.map(written).join("   ·   ")}\u2028${"_".repeat(56)}`
  );
  const answers = quiz.map((q, i) => `${i + 1}. ${q.answer.map(written).join(q.ascending ? "  <  " : "  >  ")}`);
  return [
    `${describe(settings)}. Write the numbers in the order asked, using < (is less than) or > (is greater than) between them.`,
    questions.join("\n"),
    "## Answer Key",
    answers.join("\n"),
  ].join("\n\n");
}
