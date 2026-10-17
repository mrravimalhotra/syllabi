// Column addition and subtraction, as taught in school: numbers lined up by
// place value (decimal points under each other), worked from the ones column
// leftwards, with carrying and borrowing written above the column.

import type { Cell, Step, WorkedExample } from "@/lib/worked/types";
import { cleanNumber } from "@/lib/worked/division";

const MAX_DIGITS = 12;
const MAX_NUMBERS = 4;

const INTEGER_PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "lakhs", "ten lakhs", "crores", "ten crores", "hundred crores", "thousand crores", "ten thousand crores"];
const DECIMAL_PLACES = ["tenths", "hundredths", "thousandths", "ten-thousandths"];

/** Numbers lined up on the decimal point: each as a digit array of equal length. */
function align(numbers: string[]) {
  const ints = numbers.map((n) => n.split(".")[0] || "0");
  const fracs = numbers.map((n) => n.split(".")[1] ?? "");
  const intLen = Math.max(...ints.map((s) => s.length));
  const fracLen = Math.max(...fracs.map((s) => s.length));
  const padded = numbers.map((_, i) => ints[i].padStart(intLen, " ") + fracs[i].padEnd(fracLen, "0"));
  // The place name of digit position p (0 = leftmost).
  const placeName = (p: number) => (p < intLen ? INTEGER_PLACES[intLen - 1 - p] ?? "next" : DECIMAL_PLACES[p - intLen] ?? "next decimal");
  return { padded, intLen, fracLen, placeName, written: fracs.map((f) => f.length) };
}

interface Layout {
  /** Board column of digit position p (one extra column for the sign, one for the point). */
  colOf: (p: number) => number;
  pointCol: number | null;
  width: number;
}

function layout(intLen: number, fracLen: number, extraLeft: number): Layout {
  const sign = 1;
  const pointCol = fracLen > 0 ? sign + extraLeft + intLen : null;
  return {
    colOf: (p) => sign + extraLeft + p + (fracLen > 0 && p >= intLen ? 1 : 0),
    pointCol,
    width: sign + extraLeft + intLen + fracLen + (fracLen > 0 ? 1 : 0),
  };
}

function numberCells(digits: string, row: number, colOf: (p: number) => number, pointCol: number | null, intLen: number, writtenFrac: number, tone: Cell["tone"]): Cell[] {
  const cells: Cell[] = [];
  digits.split("").forEach((d, p) => {
    if (d === " ") return;
    const isPadding = p >= intLen + writtenFrac;
    cells.push({ row, col: colOf(p), text: d, tone: isPadding ? "muted" : tone });
  });
  if (pointCol !== null) cells.push({ row, col: pointCol, text: ".", tone });
  return cells;
}

export function columnAddition(numbersIn: string[]): WorkedExample | null {
  const numbers = numbersIn.map(cleanNumber);
  if (numbers.length < 2 || numbers.length > MAX_NUMBERS || numbers.some((n) => !n)) return null;
  const nums = numbers as string[];
  const { padded, intLen, fracLen, placeName, written } = align(nums);
  if (intLen + fracLen > MAX_DIGITS) return null;

  // One spare column on the left for a final carry.
  const { colOf, pointCol, width } = layout(intLen, fracLen, 1);
  const carryRow = 0;
  const lastNumberRow = nums.length;
  const resultRow = nums.length + 1;
  const steps: Step[] = [];

  const setup: Cell[] = [];
  nums.forEach((_, i) => setup.push(...numberCells(padded[i], i + 1, colOf, pointCol, intLen, written[i], "given")));
  setup.push({ row: lastNumberRow, col: 0, text: "+", tone: "given" });
  steps.push({
    say:
      `Write the numbers one under another, lining up the ${fracLen ? "decimal points" : "ones"}.` +
      (written.some((w) => w < fracLen) ? " Fill the empty decimal places with zeros so every number has the same number of decimal places." : ""),
    cells: setup,
    rules: [{ row: lastNumberRow, fromCol: 0, toCol: width - 1 }],
  });

  let carry = 0;
  const total = intLen + fracLen;
  const resultDigits: string[] = [];
  for (let p = total - 1; p >= 0; p--) {
    const column = padded.map((n) => n[p]).filter((d) => d !== " ").map(Number);
    const sum = column.reduce((a, b) => a + b, 0) + carry;
    const digit = sum % 10;
    const newCarry = Math.floor(sum / 10);
    const parts = [...column.map(String), ...(carry ? [`${carry} (carried)`] : [])].join(" + ");
    const place = placeName(p);
    const next = p > 0 ? placeName(p - 1) : "next place";
    steps.push({
      say:
        `Add the ${place}: ${parts} = ${sum}.` +
        (newCarry ? ` Write ${digit} and carry ${newCarry} to the ${next}.` : ` Write ${digit}.`),
      cells: [
        { row: resultRow, col: colOf(p), text: String(digit), tone: "result" },
        ...(newCarry ? [{ row: carryRow, col: colOf(p - 1 >= 0 ? p - 1 : -1), text: String(newCarry), tone: "carry" as const }] : []),
      ],
      focus: nums.map((_, i) => ({ row: i + 1, col: colOf(p) })).filter((_, i) => padded[i][p] !== " "),
    });
    if (p === intLen && fracLen > 0) {
      steps.push({ say: "Put the decimal point in the answer, under the other decimal points.", cells: [{ row: resultRow, col: pointCol!, text: ".", tone: "result" }] });
    }
    resultDigits.unshift(String(digit));
    carry = newCarry;
  }
  if (carry) {
    steps.push({
      say: `There are no more columns, so write the carried ${carry} in front.`,
      cells: [{ row: resultRow, col: colOf(-1), text: String(carry), tone: "result" }],
    });
    resultDigits.unshift(String(carry));
  }
  const intDigits = resultDigits.slice(0, resultDigits.length - fracLen).join("").replace(/^0+(?=\d)/, "");
  const result = fracLen ? `${intDigits}.${resultDigits.slice(resultDigits.length - fracLen).join("")}` : intDigits;
  const sentence = `${nums.join(" + ")} = ${result}`;
  steps.push({ say: `So ${sentence}.` });

  return {
    problem: { kind: "column", op: "add", numbers: nums },
    title: `Column addition: ${nums.join(" + ")}`,
    rows: resultRow + 1,
    cols: width,
    colWidths: Array.from({ length: width }, (_, c) => (c === pointCol ? 0.5 : 1)),
    steps,
    answer: sentence,
  };
}

