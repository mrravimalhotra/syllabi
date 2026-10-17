// Metric conversions by the place-value chart taught in school: write the
// number with its ones digit under the unit it is in, fill empty places with
// zeros, then read it with the ones digit under the new unit. The chart makes
// "multiply by 1000" and "divide by 100" visible instead of a rule to recall.

import type { Cell, Step, WorkedExample } from "@/lib/worked/types";
import { cleanNumber } from "@/lib/worked/division";
import { phrases, savedLanguage, type Narration } from "@/lib/worked/say";

const MAX_DIGITS = 10;
const MAX_COLUMNS = 14;

const PREFIXES = ["k", "h", "da", "", "d", "c", "m"];
const FAMILIES = ["m", "g", "l"];

/** "km" → { family: "m", index: 0 }; null for anything not on the chart. */
function place(unit: string): { family: string; index: number } | null {
  for (const family of FAMILIES) {
    const index = PREFIXES.findIndex((p) => p + family === unit);
    if (index >= 0) return { family, index };
  }
  return null;
}

const label = (index: number, family: string) => (index >= 0 && index < PREFIXES.length ? PREFIXES[index] + family : "");
const POWERS = ["1", "10", "100", "1000", "10000", "100000", "1000000"];

export function convertUnits(valueIn: string, from: string, to: string, language?: Narration): WorkedExample | null {
  const t = phrases(language);
  const value = cleanNumber(valueIn);
  const a = place(from);
  const b = place(to);
  if (!value || !a || !b || a.family !== b.family || a.index === b.index) return null;
  const [intPart, fracPart = ""] = value.split(".");
  const int = intPart.replace(/^0+(?=\d)/, "") || "0";
  if (int.length + fracPart.length > MAX_DIGITS) return null;

  // Chart positions: digit i of the integer part sits (int.length - 1 - i) places left of `from`.
  const digits = [
    ...int.split("").map((d, i) => ({ d, at: a.index - (int.length - 1 - i) })),
    ...fracPart.split("").map((d, j) => ({ d, at: a.index + 1 + j })),
  ];
  const written = digits;
  const lo = Math.min(0, b.index, ...written.map((x) => x.at));
  const hi = Math.max(PREFIXES.length - 1, b.index, ...written.map((x) => x.at));
  if (hi - lo + 1 > MAX_COLUMNS) return null;
  const col = (at: number) => at - lo;

  // Empty places between the digits and the new ones place are filled with 0.
  const filled = new Map(written.map((x) => [x.at, x.d]));
  const first = Math.min(...written.map((x) => x.at), b.index);
  const last = Math.max(...written.map((x) => x.at), b.index);
  const zeros: number[] = [];
  for (let at = first; at <= last; at++) if (!filled.has(at)) zeros.push(at);
  for (const at of zeros) filled.set(at, "0");

  // Read the number with the ones digit under `to`.
  let resultInt = "";
  let resultFrac = "";
  for (let at = first; at <= last; at++) {
    if (at <= b.index) resultInt += filled.get(at);
    else resultFrac += filled.get(at);
  }
  resultInt = resultInt.replace(/^0+(?=\d)/, "") || "0";
  resultFrac = resultFrac.replace(/0+$/, "");
  const result = resultFrac ? `${resultInt}.${resultFrac}` : resultInt;

  const steps: Step[] = [];
  const labels: Cell[] = [];
  for (let at = lo; at <= hi; at++) {
    const text = label(at, a.family);
    if (text) labels.push({ row: 0, col: col(at), text, tone: "divisor", small: true });
  }
  const width = hi - lo + 1;
  steps.push({
    say: t.chart(t.families[a.family], PREFIXES.map((p) => p + a.family).join(", ")),
    cells: labels,
    rules: [{ row: 0, fromCol: 0, toCol: width - 1 }],
    vlines: Array.from({ length: width - 1 }, (_, i) => ({ col: i + 1, fromRow: 0, toRow: 1 })),
  });

  const onesDigit = digits.find((x) => x.at === a.index)!.d;
  steps.push({
    say: t.writeOnChart(value, onesDigit, from, fracPart.length > 0),
    cells: written.map((x) => ({ row: 1, col: col(x.at), text: x.d, tone: "given" as const })),
    focus: [{ row: 1, col: col(a.index) }],
  });
  if (zeros.length) {
    steps.push({
      say: t.fillZeros(to),
      cells: zeros.map((at) => ({ row: 1, col: col(at), text: "0", tone: "muted" as const })),
    });
  }
  const places = Math.abs(b.index - a.index);
  const bigger = b.index > a.index;
  steps.push({
    say: t.readChart(to, result, from, places, bigger, POWERS[places]),
    cells: [
      { row: 1, col: col(b.index), text: filled.get(b.index)!, tone: "result" },
      { row: 2, col: 0, text: `= ${result} ${to}`, tone: "result" },
    ],
    focus: [{ row: 0, col: col(b.index) }],
  });
  const answer = `${value} ${from} = ${result} ${to}`;
  steps.push({ say: t.so(answer) });

  return {
    problem: { kind: "convert", value, from, to, ...savedLanguage(language) },
    title: t.convertTitle(from, to, value),
    rows: 3,
    cols: width,
    colWidths: Array.from({ length: width }, () => 2),
    steps,
    answer,
  };
}

