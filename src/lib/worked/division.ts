// Long division, worked the way Indian school books teach it: quotient above
// the dividend, then divide, multiply, subtract, bring down, step by step.
// Handles remainders, zeros inside the quotient, decimal dividends, decimal
// divisors (both numbers are first multiplied by 10, 100...) and, when asked,
// continuing into decimal places.

import type { Cell, Step, WorkedExample } from "@/lib/worked/types";
import { phrases, savedLanguage, type Narration, type Phrases } from "@/lib/worked/say";

const MAX_DIVIDEND_DIGITS = 12;
const MAX_DIVISOR_DIGITS = 6;
const MAX_DECIMAL_PLACES = 4;

/** "1,05,200.50" → "105200.50"; null if not a plain non-negative number. */
export function cleanNumber(text: string): string | null {
  const t = text.replace(/[,\s]/g, "");
  if (!/^\d*\.?\d+$/.test(t) && !/^\d+\.$/.test(t)) return null;
  return t.replace(/\.$/, "");
}

/** Shifts a number's decimal point right by `places` ("12.5", 2 → "1250"). */
function shift(number: string, places: number): string {
  const [int, frac = ""] = number.split(".");
  const padded = frac.padEnd(places, "0");
  const newInt = (int + padded.slice(0, places)).replace(/^0+(?=\d)/, "");
  const rest = padded.slice(places);
  return rest ? `${newInt}.${rest}` : newInt;
}

/** The numbers and the board layout for one division: the digits to work through and which column each sits in. */
interface Layout {
  dividendIn: string;
  divisorIn: string;
  dividendStr: string;
  divisorStr: string;
  /** Places the decimal divisor was moved, so the divisor is whole. */
  divisorPlaces: number;
  divisor: number;
  /** Digits before and after the dividend's decimal point. */
  intLength: number;
  fracLength: number;
  hasDecimals: boolean;
  /** Digits to work through; in decimal mode, zeros are added after the point. */
  digits: number[];
  /** Digits before the decimal point. */
  pointAt: number;
  showPoint: boolean;
  addedZeros: number;
  /** Width of the divisor in columns: the dividend starts at this column. */
  L: number;
  colOf: (i: number) => number;
  pointCol: number;
  lastCol: number;
}

/** Checks the numbers and lays out the board; null when they are out of range or not a plain number. */
function layoutFor(dividendText: string, divisorText: string, decimals: boolean): Layout | null {
  const dividendIn = cleanNumber(dividendText);
  const divisorIn = cleanNumber(divisorText);
  if (!dividendIn || !divisorIn) return null;

  // A decimal divisor: multiply both by 10, 100... so the divisor is whole.
  const divisorPlaces = divisorIn.includes(".") ? divisorIn.split(".")[1].length : 0;
  const divisorStr = shift(divisorIn, divisorPlaces).replace(/^0+(?=\d)/, "");
  const dividendStr = shift(dividendIn, divisorPlaces).replace(/^0+(?=\d)/, "");
  const divisor = Number(divisorStr);
  if (!divisor || divisorStr.length > MAX_DIVISOR_DIGITS) return null;

  const [intPart, fracPart = ""] = dividendStr.split(".");
  if (intPart.length + fracPart.length > MAX_DIVIDEND_DIGITS) return null;
  const hasDecimals = decimals || fracPart.length > 0;

  // Digits to work through; in decimal mode, zeros are added after the point
  // until the division ends or reaches the limit (found by a dry run).
  const digits = (intPart + fracPart).split("").map(Number);
  const pointAt = intPart.length;
  if (hasDecimals) {
    let remainder = 0;
    for (const d of digits) remainder = (remainder * 10 + d) % divisor;
    let added = 0;
    while (remainder !== 0 && fracPart.length + added < MAX_DECIMAL_PLACES) {
      digits.push(0);
      added++;
      remainder = (remainder * 10) % divisor;
    }
  }
  const showPoint = hasDecimals && digits.length > pointAt;

  // Layout: divisor in columns 0..L-1, dividend from column L; the decimal
  // point (if any) gets a column of its own.
  const L = divisorStr.length;
  const colOf = (i: number) => L + i + (showPoint && i >= pointAt ? 1 : 0);
  return {
    dividendIn,
    divisorIn,
    dividendStr,
    divisorStr,
    divisorPlaces,
    divisor,
    intLength: intPart.length,
    fracLength: fracPart.length,
    hasDecimals,
    digits,
    pointAt,
    showPoint,
    addedZeros: digits.length - (intPart.length + fracPart.length),
    L,
    colOf,
    pointCol: L + pointAt,
    lastCol: colOf(digits.length - 1),
  };
}