export function columnSubtraction(aIn: string, bIn: string): WorkedExample | null {
  const a0 = cleanNumber(aIn);
  const b0 = cleanNumber(bIn);
  if (!a0 || !b0) return null;
  // Smaller minus larger: work out larger minus smaller and make it negative.
  const negative = Number(a0) < Number(b0);
  const [a, b] = negative ? [b0, a0] : [a0, b0];
  const { padded, intLen, fracLen, placeName, written } = align([a, b]);
  if (intLen + fracLen > MAX_DIGITS) return null;
  const { colOf, pointCol, width } = layout(intLen, fracLen, 0);
  const steps: Step[] = [];
  const top = padded[0].split("").map((d) => (d === " " ? 0 : Number(d)));
  const bottom = padded[1].split("").map((d) => (d === " " ? -1 : Number(d)));
  const resultRow = 3;

  if (negative) {
    steps.push({ say: `${a0} is smaller than ${b0}, so the answer will be negative. Work out ${b0} − ${a0}, then put a minus sign in front.` });
  }
  steps.push({
    say:
      `Write ${a} on top and ${b} under it, lining up the ${fracLen ? "decimal points" : "ones"}.` +
      (written.some((w) => w < fracLen) ? " Fill the empty decimal places with zeros." : ""),
    cells: [
      ...numberCells(padded[0], 1, colOf, pointCol, intLen, written[0], "given"),
      ...numberCells(padded[1], 2, colOf, pointCol, intLen, written[1], "given"),
      { row: 2, col: 0, text: "−", tone: "given" },
    ],
    rules: [{ row: 2, fromCol: 0, toCol: width - 1 }],
  });

  const total = intLen + fracLen;
  const resultDigits: number[] = [];
  for (let p = total - 1; p >= 0; p--) {
    const down = Math.max(bottom[p], 0);
    const place = placeName(p);
    if (top[p] < down) {
      // Borrow from the nearest non-zero digit on the left; zeros on the way become 9.
      let q = p - 1;
      while (q >= 0 && top[q] === 0) q--;
      const changed: Cell[] = [];
      top[q] -= 1;
      changed.push({ row: 1, col: colOf(q), text: String(padded[0][q]), tone: "muted" }, { row: 0, col: colOf(q), text: String(top[q]), tone: "carry" });
      for (let z = q + 1; z < p; z++) {
        top[z] = 9;
        changed.push({ row: 1, col: colOf(z), text: "0", tone: "muted" }, { row: 0, col: colOf(z), text: "9", tone: "carry" });
      }
      const before = top[p];
      top[p] += 10;
      changed.push({ row: 1, col: colOf(p), text: String(padded[0][p]), tone: "muted" }, { row: 0, col: colOf(p), text: String(top[p]), tone: "carry" });
      steps.push({
        say:
          `In the ${place}, ${before} is smaller than ${down}, so borrow from the ${placeName(q)}.` +
          (q < p - 1 ? ` The ${placeName(p - 1)} is 0, so we borrow across it: the zeros on the way become 9.` : "") +
          ` The ${placeName(q)} digit becomes ${top[q]} and the ${place} becomes ${top[p]}.`,
        cells: changed,
        focus: [{ row: 1, col: colOf(p) }],
      });
    }
    const digit = top[p] - down;
    steps.push({
      say: `Subtract the ${place}: ${top[p]} − ${down} = ${digit}. Write ${digit}.`,
      cells: [{ row: resultRow, col: colOf(p), text: String(digit), tone: "result" }],
      focus: [{ row: 1, col: colOf(p) }, ...(bottom[p] >= 0 ? [{ row: 2, col: colOf(p) }] : [])],
    });
    if (p === intLen && fracLen > 0) {
      steps.push({ say: "Put the decimal point in the answer, under the other decimal points.", cells: [{ row: resultRow, col: pointCol!, text: ".", tone: "result" }] });
    }
    resultDigits.unshift(digit);
  }
  const intDigits = resultDigits.slice(0, intLen).join("").replace(/^0+(?=\d)/, "");
  const magnitude = fracLen ? `${intDigits}.${resultDigits.slice(intLen).join("")}` : intDigits;
  const result = negative && Number(magnitude) !== 0 ? `−${magnitude}` : magnitude;
  steps.push({
    say: `So ${a0} − ${b0} = ${result}. Check by adding: ${magnitude} + ${b} = ${a}.`,
    cells: negative && Number(magnitude) !== 0 ? [{ row: resultRow, col: 0, text: "−", tone: "result" }] : [],
  });
  return {
    problem: { kind: "column", op: "subtract", numbers: [a0, b0] },
    title: `Column subtraction: ${a0} − ${b0}`,
    rows: resultRow + 1,
    cols: width,
    colWidths: Array.from({ length: width }, (_, c) => (c === pointCol ? 0.5 : 1)),
    steps,
    answer: `${a0} − ${b0} = ${result}`,
  };
}
