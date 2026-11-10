// Checks a line of algebra working by code: every expression written after an "=" must equal the expression the
// working started from ("(9x - 4y)² = 81x² - 72xy + 16y²"). Two expressions are compared by putting the same numbers
// in for their letters at several points; different values anywhere mean they are not equal ("9x² - 72xy + 4y²" is
// not (9x - 4y)²). A general identity written along the way ("(a - b)² = a² - 2ab + b²") is checked on its own.
// Equations being solved ("2x + 3 = 7, 2x = 4") are not expressions that stay equal, so such a line is left alone, as
// is anything that isn't plainly algebra (words, functions, unbalanced brackets).

import { parse } from "mathjs";

interface Expression {
  /** As written, for messages. */
  shown: string;
  /** The letters in it, sorted ("xy"). */
  letters: string;
  value: (scope: Record<string, number>) => number;
}

const SUPERSCRIPTS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
// The values put in for the letters: not 0, 1 or simple fractions, so a wrong expression can't match by chance.
const POINTS = [
  [1.37, 2.71, 0.83],
  [-2.13, 0.57, 3.19],
  [3.71, -1.29, 1.61],
  [0.61, 4.07, -2.43],
];
// Words before a step ("So", "we know that", "=>").
const LEAD_IN = /^(?:\s*(?:(?:so|hence|therefore|thus|now|we know that|we know|using|by|identity)\b|=>|⇒|∴)[\s:,]*)+/i;

/** Plain-ASCII algebra with every multiplication written out, or null when this isn't plainly algebra. */
function toAscii(text: string): string | null {
  let s = text
    .replace(/\*\*|`/g, "")
    .replace(/[−–]/g, "-")
    .replace(/[×✕·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => `^${[...m].map((c) => SUPERSCRIPTS[c]).join("")}`)
    .replace(/(\d),(?=\d{3})/g, "$1")
    .trim();
  if (!s || /[^0-9a-zA-Z+\-*/^().\s]/.test(s) || /[a-zA-Z]{3,}/.test(s)) return null;
  // Every multiplication written out: 2(9x)(4y) → 2*(9*x)*(4*y), 72xy → 72*x*y, p^2q^2 → p^2*q^2.
  s = s.replace(/\s+/g, " ");
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/([0-9a-zA-Z)])\s*(?=[a-zA-Z(])/g, "$1*")
      .replace(/\)\s*(?=\d)/g, ")*");
  }
  s = s.replace(/\s+/g, "");
  return s;
}

function expression(text: string, numbersToo = false): Expression | null {
  const ascii = toAscii(text);
  if (!ascii || (!numbersToo && !/[a-zA-Z]/.test(ascii))) return null;
  try {
    const compiled = parse(ascii).compile();
    const letters = [...new Set(ascii.match(/[a-zA-Z]/g) ?? [])].sort().join("");
    return {
      shown: text.trim(),
      letters,
      value: (scope) => {
        const v: unknown = compiled.evaluate(scope);
        return typeof v === "number" ? v : NaN;
      },
    };
  } catch {
    return null;
  }
}

/** Whether two expressions in the same letters are equal at every test point (null when it can't be told). */
function equal(a: Expression, b: Expression): boolean | null {
  let compared = 0;
  for (const point of POINTS) {
    const scope = Object.fromEntries([...a.letters].map((l, i) => [l, point[i % point.length] + i * 0.11]));
    const x = a.value(scope);
    const y = b.value(scope);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    compared++;
    if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
  }
  return compared >= 2 ? true : null;
}

/**
 * The steps of one line of working that are not equal to what they follow from, as "wrong step = what it should equal"
 * pairs. Empty when every step is right or the line is not plainly algebra.
 */
export function wrongAlgebraSteps(line: string): { step: string; shouldEqual: string }[] {
  // Each comma-separated piece is a step; one starting with "=" continues the working before it.
  const runs: Expression[][] = [];
  for (const raw of line.split(/,\s+/)) {
    const piece = raw.trim().replace(LEAD_IN, "").trim();
    if (!piece) continue;
    const continues = piece.startsWith("=");
    const parts = (continues ? piece.slice(1) : piece).split("=").map((p) => p.trim()).filter(Boolean);
    // "2x = 4", "x = 2": an equation is being solved, so its sides were never meant to stay equal.
    if (parts.length > 1 && parts.some((p) => /[a-zA-Z]/.test(p)) && parts.some((p) => /^[-\d.\s()/]+$/.test(p))) return [];
    const exprs = parts.map((p) => expression(p));
    // Words or something unreadable: this piece is not checked, and the working after it starts afresh.
    if (exprs.some((e) => e === null)) {
      runs.push([]);
      continue;
    }
    if (continues && runs.length > 0) runs[runs.length - 1].push(...(exprs as Expression[]));
    else runs.push(exprs as Expression[]);
  }
  const all = runs.flat();
  // An equation being solved: two sides with different letters that share some (x + 3 = 2x) or one side with none.
  for (const run of runs) {
    for (let i = 1; i < run.length; i++) {
      const [a, b] = [run[i - 1].letters, run[i].letters];
      const shared = [...a].some((l) => b.includes(l));
      if (a !== b && shared) return [];
    }
  }
  // Each expression must equal the first one written with the same letters (where that working started).
  const first = new Map<string, Expression>();
  const wrong: { step: string; shouldEqual: string }[] = [];
  for (const e of all) {
    const start = first.get(e.letters);
    if (!start) {
      first.set(e.letters, e);
      continue;
    }
    if (equal(start, e) === false) wrong.push({ step: e.shown, shouldEqual: start.shown });
  }
  return wrong;
}

/**
 * Whether a step has the same value as the question it works on ("(50)(50) - (3)(3)" and "53 × 47",
 * "(p²)(p²) - (q²)(q²)" and "(p² + q²)(p² - q²)"): true or false, or null when either isn't plain maths or they use
 * different letters.
 */
export function sameValue(step: string, question: string): boolean | null {
  const a = expression(question, true);
  const b = expression(step, true);
  if (!a || !b || a.letters !== b.letters) return null;
  if (!a.letters) {
    const [x, y] = [a.value({}), b.value({})];
    return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)) : null;
  }
  return equal(a, b);
}