/** The opening steps: any shift of a decimal divisor, the set-up on the board, and any zeros added after the point. */
function openingSteps(t: Phrases, lay: Layout): Step[] {
  const steps: Step[] = [];
  const { digits, colOf, intLength, fracLength } = lay;
  const dividendCells: Cell[] = digits.map((d, i) => ({
    row: 1,
    col: colOf(i),
    text: String(d),
    tone: i >= intLength + fracLength ? "muted" : "given",
  }));
  if (lay.showPoint) dividendCells.push({ row: 1, col: lay.pointCol, text: ".", tone: "given" });
  const divisorCells: Cell[] = lay.divisorStr.split("").map((d, i) => ({ row: 1, col: i, text: d, tone: "divisor" }));

  if (lay.divisorPlaces > 0) {
    const factor = 10 ** lay.divisorPlaces;
    steps.push({ say: t.decimalDivisor(lay.divisorIn, factor, `${lay.dividendIn} ÷ ${lay.divisorIn}`, lay.dividendStr, lay.divisorStr) });
  }
  steps.push({
    say: t.divisionSetup(lay.dividendStr, lay.divisorStr),
    cells: [...divisorCells, ...dividendCells.filter((c) => c.tone !== "muted")],
    rules: [{ row: 0, fromCol: lay.L, toCol: lay.lastCol }],
    vlines: [{ col: lay.L, fromRow: 1, toRow: 1 }],
  });
  if (lay.addedZeros > 0) {
    steps.push({
      say: t.addZeros(lay.dividendIn.includes(".")),
      cells: dividendCells.filter((c) => c.tone === "muted" || c.text === "."),
    });
  }
  return steps;
}

/** Where the working has got to while the digits are taken one at a time. */
interface Progress {
  started: boolean;
  /** The number being divided now. */
  work: number;
  /** The next row for a product. */
  row: number;
  /** The row where the current working number sits. */
  workRow: number;
  quotientDigits: { col: number; digit: number }[];
}

/** The steps for one digit: how many times the divisor goes in, the product, the subtraction. Updates the progress. */
function digitSteps(t: Phrases, lay: Layout, progress: Progress, q: number, focusWork: { row: number; col: number }[], i: number): Step[] {
  const { colOf, divisor } = lay;
  const { work, row } = progress;
  const product = q * divisor;
  const remainder = work - product;
  progress.started = true;
  if (q === 0) {
    progress.quotientDigits.push({ col: colOf(i), digit: 0 });
    return [{ say: t.zeroInQuotient(divisor, work), cells: [{ row: 0, col: colOf(i), text: "0", tone: "quotient" }], focus: focusWork }];
  }
  const productCells = numberCells(product, row, colOf(i), colOf);
  const productFrom = Math.min(...productCells.map((c) => c.col));
  progress.quotientDigits.push({ col: colOf(i), digit: q });
  const steps: Step[] = [
    {
      say: t.howMany(divisor, work, q, product, q < 9 ? (q + 1) * divisor : null),
      cells: [{ row: 0, col: colOf(i), text: String(q), tone: "quotient" }],
      focus: focusWork,
    },
    { say: t.multiplyDown(q, divisor, product, work), cells: productCells.map((c) => ({ ...c, tone: "product" as const })) },
    {
      say: t.subtractDown(work, product, remainder),
      rules: [{ row, fromCol: productFrom, toCol: colOf(i) }],
      cells: numberCells(remainder, row + 1, colOf(i), colOf).map((c) => ({ ...c, tone: "remainder" as const })),
    },
  ];
  progress.workRow = row + 1;
  progress.row += 2;
  return steps;
}

/** The step that brings the next digit down (or notes it is already beside the working number). */
function nextDigitStep(t: Phrases, lay: Layout, progress: Progress, i: number): Step {
  const { digits, colOf } = lay;
  const next = digits[i + 1];
  const isZeroAdded = i + 1 >= lay.intLength + lay.fracLength;
  const joined = progress.work * 10 + next;
  // Nothing subtracted yet: the next digit is already beside it in the dividend.
  return progress.workRow === 1
    ? { say: t.includeNext(isZeroAdded, next, joined), focus: [{ row: 1, col: colOf(i + 1) }] }
    : {
        say: t.bringDown(isZeroAdded, next, joined),
        cells: [{ row: progress.workRow, col: colOf(i + 1), text: String(next), tone: "carry" }],
        focus: [{ row: 1, col: colOf(i + 1) }],
      };
}

