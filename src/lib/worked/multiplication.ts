// Long multiplication as taught in school: multiply the top number by each
// digit of the bottom number (ones first, then tens with a 0 placeholder...),
// then add the partial products. Decimals are multiplied as whole numbers and
// the decimal point placed at the end by counting decimal places.

import type { Cell, Step, WorkedExample } from "@/lib/worked/types";
import { cleanNumber } from "@/lib/worked/division";
import { phrases, savedLanguage, type Narration } from "@/lib/worked/say";

const MAX_TOP_DIGITS = 8;
const MAX_BOTTOM_DIGITS = 4;

export function longMultiplication(aIn: string, bIn: string, language?: Narration): WorkedExample | null {
  const t = phrases(language);
  const a0 = cleanNumber(aIn);
  const b0 = cleanNumber(bIn);
  if (!a0 || !b0) return null;
  const decimalsA = a0.split(".")[1]?.length ?? 0;
  const decimalsB = b0.split(".")[1]?.length ?? 0;
  const aDigits = a0.replace(".", "").replace(/^0+(?=\d)/, "");
  const bDigits = b0.replace(".", "").replace(/^0+(?=\d)/, "");
  // The longer number goes on top.
  const [top, bottom] = aDigits.length >= bDigits.length ? [aDigits, bDigits] : [bDigits, aDigits];
  if (top.length > MAX_TOP_DIGITS || bottom.length > MAX_BOTTOM_DIGITS) return null;

  const a = BigInt(top);
  const b = BigInt(bottom);
  const product = a * b;
  const width = Math.max(String(product).length, top.length + 1, bottom.length + 1) + 1;
  // Right-aligned: digit position from the right (0 = ones) → column.
  const colFromRight = (k: number) => width - 1 - k;
  const cellsOf = (text: string, row: number, tone: Cell["tone"], shift = 0): Cell[] =>
    text.split("").map((d, i) => ({ row, col: colFromRight(text.length - 1 - i + shift), text: d, tone }));

  const steps: Step[] = [];
  const decimals = decimalsA + decimalsB;
  if (decimals > 0) {
    steps.push({ say: t.multiplyIgnoringPoints(top, bottom, decimals) });
  }
  steps.push({
    say: t.multiplicationSetup(top, bottom),
    cells: [...cellsOf(top, 0, "given"), ...cellsOf(bottom, 1, "given"), { row: 1, col: 0, text: "×", tone: "given" }],
    rules: [{ row: 1, fromCol: 0, toCol: width - 1 }],
  });

  const partials: bigint[] = [];
  const bottomDigits = bottom.split("").reverse().map(Number);
  bottomDigits.forEach((digit, k) => {
    const row = 2 + k;
    const place = t.integerPlaces[k];
    if (k > 0) {
      steps.push({
        say: t.placeholder(place, digit, k),
        cells: Array.from({ length: k }, (_, z) => ({ row, col: colFromRight(z), text: "0", tone: "muted" as const })),
        focus: [{ row: 1, col: colFromRight(k) }],
      });
    }
    let carry = 0;
    const topDigits = top.split("").reverse().map(Number);
    const written: Cell[] = [];
    topDigits.forEach((d, i) => {
      const value = d * digit + carry;
      const write = i === topDigits.length - 1 ? String(value) : String(value % 10);
      const newCarry = i === topDigits.length - 1 ? 0 : Math.floor(value / 10);
      const cells = cellsOf(write, row, "product", i + k);
      written.push(...cells);
      steps.push({
        say: t.multiplyDigit(digit, d, carry, value, i === topDigits.length - 1, newCarry),
        cells,
        focus: [
          { row: 0, col: colFromRight(i) },
          { row: 1, col: colFromRight(k) },
        ],
      });
      carry = newCarry;
    });
    const partial = a * BigInt(digit) * BigInt(10) ** BigInt(k);
    partials.push(partial);
  });

  const lastPartialRow = 1 + bottomDigits.length;
  if (bottomDigits.length > 1) {
    steps.push({
      say: t.addPartials(partials.map(String), String(product)),
      cells: [{ row: lastPartialRow, col: 0, text: "+", tone: "given" }, ...cellsOf(String(product), lastPartialRow + 1, "result")],
      rules: [{ row: lastPartialRow, fromCol: 0, toCol: width - 1 }],
    });
  }

  // Put the decimal point back.
  const digits = String(product).padStart(decimals + 1, "0");
  const result = decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`.replace(/\.?0+$/, "") || "0" : digits;
  if (decimals > 0) {
    steps.push({ say: t.placePoint(decimals, String(product), result) });
  }
  const sentence = `${a0} × ${b0} = ${result}`;
  steps.push({ say: t.so(sentence) });

  const allCells = steps.flatMap((s) => s.cells ?? []);
  return {
    problem: { kind: "multiplication", a: a0, b: b0, ...savedLanguage(language) },
    title: t.multiplicationTitle(`${a0} × ${b0}`),
    rows: Math.max(...allCells.map((c) => c.row)) + 1,
    cols: width,
    steps,
    answer: sentence,
  };
}
