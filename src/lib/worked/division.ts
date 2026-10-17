// Long division, worked the way Indian school books teach it: quotient above
// the dividend, then divide, multiply, subtract, bring down, step by step.
// Handles remainders, zeros inside the quotient, decimal dividends, decimal
// divisors (both numbers are first multiplied by 10, 100...) and, when asked,
// continuing into decimal places.

import type { Cell, Rule, Step, VLine, WorkedExample } from "@/lib/worked/types";

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

export function longDivision(dividendText: string, divisorText: string, decimals: boolean): WorkedExample | null {
  const dividendIn = cleanNumber(dividendText);
  const divisorIn = cleanNumber(divisorText);
  if (!dividendIn || !divisorIn) return null;

  const steps: Step[] = [];
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
  const pointAt = intPart.length; // digits before the decimal point
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
  const addedZeros = digits.length - (intPart.length + fracPart.length);

  // Layout: divisor in columns 0..L-1, dividend from column L; the decimal
  // point (if any) gets a column of its own.
  const L = divisorStr.length;
  const colOf = (i: number) => L + i + (showPoint && i >= pointAt ? 1 : 0);
  const pointCol = L + pointAt;
  const lastCol = colOf(digits.length - 1);

  const dividendCells: Cell[] = digits.map((d, i) => ({
    row: 1,
    col: colOf(i),
    text: String(d),
    tone: i >= intPart.length + fracPart.length ? "muted" : "given",
  }));
  if (showPoint) dividendCells.push({ row: 1, col: pointCol, text: ".", tone: "given" });
  const divisorCells: Cell[] = divisorStr.split("").map((d, i) => ({ row: 1, col: i, text: d, tone: "divisor" }));

  const original = `${dividendIn} ÷ ${divisorIn}`;
  if (divisorPlaces > 0) {
    const factor = 10 ** divisorPlaces;
    steps.push({
      say: `The divisor ${divisorIn} is a decimal. Multiply both numbers by ${factor} so the divisor becomes a whole number: ${original} is the same as ${dividendStr} ÷ ${divisorStr}.`,
    });
  }
  steps.push({
    say: `Let's divide ${dividendStr} by ${divisorStr}. Write ${dividendStr} inside the division bracket and ${divisorStr} outside it.`,
    cells: [...divisorCells, ...dividendCells.filter((c) => c.tone !== "muted")],
    rules: [{ row: 0, fromCol: L, toCol: lastCol }],
    vlines: [{ col: L, fromRow: 1, toRow: 1 }],
  });
  if (addedZeros > 0) {
    steps.push({
      say: `We will keep dividing after the decimal point, so we write zeros after ${dividendIn.includes(".") ? "the last digit" : "a decimal point"}. Adding zeros after the decimal point does not change the number.`,
      cells: dividendCells.filter((c) => c.tone === "muted" || c.text === "."),
    });
  }

  const quotientDigits: { col: number; digit: number }[] = [];
  let started = false;
  let work = 0;
  let row = 2; // next row for a product
  let workRow = 1; // the row where the current working number sits
  const firstGroupStart = 0;

  for (let i = 0; i < digits.length; i++) {
    work = work * 10 + digits[i];
    const isLastIntegerDigit = i === pointAt - 1;

    if (!started && work < divisor && !isLastIntegerDigit && i < digits.length - 1) {
      steps.push({
        say: `${work} is smaller than ${divisor}, so ${divisor} does not go into it. Take the next digit too.`,
        focus: range(firstGroupStart, i).map((k) => ({ row: 1, col: colOf(k) })),
      });
      continue;
    }

    // Crossing the decimal point: the quotient gets its point here.
    if (showPoint && i === pointAt && !quotientDigits.some((q) => q.col === pointCol)) {
      steps.push({
        say: "We have reached the decimal point, so put a decimal point in the quotient, right above it.",
        cells: [{ row: 0, col: pointCol, text: ".", tone: "quotient" }],
      });
    }

    const q = Math.floor(work / divisor);
    const product = q * divisor;
    const remainder = work - product;
    const focusWork = started
      ? numberCells(work, workRow, colOf(i), colOf).map((c) => ({ row: c.row, col: c.col }))
      : range(firstGroupStart, i).map((k) => ({ row: 1, col: colOf(k) }));

    if (q === 0) {
      started = true;
      steps.push({
        say: `${divisor} does not go into ${work}, so write 0 in the quotient.`,
        cells: [{ row: 0, col: colOf(i), text: "0", tone: "quotient" }],
        focus: focusWork,
      });
      quotientDigits.push({ col: colOf(i), digit: 0 });
    } else {
      started = true;
      const productCells = numberCells(product, row, colOf(i), colOf);
      const productFrom = Math.min(...productCells.map((c) => c.col));
      steps.push({
        say: `How many times does ${divisor} go into ${work}? ${q} time${q === 1 ? "" : "s"}, because ${q} × ${divisor} = ${product}${q < 9 ? ` and ${q + 1} × ${divisor} = ${(q + 1) * divisor} is too big` : ""}. Write ${q} in the quotient.`,
        cells: [{ row: 0, col: colOf(i), text: String(q), tone: "quotient" }],
        focus: focusWork,
      });
      quotientDigits.push({ col: colOf(i), digit: q });
      steps.push({
        say: `Multiply: ${q} × ${divisor} = ${product}. Write ${product} under ${work}.`,
        cells: productCells.map((c) => ({ ...c, tone: "product" as const })),
      });
      steps.push({
        say: `Subtract: ${work} − ${product} = ${remainder}.`,
        rules: [{ row, fromCol: productFrom, toCol: colOf(i) }],
        cells: numberCells(remainder, row + 1, colOf(i), colOf).map((c) => ({ ...c, tone: "remainder" as const })),
      });
      workRow = row + 1;
      row += 2;
    }
    work = remainder;

    if (i < digits.length - 1) {
      const next = digits[i + 1];
      const isZeroAdded = i + 1 >= intPart.length + fracPart.length;
      // Nothing subtracted yet: the next digit is already beside it in the dividend.
      steps.push(
        workRow === 1
          ? {
              say: `Now include the next ${isZeroAdded ? "zero" : "digit"}, ${next}: we have ${work * 10 + next}.`,
              focus: [{ row: 1, col: colOf(i + 1) }],
            }
          : {
              say: `Bring down the next ${isZeroAdded ? "zero" : "digit"}, ${next}. Now we have ${work * 10 + next}.`,
              cells: [{ row: workRow, col: colOf(i + 1), text: String(next), tone: "carry" }],
              focus: [{ row: 1, col: colOf(i + 1) }],
            }
      );
    }
  }

  // The quotient as read from the board.
  const quotientText = formatQuotient(quotientDigits, showPoint ? pointCol : null);
  const remainderFinal = work;
  const exact = remainderFinal === 0;
  let answer: string;
  if (exact) {
    answer = `${original} = ${quotientText}`;
    steps.push({
      say: `The remainder is 0, so the division is exact. ${original} = ${quotientText}.`,
    });
  } else if (hasDecimals) {
    answer = `${original} ≈ ${quotientText} (to ${digits.length - pointAt} decimal places)`;
    steps.push({
      say: `The division keeps going, so we stop at ${digits.length - pointAt} decimal places: ${original} is about ${quotientText}.`,
    });
  } else {
    answer = `${original}: quotient ${quotientText}, remainder ${remainderFinal}`;
    steps.push({
      say: `There are no more digits to bring down. The quotient is ${quotientText} and the remainder is ${remainderFinal}.`,
    });
  }
  if (!hasDecimals) {
    steps.push({
      say: `Check: quotient × divisor + remainder = ${quotientText} × ${divisor} + ${remainderFinal} = ${Number(quotientText) * divisor + remainderFinal}, which is the dividend. Correct!`,
    });
  }

  const allCells = steps.flatMap((s) => s.cells ?? []);
  return {
    problem: { kind: "division", dividend: dividendIn, divisor: divisorIn, decimals },
    title: `Long division: ${original}`,
    rows: Math.max(...allCells.map((c) => c.row)) + 1,
    cols: lastCol + 1,
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

export type { Rule, VLine };
