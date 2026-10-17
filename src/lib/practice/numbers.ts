// Numbers in practice questions, held exactly: every value is a fraction of
// two whole numbers (3.142 is 3142/1000), so comparing never rounds.

export type NumberKind = "whole" | "decimal" | "fraction";

export interface PracticeNumber {
  kind: NumberKind;
  /** Exact value: num / den, den > 0. */
  num: bigint;
  den: bigint;
  /** As written for the child: "4,07,500", "3.142", "2/3", "1 3/4". */
  text: string;
  /** For fractions: the parts as shown (whole is set for mixed numbers). */
  fraction?: { whole?: number; top: number; bottom: number };
  /** For decimals: digits after the point as written. */
  places?: number;
}

/** -1, 0 or 1. */
export function compare(a: PracticeNumber, b: PracticeNumber): number {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Indian digit grouping, as school books print it: 4,07,500. */
export function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export function whole(n: number): PracticeNumber {
  return { kind: "whole", num: BigInt(n), den: BigInt(1), text: groupDigits(String(n)) };
}

/** A decimal from its whole part and the digits after the point ("07" → .07). */
export function decimal(intPart: number, fractionDigits: string): PracticeNumber {
  const den = BigInt(10) ** BigInt(fractionDigits.length);
  return {
    kind: "decimal",
    num: BigInt(intPart) * den + BigInt(fractionDigits || "0"),
    den,
    text: `${groupDigits(String(intPart))}.${fractionDigits}`,
    places: fractionDigits.length,
  };
}

/** top/bottom, written as a mixed number when asked and it is more than 1. */
export function fraction(top: number, bottom: number, mixed = false): PracticeNumber {
  const base = { kind: "fraction" as const, num: BigInt(top), den: BigInt(bottom) };
  if (mixed && top > bottom) {
    const w = Math.floor(top / bottom);
    const rest = top % bottom;
    if (rest === 0) return { ...base, text: String(w), fraction: { whole: w, top: 0, bottom } };
    return { ...base, text: `${w} ${rest}/${bottom}`, fraction: { whole: w, top: rest, bottom } };
  }
  return { ...base, text: `${top}/${bottom}`, fraction: { top, bottom } };
}

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
export const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