/** Works through the digits one at a time. Returns the steps, the quotient's digits and what is left over. */
function workThrough(t: Phrases, lay: Layout): { steps: Step[]; quotientDigits: Progress["quotientDigits"]; remainder: number } {
  const { digits, divisor, colOf, pointAt, showPoint, pointCol } = lay;
  const steps: Step[] = [];
  const progress: Progress = { started: false, work: 0, row: 2, workRow: 1, quotientDigits: [] };
  const firstGroupStart = 0;

  for (let i = 0; i < digits.length; i++) {
    progress.work = progress.work * 10 + digits[i];
    const isLastIntegerDigit = i === pointAt - 1;

    if (!progress.started && progress.work < divisor && !isLastIntegerDigit && i < digits.length - 1) {
      steps.push({ say: t.tooSmall(progress.work, divisor), focus: range(firstGroupStart, i).map((k) => ({ row: 1, col: colOf(k) })) });
      continue;
    }

    // Crossing the decimal point: the quotient gets its point here.
    if (showPoint && i === pointAt && !progress.quotientDigits.some((q) => q.col === pointCol)) {
      steps.push({ say: t.pointInQuotient, cells: [{ row: 0, col: pointCol, text: ".", tone: "quotient" }] });
    }

    const q = Math.floor(progress.work / divisor);
    const remainder = progress.work - q * divisor;
    const focusWork = progress.started
      ? numberCells(progress.work, progress.workRow, colOf(i), colOf).map((c) => ({ row: c.row, col: c.col }))
      : range(firstGroupStart, i).map((k) => ({ row: 1, col: colOf(k) }));
    steps.push(...digitSteps(t, lay, progress, q, focusWork, i));
    progress.work = remainder;

    if (i < digits.length - 1) steps.push(nextDigitStep(t, lay, progress, i));
  }
  return { steps, quotientDigits: progress.quotientDigits, remainder: progress.work };
}

export function longDivision(dividendText: string, divisorText: string, decimals: boolean, language?: Narration): WorkedExample | null {
  const lay = layoutFor(dividendText, divisorText, decimals);
  if (!lay) return null;
  const t = phrases(language);
  const { dividendIn, divisorIn, divisor, digits, pointAt, showPoint, pointCol, lastCol, hasDecimals } = lay;
  const original = `${dividendIn} ÷ ${divisorIn}`;

  const { steps: working, quotientDigits, remainder: remainderFinal } = workThrough(t, lay);
  const steps = [...openingSteps(t, lay), ...working];

  // The quotient as read from the board.
  const quotientText = formatQuotient(quotientDigits, showPoint ? pointCol : null);
  let answer: string;
  if (remainderFinal === 0) {
    answer = `${original} = ${quotientText}`;
    steps.push({ say: t.exact(original, quotientText) });
  } else if (hasDecimals) {
    answer = t.approxAnswer(original, quotientText, digits.length - pointAt);
    steps.push({ say: t.stopDecimals(digits.length - pointAt, original, quotientText) });
  } else {
    answer = t.remainderAnswer(original, quotientText, remainderFinal);
    steps.push({ say: t.remainderEnd(quotientText, remainderFinal) });
  }
  if (!hasDecimals) {
    steps.push({ say: t.divisionCheck(quotientText, divisor, remainderFinal, Number(quotientText) * divisor + remainderFinal) });
  }

  const allCells = steps.flatMap((s) => s.cells ?? []);
  return {
    problem: { kind: "division", dividend: dividendIn, divisor: divisorIn, decimals, ...savedLanguage(language) },
    title: t.divisionTitle(original),
    rows: Math.max(...allCells.map((c) => c.row)) + 1,
    cols: lastCol + 1,
    colWidths: Array.from({ length: lastCol + 1 }, (_, c) => (showPoint && c === pointCol ? 0.5 : 1)),
    steps,
    answer,
  };
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

/** A number written right-aligned so its last digit is in `endCol` (skipping the decimal point column). */
function numberCells(value: number, row: number, endCol: number, colOf: (i: number) => number): Cell[] {
  const text = String(value);
  // Map columns right to left using digit positions: find the digit index for endCol.
  const cols: number[] = [];
  let index = 0;
  while (colOf(index) < endCol) index++;
  for (let k = 0; k < text.length; k++) cols.unshift(colOf(index - k));
  return text.split("").map((ch, k) => ({ row, col: cols[k], text: ch }));
}

function formatQuotient(digits: { col: number; digit: number }[], pointCol: number | null): string {
  const sorted = [...digits].sort((a, b) => a.col - b.col);
  let text = "";
  for (const d of sorted) {
    if (pointCol !== null && d.col > pointCol && !text.includes(".")) text += text ? "." : "0.";
    text += String(d.digit);
  }
  return text.replace(/^0+(?=\d)/, "") || "0";
}

