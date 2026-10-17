// Fractions as taught in school: simplify by dividing the top and bottom by
// their HCF; add or subtract by first making the denominators the same (their
// LCM), then adding the numerators. Improper answers are also given as mixed
// numbers.

import type { Cell, Rule, Step, WorkedExample } from "@/lib/worked/types";

const MAX_VALUE = 100_000;

export type FractionOp = "simplify" | "add" | "subtract";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** "−7" for negatives, as written on the board. */
const num = (n: number) => (n < 0 ? `−${-n}` : String(n));

/** Board columns: "=" | fraction | note (×3) | sign | fraction | note. A mixed number reuses the right half. */
const COL = { eq: 0, a: 1, noteA: 2, op: 3, b: 4, noteB: 5, eq2: 3, whole: 4, mixed: 5 };

function fraction(n: number, d: number, top: number, col: number, tone: Cell["tone"]): { cells: Cell[]; rules: Rule[] } {
  return {
    cells: [
      { row: top, col, text: num(n), tone },
      { row: top + 1, col, text: String(d), tone },
    ],
    rules: [{ row: top, fromCol: col, toCol: col }],
  };
}

const sign = (text: string, top: number, col: number): Cell => ({ row: top, col, text, tone: "given", mid: true });
const note = (text: string, top: number, col: number): Cell[] => [
  { row: top, col, text, tone: "carry" },
  { row: top + 1, col, text, tone: "carry" },
];

/** "7/6 = 1 1/6", "2/3", "−5/4 = −1 1/4", "3", "0". */
function written(n: number, d: number): string {
  if (n === 0) return "0";
  if (d === 1) return num(n);
  const whole = Math.trunc(Math.abs(n) / d);
  if (whole === 0) return `${num(n)}/${d}`;
  const rest = Math.abs(n) % d;
  return `${num(n)}/${d} = ${n < 0 ? "−" : ""}${whole}${rest ? ` ${rest}/${d}` : ""}`;
}

/**
 * Steps that take n/d (already on the board as the line starting at `top`) to
 * its simplest form, writing new lines below. Returns the final [n, d].
 */
function simplifySteps(n: number, d: number, top: number, steps: Step[]): [number, number] {
  const h = gcd(Math.abs(n), d);
  if (n === 0) {
    steps.push({ say: `The top is 0, so the fraction is 0.`, cells: [sign("=", top, COL.eq2), { ...sign("0", top, COL.whole), tone: "result" }] });
    return [0, 1];
  }
  if (h === 1) {
    steps.push({ say: `${Math.abs(n)} and ${d} have no common factor except 1, so ${num(n)}/${d} is already in its simplest form.` });
  } else {
    const next = top + 3;
    const f = fraction(n / h, d / h, next, COL.a, "result");
    steps.push({
      say: `The HCF of ${Math.abs(n)} and ${d} is ${h}, the biggest number that divides both. Divide the top and the bottom by ${h}: ${Math.abs(n)} ÷ ${h} = ${Math.abs(n) / h} and ${d} ÷ ${h} = ${d / h}.`,
      cells: [...note(`÷${h}`, top, COL.noteA), sign("=", next, COL.eq), ...f.cells],
      rules: f.rules,
      focus: [
        { row: top, col: COL.a },
        { row: top + 1, col: COL.a },
      ],
    });
    n /= h;
    d /= h;
    top = next;
  }
  if (d === 1) {
    steps.push({ say: `The bottom is 1, so the answer is the whole number ${num(n)}.`, cells: [sign("=", top, COL.eq2), { ...sign(num(n), top, COL.whole), tone: "result" }] });
  } else if (Math.abs(n) > d) {
    const whole = Math.floor(Math.abs(n) / d);
    const rest = Math.abs(n) % d;
    const f = fraction(rest, d, top, COL.mixed, "result");
    steps.push({
      say: `The top is bigger than the bottom, so write it as a mixed number: ${Math.abs(n)} ÷ ${d} = ${whole} remainder ${rest}, so ${num(n)}/${d} = ${n < 0 ? "minus " : ""}${whole} and ${rest}/${d}.`,
      cells: [sign("=", top, COL.eq2), { ...sign(`${n < 0 ? "−" : ""}${whole}`, top, COL.whole), tone: "result" }, ...f.cells],
      rules: f.rules,
    });
  }
  return [n, d];
}

