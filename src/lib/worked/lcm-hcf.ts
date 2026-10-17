// LCM and HCF by the division (ladder) method taught in Indian schools:
// for HCF, divide by primes that divide every number; for LCM, divide by
// primes that divide at least one number, carrying the others down.

import type { Cell, Step, VLine, Rule, WorkedExample } from "@/lib/worked/types";
import { phrases, savedLanguage, type Narration, type Phrases } from "@/lib/worked/say";
import { gcd } from "@/lib/math";

const MAX_NUMBERS = 6;
const MAX_VALUE = 1_000_000;

function smallestPrimeDividing(numbers: number[], all: boolean): number | null {
  const limit = Math.max(...numbers);
  for (let p = 2; p <= limit; p++) {
    if (!isPrime(p)) continue;
    const divides = numbers.filter((n) => n % p === 0).length;
    if (all ? divides === numbers.length : divides > 0) return p;
  }
  return null;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

interface Ladder {
  cells: Cell[];
  rules: Rule[];
  vlines: VLine[];
  steps: Step[];
  primes: number[];
  rows: number;
}

/** One ladder starting at `top`; columns: 0 = prime, 1.. = the numbers. */
function ladder(numbers: number[], all: boolean, top: number, what: "HCF" | "LCM", t: Phrases): Ladder {
  const steps: Step[] = [];
  const primes: number[] = [];
  const rules: Rule[] = [];
  const vlines: VLine[] = [];
  let current = [...numbers];
  // A label row, then the ladder.
  let row = top + 1;
  const n = numbers.length;

  steps.push({
    say: what === "HCF" ? t.hcfIntro : t.lcmIntro,
    cells: [
      { row: top, col: 0, text: `${t[what]}:`, tone: "result" },
      ...current.map((v, i) => ({ row, col: i + 1, text: String(v), tone: "given" as const })),
    ],
  });

  for (;;) {
    const p = smallestPrimeDividing(current, all);
    if (p === null || current.every((v) => v === 1)) break;
    const next = current.map((v) => (v % p === 0 ? v / p : v));
    const divided = current.filter((v) => v % p === 0);
    const carried = current.filter((v) => v % p !== 0);
    primes.push(p);
    steps.push({
      say: t.ladderStep(p, divided, carried),
      cells: [
        { row, col: 0, text: String(p), tone: "divisor" },
        ...next.map((v, i) => ({
          row: row + 1,
          col: i + 1,
          text: String(v),
          tone: current[i] % p === 0 ? ("quotient" as const) : ("muted" as const),
        })),
      ],
      rules: [{ row, fromCol: 1, toCol: n }],
      vlines: [{ col: 1, fromRow: row, toRow: row }],
      focus: current.map((v, i) => (v % p === 0 ? { row, col: i + 1 } : null)).filter((f): f is { row: number; col: number } => f !== null),
    });
    current = next;
    row++;
  }

  if (what === "HCF" && current.some((v) => v !== 1)) {
    steps.push({
      say: t.hcfStop(current),
      focus: current.map((_, i) => ({ row, col: i + 1 })),
    });
  }
  if (what === "LCM") {
    steps.push({ say: t.lcmStop, focus: current.map((_, i) => ({ row, col: i + 1 })) });
  }

  const cells = steps.flatMap((s) => s.cells ?? []);
  for (const s of steps) {
    rules.push(...(s.rules ?? []));
    vlines.push(...(s.vlines ?? []));
  }
  return { cells, rules, vlines, steps, primes, rows: row - top + 1 };
}

export function lcmHcf(numbersIn: number[], want: "lcm" | "hcf" | "both", language?: Narration): WorkedExample | null {
  const t = phrases(language);
  const numbers = numbersIn.filter((n) => Number.isInteger(n));
  if (numbers.length < 2 || numbers.length > MAX_NUMBERS) return null;
  if (numbers.some((n) => n < 1 || n > MAX_VALUE)) return null;

  const steps: Step[] = [];
  const answers: string[] = [];
  let top = 0;
  const hcfValue = numbers.reduce(gcd);
  const lcmValue = numbers.reduce((a, b) => (a / gcd(a, b)) * b);

  if (want !== "lcm") {
    const h = ladder(numbers, true, top, "HCF", t);
    steps.push(...h.steps);
    const sayValue =
      h.primes.length === 0 ? t.hcfNone : t.hcfValue(h.primes, hcfValue);
    steps.push({ say: sayValue, cells: [{ row: top + h.rows, col: 0, text: `${t.HCF} = ${hcfValue}`, tone: "result" }] });
    answers.push(`${t.ofNumbers(t.HCF, numbers)} = ${hcfValue}`);
    top += h.rows + 2;
  }
  if (want !== "hcf") {
    const l = ladder(numbers, false, top, "LCM", t);
    steps.push(...l.steps);
    steps.push({
      say: t.lcmValue(l.primes, lcmValue),
      cells: [{ row: top + l.rows, col: 0, text: `${t.LCM} = ${lcmValue}`, tone: "result" }],
    });
    answers.push(`${t.ofNumbers(t.LCM, numbers)} = ${lcmValue}`);
    top += l.rows + 1;
  }
  if (want === "both" && numbers.length === 2) {
    steps.push({ say: t.hcfLcmCheck(hcfValue, lcmValue, numbers[0], numbers[1]) });
  }

  const allCells = steps.flatMap((s) => s.cells ?? []);
  const widest = Math.max(...allCells.filter((c) => c.col > 0).map((c) => c.text.length), 2);
  const title = want === "both" ? t.hcfAndLcmOf(numbers) : t.ofNumbers(want === "hcf" ? t.HCF : t.LCM, numbers);
  return {
    problem: { kind: "lcm-hcf", numbers, want, ...savedLanguage(language) },
    title,
    rows: Math.max(...allCells.map((c) => c.row)) + 1,
    cols: numbers.length + 1,
    colWidths: [3, ...numbers.map(() => widest + 1)],
    steps,
    answer: answers.join("; "),
  };
}
