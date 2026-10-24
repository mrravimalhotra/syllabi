// Checks the calculations written in an answer with an exact maths engine, so
// a wrong sum never reaches the child unnoticed. No AI involved: lines like
// "2² × 3² × 5 = 180", "25% of 80 = 20", "5 km = 5000 m" or "8 : 12 = 2 : 3"
// are parsed and recomputed. Anything that isn't plainly numeric (algebra,
// words, approximations) is left alone rather than guessed at.

import { evaluate, unit } from "mathjs";
import type { AnswerCheck } from "@/types/database";

const MAX_CHECKS = 40;

const NUMBER = String.raw`\d+(?:\.\d+)?`;
// The end of the text before "=" and the start of the text after it, made of
// numbers and operators only.
const EXPRESSION_CHARS = String.raw`[\d.\s+\-*/^()]`;
const TAIL = new RegExp(String.raw`(${EXPRESSION_CHARS}*\d${EXPRESSION_CHARS}*)$`);
const HEAD = new RegExp(String.raw`^(${EXPRESSION_CHARS}*\d${EXPRESSION_CHARS}*)`);
const RATIO_TAIL = new RegExp(String.raw`(${NUMBER})\s*:\s*(${NUMBER})\s*$`);
const RATIO_HEAD = new RegExp(String.raw`^\s*(${NUMBER})\s*:\s*(${NUMBER})(?!\s*[\d:])`);

// Units we convert, as written in Indian school books, mapped to the maths engine's names.
const UNITS: Record<string, string> = {
  km: "km", hm: "hm", dam: "dam", m: "m", dm: "dm", cm: "cm", mm: "mm",
  kg: "kg", g: "g", mg: "mg",
  l: "l", L: "l", ml: "ml", mL: "ml",
  h: "h", hr: "h", hrs: "h", hour: "h", hours: "h",
  min: "min", mins: "min", minute: "min", minutes: "min",
  s: "s", sec: "s", secs: "s", second: "s", seconds: "s",
  "km/h": "km/h", kmph: "km/h", "m/s": "m/s",
};
const UNIT_NAMES = Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace("/", "\\/"))
  .join("|");
const QUANTITY = String.raw`${NUMBER}\s*(?:${UNIT_NAMES})(?![a-zA-Z/])`;
// "2 hours 15 minutes", "3 m 45 cm", "5 km": one or more quantities in a row.
const UNIT_TAIL = new RegExp(String.raw`((?:${QUANTITY}\s*(?:and\s*)?)+)$`);
const UNIT_HEAD = new RegExp(String.raw`^\s*((?:${QUANTITY}\s*(?:and\s*)?)+)`);
const ONE_QUANTITY = new RegExp(String.raw`(${NUMBER})\s*(${UNIT_NAMES})(?![a-zA-Z/])`, "g");

/** A run of quantities ("2 hours 15 minutes") as one value in the last quantity's unit. */
function quantity(text: string): { value: number; unit: string } | null {
  const parts = [...text.matchAll(ONE_QUANTITY)];
  if (parts.length === 0) return null;
  const target = UNITS[parts[parts.length - 1][2]];
  let value = 0;
  for (const part of parts) value += unit(Number(part[1]), UNITS[part[2]]).toNumber(target);
  return { value, unit: parts[parts.length - 1][2] };
}