/** Simplifies one fraction, or adds/subtracts two. Each fraction is [numerator, denominator]. */
export function fractionExample(op: FractionOp, fractions: [number, number][]): WorkedExample | null {
  const count = op === "simplify" ? 1 : 2;
  if (fractions.length !== count) return null;
  if (fractions.some(([n, d]) => !Number.isInteger(n) || !Number.isInteger(d) || n < 0 || d < 1 || n > MAX_VALUE || d > MAX_VALUE)) return null;
  const steps: Step[] = [];
  const [[a, b], [c, d] = [0, 1]] = fractions;
  const symbol = op === "add" ? "+" : "−";
  const question = op === "simplify" ? `${a}/${b}` : `${a}/${b} ${symbol} ${c}/${d}`;

  const first = fraction(a, b, 0, COL.a, "given");
  let result: [number, number];
  if (op === "simplify") {
    steps.push({ say: `Write the fraction ${a}/${b}.`, cells: first.cells, rules: first.rules });
    result = simplifySteps(a, b, 0, steps);
  } else {
    const second = fraction(c, d, 0, COL.b, "given");
    steps.push({
      say: `Write ${question}.`,
      cells: [...first.cells, sign(symbol, 0, COL.op), ...second.cells],
      rules: [...first.rules, ...second.rules],
    });
    let top = 0;
    let [x, y, bottom] = [a, c, b];
    if (b !== d) {
      const L = lcm(b, d);
      const [k1, k2] = [L / b, L / d];
      steps.push({
        say: `The denominators ${b} and ${d} are different, so make them the same. The LCM of ${b} and ${d} is ${L}.`,
        focus: [
          { row: 1, col: COL.a },
          { row: 1, col: COL.b },
        ],
      });
      top = 3;
      [x, y, bottom] = [a * k1, c * k2, L];
      const fa = fraction(x, L, top, COL.a, "product");
      const fb = fraction(y, L, top, COL.b, "product");
      const changes = [k1 > 1 ? `multiply the top and bottom of ${a}/${b} by ${k1}` : "", k2 > 1 ? `multiply the top and bottom of ${c}/${d} by ${k2}` : ""].filter(Boolean);
      steps.push({
        say: `To get ${L} at the bottom, ${changes.join(", and ")}. This gives ${x}/${L} ${symbol} ${y}/${L}.`,
        cells: [
          ...(k1 > 1 ? note(`×${k1}`, 0, COL.noteA) : []),
          ...(k2 > 1 ? note(`×${k2}`, 0, COL.noteB) : []),
          sign("=", top, COL.eq),
          ...fa.cells,
          sign(symbol, top, COL.op),
          ...fb.cells,
        ],
        rules: [...fa.rules, ...fb.rules],
      });
    }
    const n = op === "add" ? x + y : x - y;
    const next = top + 3;
    const f = fraction(n, bottom, next, COL.a, "result");
    steps.push({
      say:
        `${b === d ? "The denominators are the same, so " : "Now "}${op === "add" ? "add" : "subtract"} the numerators and keep the denominator ${bottom}: ${x} ${symbol} ${y} = ${num(n)}.` +
        (n < 0 ? ` The answer is negative because ${c}/${d} is bigger than ${a}/${b}.` : ""),
      cells: [sign("=", next, COL.eq), ...f.cells],
      rules: f.rules,
    });
    result = simplifySteps(n, bottom, next, steps);
  }

  const answer = `${question} = ${written(...result)}`;
  steps.push({ say: `So ${answer}.` });

  const cells = steps.flatMap((s) => s.cells ?? []);
  const cols = Math.max(...cells.map((x) => x.col)) + 1;
  // Each column as wide as its longest text.
  const colWidths = Array.from({ length: cols }, (_, col) => Math.max(1, ...cells.filter((x) => x.col === col).map((x) => x.text.length)));
  return {
    problem: { kind: "fraction", op, fractions },
    title: op === "simplify" ? `Simplify the fraction ${a}/${b}` : `${op === "add" ? "Adding" : "Subtracting"} fractions: ${question}`,
    rows: Math.max(...cells.map((x) => x.row)) + 1,
    cols,
    colWidths,
    steps,
    answer,
  };
}
