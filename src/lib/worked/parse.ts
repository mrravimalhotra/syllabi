import type { WorkedProblem } from "@/lib/worked/types";
import { savedLanguage, isNarration } from "@/lib/worked/say";

// Bounds checked before any work is done, so a request can't carry huge strings or lists.
const MAX_NUMBER_CHARS = 30;
const MAX_LIST = 6;

type Fields = Partial<Record<string, unknown>>;

const isNumberText = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_NUMBER_CHARS && /^\d*\.?\d+$/.test(v);
const isSmallInteger = (n: unknown): n is number => Number.isInteger(n) && Math.abs(n as number) <= 1_000_000_000;
const isShortText = (v: unknown): v is string => typeof v === "string" && v.length <= 4;
const isList = <T>(v: unknown, max: number, each: (item: unknown) => item is T): v is T[] => Array.isArray(v) && v.length <= max && v.every(each);
const isFractionPair = (f: unknown): f is [number, number] => Array.isArray(f) && f.length === 2 && f.every(isSmallInteger);

/** One reader per kind of calculation: the problem when the fields are exactly right, otherwise null. */
const READERS: Record<string, (p: Fields) => WorkedProblem | null> = {
  division: (p) => (isNumberText(p.dividend) && isNumberText(p.divisor) ? { kind: "division", dividend: p.dividend, divisor: p.divisor, decimals: p.decimals === true } : null),
  "lcm-hcf": (p) =>
    isList(p.numbers, MAX_LIST, isSmallInteger) && (p.want === "lcm" || p.want === "hcf" || p.want === "both")
      ? { kind: "lcm-hcf", numbers: p.numbers, want: p.want }
      : null,
  column: (p) => ((p.op === "add" || p.op === "subtract") && isList(p.numbers, MAX_LIST, isNumberText) ? { kind: "column", op: p.op, numbers: p.numbers } : null),
  multiplication: (p) => (isNumberText(p.a) && isNumberText(p.b) ? { kind: "multiplication", a: p.a, b: p.b } : null),
  fraction: (p) =>
    (p.op === "simplify" || p.op === "add" || p.op === "subtract") && isList(p.fractions, 2, isFractionPair)
      ? { kind: "fraction", op: p.op, fractions: p.fractions }
      : null,
  convert: (p) => (isNumberText(p.value) && isShortText(p.from) && isShortText(p.to) ? { kind: "convert", value: p.value, from: p.from, to: p.to } : null),
};

function parseShape(raw: unknown): WorkedProblem | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Fields;
  const read = typeof p.kind === "string" && Object.hasOwn(READERS, p.kind) ? READERS[p.kind] : null;
  return read ? read(p) : null;
}

/** Reads a problem from the request; null unless it is exactly one of the supported shapes. */
export function parseProblem(raw: unknown): WorkedProblem | null {
  const problem = parseShape(raw);
  const language = (raw as { language?: unknown } | null)?.language;
  return problem && { ...problem, ...savedLanguage(isNarration(language) ? language : undefined) };
}