/** Plain-ASCII maths: × ÷ − ² ³ √ and "25% of" become * / - ^2 ^3 sqrt and (25/100)*. */
function normalise(line: string): string {
  return line
    .replace(/\*\*|__|`/g, "")
    .replace(/(\d),(?=\d)/g, "$1") // 1,00,000 → 100000
    .replace(/[×✕✖·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/√\s*\(([^()]+)\)/g, "(($1)^(1/2))")
    .replace(new RegExp(String.raw`√\s*(${NUMBER})`, "g"), "(($1)^(1/2))")
    .replace(new RegExp(String.raw`(${NUMBER})\s*%\s*of\s*`, "gi"), "($1/100)*");
}

const OPERATOR = /[-+*/^]/;

function numeric(expression: string): number | null {
  const trimmed = expression.trim();
  // Mixed numbers ("1 1/2") and stray spaces between numbers are ambiguous.
  if (!trimmed || /\d\s+\d/.test(trimmed)) return null;
  try {
    const value = evaluate(trimmed);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Equal to the precision the answer wrote the result in (so 22/7 = 3.14 counts as right). */
function agrees(computed: number, written: string, writtenValue: number): boolean {
  const decimals = written.includes(".") ? (written.split(".")[1]?.match(/^\d+/)?.[0].length ?? 0) : 0;
  const tolerance = Math.max(0.5 * 10 ** -decimals, Math.abs(writtenValue) * 1e-9);
  return Math.abs(computed - writtenValue) <= tolerance + 1e-12;
}

/** "12 × 15" for messages: back to the symbols the answer used. */
function pretty(expression: string): string {
  return expression.trim().replace(/\*/g, " × ").replace(/\//g, " ÷ ").replace(/\s+/g, " ").replace(/\^2/g, "²").replace(/\^3/g, "³");
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(10)));
}

/** The result of a kind-specific check: a check, null (looked like this kind but isn't checkable), or undefined (not this kind at all). */
type Attempt = AnswerCheck | null | undefined;

/** Ratios: 8 : 12 = 2 : 3 */
function checkRatio(left: string, right: string): Attempt {
  const ratioL = RATIO_TAIL.exec(left);
  const ratioR = RATIO_HEAD.exec(right);
  if (!ratioL || !ratioR) return undefined;
  const a = Number(ratioL[1]) / Number(ratioL[2]);
  const b = Number(ratioR[1]) / Number(ratioR[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const ok = Math.abs(a - b) < 1e-9;
  const shown = `${ratioL[1]} : ${ratioL[2]} = ${ratioR[1]} : ${ratioR[2]}`;
  return { kind: "calculation", ok, message: ok ? shown : `${shown} is not right: the two ratios are not equal` };
}

/** Unit conversions: 5 km = 5000 m, 2 hours 15 minutes = 135 minutes */
function checkUnits(left: string, right: string): Attempt {
  const unitL = UNIT_TAIL.exec(left);
  const unitR = UNIT_HEAD.exec(right);
  if (!unitL || !unitR) return undefined;
  // "12 m + 8 m = 20 m" is a sum of quantities, not a conversion of the last one.
  if (/[-+*/×÷^]\s*$/.test(left.slice(0, unitL.index))) return undefined;
  try {
    const from = quantity(unitL[1]);
    const to = quantity(unitR[1]);
    if (!from || !to) return null;
    const inTarget = unit(from.value, UNITS[from.unit]).toNumber(UNITS[to.unit]);
    const written = [...unitR[1].matchAll(ONE_QUANTITY)];
    const ok = written.length === 1 ? agrees(inTarget, written[0][1], to.value) : Math.abs(inTarget - to.value) < 1e-9;
    const shown = `${unitL[1].trim()} = ${unitR[1].trim()}`;
    return { kind: "calculation", ok, message: ok ? shown : `${shown} is not right: it is ${format(inTarget)} ${to.unit}` };
  } catch {
    return null; // different kinds of unit (length vs time)
  }
}

/** The calculation at the end of the left side and at the start of the right, or null when this isn't plain arithmetic (algebra, labels like "Q1"). */
function sides(left: string, right: string): { tail: string; head: string } | null {
  const tailMatch = TAIL.exec(left);
  const headMatch = HEAD.exec(right);
  const tail = tailMatch?.[1];
  const head = headMatch?.[1];
  if (!tail || !head) return null;
  // Algebra and labels: a letter right before the numbers ("x + 5", "Q1") or
  // right after them ("2x") means this isn't plain arithmetic.
  const before = left.slice(0, tailMatch!.index).trimEnd();
  if (/[\p{L}]$/u.test(before) && /^\s*[-+*/^]/.test(tail)) return null;
  // A word then a space ("Hence 12 × 15 = 170") is a sentence; a letter stuck to the number ("Q1", "2x") or a lone
  // letter before it ("8 x 9", "n 5") is algebra or a multiplication sign, which this check leaves alone.
  const beforeRaw = left.slice(0, tailMatch!.index);
  if (/[\p{L}]$/u.test(beforeRaw) && (!/^\s/.test(tail) || /(?:^|[^\p{L}])\p{L}$/u.test(beforeRaw))) return null;
  if (/^[\p{L}]/u.test(right.slice(head.trimEnd().length))) return null;
  return { tail, head };
}

const plain = (x: string) => !OPERATOR.test(x.replace(/^\s*-/, ""));
// Unbalanced brackets mean we caught part of a bigger expression with words in it.
const balanced = (s: string) => (s.match(/\(/g) ?? []).length === (s.match(/\)/g) ?? []).length;

/** Two plain numbers in a chain ("2 × 3 = 6 = 7") can't both be right. */
function checkChainedNumbers(tail: string, head: string): AnswerCheck | null {
  const a = numeric(tail);
  const b = numeric(head);
  if (a === null || b === null || a === b) return null;
  return { kind: "calculation", ok: false, message: `${tail.trim()} = ${head.trim()} is not right: they are different numbers` };
}

/** Checks one "left = right" pair; null when it isn't a plain calculation. */
function checkPair(left: string, right: string, inChain: boolean): AnswerCheck | null {
  const ratio = checkRatio(left, right);
  if (ratio !== undefined) return ratio;
  const units = checkUnits(left, right);
  if (units !== undefined) return units;

  const found = sides(left, right);
  if (!found) return null;
  const { tail, head } = found;
  // At least one side must be a calculation (not just "12 = 12"), except in a chain.
  if (plain(tail) && plain(head)) return inChain ? checkChainedNumbers(tail, head) : null;
  if (!balanced(tail) || !balanced(head)) return null;

  const leftValue = numeric(tail);
  const rightValue = numeric(head);
  if (leftValue === null || rightValue === null) return null;
  // Compare at the precision of whichever side is a plain written number.
  const plainRight = /^\s*-?\d+(\.\d+)?\s*$/.test(head);
  const ok = plainRight
    ? agrees(leftValue, head.trim(), rightValue)
    : agrees(rightValue, tail.trim(), leftValue) || Math.abs(leftValue - rightValue) < 1e-9;
  const shown = `${pretty(tail)} = ${pretty(head)}`;
  return {
    kind: "calculation",
    ok,
    message: ok ? shown : `${shown} is not right: ${pretty(tail)} = ${format(leftValue)}`,
  };
}

/**
 * Finds and recomputes every plain calculation in an answer. Returns one check
 * per calculation found (right or wrong), skipping code blocks and lines that
 * say they are approximate.
 */
export function checkArithmetic(answer: string): AnswerCheck[] {
  const checks: AnswerCheck[] = [];
  const seen = new Set<string>();
  let inCode = false;
  for (const raw of answer.split("\n")) {
    if (raw.trim().startsWith("```")) inCode = !inCode;
    if (inCode || !raw.includes("=") || /≈|approx|about|nearly|लगभग|सुमारे|environ/i.test(raw)) continue;
    // Not "==", "<=", ">=", "≠" or "=>" (code and comparisons).
    if (/==|<=|>=|=>|≠/.test(raw)) continue;
    // A Markdown list marker ("- 12 = 2 × 2 × 3", "1. ...") is not a minus sign or a number.
    const line = raw.replace(/^\s*(?:[-*+•]|\d+[.)]|>)\s+/, "");
    const parts = normalise(line).split("=");
    for (let i = 0; i < parts.length - 1 && checks.length < MAX_CHECKS; i++) {
      const check = checkPair(parts[i], parts[i + 1], i > 0);
      if (check && !seen.has(check.message)) {
        seen.add(check.message);
        checks.push(check);
      }
    }
  }
  return checks;
}