/** Unit words and symbols (English, Hindi, Marathi) → chart symbol. */
const UNIT_NAMES: [string, string][] = [];
const NAMES: Record<string, string[]> = {
  km: ["km", "kms", "kilometre", "kilometres", "kilometer", "kilometers", "किलोमीटर", "किमी", "कि.मी."],
  hm: ["hm", "hectometre", "hectometres", "hectometer", "hectometers", "हेक्टोमीटर"],
  dam: ["dam", "decametre", "decametres", "decameter", "decameters", "dekametre", "dekameter", "डेकामीटर"],
  m: ["m", "metre", "metres", "meter", "meters", "मीटर"],
  dm: ["dm", "decimetre", "decimetres", "decimeter", "decimeters", "डेसीमीटर", "डेसिमीटर"],
  cm: ["cm", "cms", "centimetre", "centimetres", "centimeter", "centimeters", "सेंटीमीटर", "सेंटिमीटर", "सेमी", "से.मी."],
  mm: ["mm", "millimetre", "millimetres", "millimeter", "millimeters", "मिलीमीटर", "मिलिमीटर", "मिमी", "मि.मी."],
  kg: ["kg", "kgs", "kilogram", "kilograms", "kilogramme", "kilogrammes", "किलोग्राम", "किग्रा", "किलोग्रॅम", "कि.ग्रॅ."],
  hg: ["hg", "hectogram", "hectograms", "हेक्टोग्राम", "हेक्टोग्रॅम"],
  dag: ["dag", "decagram", "decagrams", "dekagram", "डेकाग्राम", "डेकाग्रॅम"],
  g: ["g", "gm", "gms", "gram", "grams", "gramme", "grammes", "ग्राम", "ग्रॅम"],
  dg: ["dg", "decigram", "decigrams", "डेसीग्राम", "डेसिग्रॅम"],
  cg: ["cg", "centigram", "centigrams", "सेंटीग्राम", "सेंटिग्रॅम"],
  mg: ["mg", "milligram", "milligrams", "मिलीग्राम", "मिलिग्रॅम"],
  kl: ["kl", "kilolitre", "kilolitres", "kiloliter", "kiloliters", "किलोलीटर", "किलोलिटर"],
  hl: ["hl", "hectolitre", "hectolitres", "hectoliter", "hectoliters", "हेक्टोलीटर", "हेक्टोलिटर"],
  dal: ["dal", "decalitre", "decalitres", "decaliter", "decaliters", "डेकालीटर", "डेकालिटर"],
  l: ["l", "litre", "litres", "liter", "liters", "ltr", "ltrs", "लीटर", "लिटर"],
  dl: ["dl", "decilitre", "decilitres", "deciliter", "deciliters", "डेसीलीटर", "डेसिलिटर"],
  cl: ["cl", "centilitre", "centilitres", "centiliter", "centiliters", "सेंटीलीटर", "सेंटिलिटर"],
  ml: ["ml", "millilitre", "millilitres", "milliliter", "milliliters", "मिलीलीटर", "मिलिलिटर", "मिली", "मि.ली."],
};
for (const [symbol, names] of Object.entries(NAMES)) for (const n of names) UNIT_NAMES.push([n.toLowerCase(), symbol]);
// Longest first, so "km" wins over "m" and "मिलीलीटर" over "मिली".
UNIT_NAMES.sort((x, y) => y[0].length - x[0].length);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Any unit word, as a regex alternation (not inside a longer word). */
export const UNIT_WORDS = `(?<![\\p{L}\\p{M}])(?:${UNIT_NAMES.map(([n]) => escape(n)).join("|")})(?![\\p{L}\\p{M}])`;

export function unitSymbol(word: string): string | null {
  const w = word.toLowerCase().trim();
  return UNIT_NAMES.find(([n]) => n === w)?.[1] ?? null;
}
