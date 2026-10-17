// Spots calculations a worked example can solve inside a question: "Divide
// 5255 by 5", "945 ÷ 7", "Find the LCM of 12, 18 and 30", "12 और 18 का
// म.स.प.", "१२, १८ चा ल.सा.वि." A question that is nothing but one such
// calculation is answered by code alone, with no AI.

import { longDivision, cleanNumber } from "@/lib/worked/division";
import { lcmHcf } from "@/lib/worked/lcm-hcf";
import { columnAddition, columnSubtraction } from "@/lib/worked/column";
import { longMultiplication } from "@/lib/worked/multiplication";
import type { WorkedExample, WorkedProblem } from "@/lib/worked/types";

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const asciiDigits = (text: string) => text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

const N = String.raw`\d[\d,]*(?:\.\d+)?|\.\d+`;
const DIVISION = [
  new RegExp(String.raw`\bdivide\s+(${N})\s+by\s+(${N})`, "i"),
  new RegExp(String.raw`(${N})\s*(?:÷|divided\s+by)\s*(${N})`, "i"),
  // Hindi: "5255 को 5 से भाग दीजिए"; Marathi: "5255 ला 5 ने भागा"
  new RegExp(String.raw`(${N})\s*को\s*(${N})\s*से\s*भाग`),
  new RegExp(String.raw`(${N})\s*(?:ला|यास)\s*(${N})\s*ने\s*भाग`),
];
const DECIMALS = /decimal|दशमलव|दशांश/i;

// A number standing on its own (not part of "5d", "x2" or "1.2.3").
const B = (n: string) => String.raw`(?<![\w.])(${n})(?![\w])`;
const ADDITION = [
  new RegExp(String.raw`${B(N)}(?:\s*\+\s*(?:${N})(?![\w])){1,3}`),
  new RegExp(String.raw`\b(?:add|sum of)\s+((?:${N})(?:\s*,\s*(?:${N}))*\s+and\s+(?:${N}))`, "i"),
  new RegExp(String.raw`(${N})\s*(?:और|तथा)\s*(${N})\s*(?:को\s*)?जोड़`),
  new RegExp(String.raw`(${N})\s*(?:आणि|व)\s*(${N})\s*(?:यांची\s*)?बेरीज`),
];
// [pattern, index of the number taken away from, index of the number taken away]
const SUBTRACTION: [RegExp, number, number][] = [
  [new RegExp(String.raw`${B(N)}\s+[-–]\s+${B(N)}`), 1, 2],
  [new RegExp(String.raw`${B(N)}\s*−\s*${B(N)}`), 1, 2],
  [new RegExp(String.raw`\bsubtract\s+(${N})\s+from\s+(${N})`, "i"), 2, 1],
  [new RegExp(String.raw`(${N})\s*में\s*से\s*(${N})\s*घटा`), 1, 2],
  [new RegExp(String.raw`(${N})\s*मधून\s*(${N})\s*वजा`), 1, 2],
];
const DIFFERENCE = new RegExp(String.raw`\bdifference between\s+(${N})\s+and\s+(${N})`, "i");
const MULTIPLICATION = [
  new RegExp(String.raw`${B(N)}\s*[×✕]\s*${B(N)}`),
  new RegExp(String.raw`${B(N)}\s+[x*]\s+${B(N)}`),
  new RegExp(String.raw`\b(?:multiply\s+(${N})\s+(?:by|and|with)|product of\s+(${N})\s+and)\s+(${N})`, "i"),
  new RegExp(String.raw`(${N})\s*को\s*(${N})\s*से\s*गुणा`),
  new RegExp(String.raw`(${N})\s*(?:ला|यास)\s*(${N})\s*ने\s*गुण`),
];
const OPERATOR_AFTER = /^\s*[+\-−–×✕x*÷/^]\s*\d/;
const OPERATOR_BEFORE = /\d\s*[+\-−–×✕x*÷/^]\s*$/;

/** True when a match is part of a longer expression ("12 + 5 × 3"), which needs BODMAS, not one method. */
function partOfLongerExpression(line: string, m: RegExpMatchArray): boolean {
  const before = line.slice(0, m.index);
  const after = line.slice((m.index ?? 0) + m[0].length);
  return OPERATOR_BEFORE.test(before) || OPERATOR_AFTER.test(after);
}

const numbersIn = (text: string) => [...text.matchAll(new RegExp(N, "g"))].map((x) => cleanNumber(x[0])).filter((x): x is string => Boolean(x));

const LCM_WORDS = String.raw`l\.?\s?c\.?\s?m\.?|lowest common multiple|least common multiple|ल\.?\s?स\.?\s?प\.?|लघुत्तम समापवर्त्य|ल\.?\s?सा\.?\s?वि\.?|लसावि`;
const HCF_WORDS = String.raw`h\.?\s?c\.?\s?f\.?|g\.?\s?c\.?\s?d\.?|highest common factor|greatest common (?:divisor|factor)|म\.?\s?स\.?\s?प\.?|महत्तम समापवर्तक|म\.?\s?सा\.?\s?वि\.?|मसावि`;
const LCM_RE = new RegExp(String.raw`(?<![a-z])(?:${LCM_WORDS})(?![a-z])`, "i");
const HCF_RE = new RegExp(String.raw`(?<![a-z])(?:${HCF_WORDS})(?![a-z])`, "i");

export interface FoundProblem {
  problem: WorkedProblem;
  /** The words in the question that asked for it. */
  match: string;
}

/** Every calculation in the text that a worked example can show, in order, without repeats. */
export function findProblems(textIn: string): FoundProblem[] {
  const text = asciiDigits(textIn);
  const found: FoundProblem[] = [];
  const seen = new Set<string>();
  const add = (problem: WorkedProblem, match: string) => {
    const key = JSON.stringify(problem);
    if (!seen.has(key) && solve(problem)) {
      seen.add(key);
      found.push({ problem, match });
    }
  };

  for (const line of text.split(/\n|[?।]/)) {
    for (const pattern of DIVISION) {
      for (const m of line.matchAll(new RegExp(pattern.source, pattern.flags + "g"))) {
        const dividend = cleanNumber(m[1]);
        const divisor = cleanNumber(m[2]);
        if (dividend && divisor && Number(divisor) !== 0 && !partOfLongerExpression(line, m)) {
          add({ kind: "division", dividend, divisor, decimals: DECIMALS.test(line) }, m[0]);
        }
      }
    }

    for (const pattern of ADDITION) {
      for (const m of line.matchAll(new RegExp(pattern.source, pattern.flags + "g"))) {
        if (partOfLongerExpression(line, m)) continue;
        // "add 12, 5 and 3" / "12 + 5 + 3": every number in the match.
        const numbers = numbersIn(m[0]);
        if (numbers.length >= 2) add({ kind: "column", op: "add", numbers: numbers.slice(0, 4) }, m[0]);
      }
    }
    for (const [pattern, from, take] of SUBTRACTION) {
      for (const m of line.matchAll(new RegExp(pattern.source, pattern.flags + "g"))) {
        if (partOfLongerExpression(line, m)) continue;
        const a = cleanNumber(m[from]);
        const b = cleanNumber(m[take]);
        if (a && b) add({ kind: "column", op: "subtract", numbers: [a, b] }, m[0]);
      }
    }
    for (const m of line.matchAll(new RegExp(DIFFERENCE.source, "gi"))) {
      const [a, b] = [cleanNumber(m[1]), cleanNumber(m[2])];
      if (a && b) add({ kind: "column", op: "subtract", numbers: Number(a) >= Number(b) ? [a, b] : [b, a] }, m[0]);
    }
    for (const pattern of MULTIPLICATION) {
      for (const m of line.matchAll(new RegExp(pattern.source, pattern.flags + "g"))) {
        if (partOfLongerExpression(line, m)) continue;
        const [a, b] = numbersIn(m[0]);
        if (a && b) add({ kind: "multiplication", a, b }, m[0]);
      }
    }

    const wantsLcm = LCM_RE.test(line);
    const wantsHcf = HCF_RE.test(line);
    if (wantsLcm || wantsHcf) {
      const keyword = (wantsLcm ? LCM_RE : HCF_RE).exec(line)!;
      // Numbers after the keyword ("LCM of 12, 18 and 30"), else before it ("12 और 18 का ल.स.प.").
      // Stop at "is"/"=" ("the LCM of 4 and 6 is 12" asks about 4 and 6 only).
      const after = line.slice(keyword.index + keyword[0].length).split(/\b(?:is|are|was|equals)\b|=|है|आहे/)[0];
      const before = line.slice(0, keyword.index);
      const numbersIn = (s: string) => [...s.matchAll(/\d[\d,]*/g)].map((x) => Number(x[0].replace(/,/g, ""))).filter((n) => n > 0);
      let numbers = numbersIn(after);
      if (numbers.length < 2) numbers = numbersIn(before);
      if (numbers.length >= 2) {
        const want = wantsLcm && wantsHcf ? "both" : wantsLcm ? "lcm" : "hcf";
        add({ kind: "lcm-hcf", numbers: numbers.slice(0, 6), want }, line.trim());
      }
    }
  }
  return found;
}

// Words that only frame a calculation ("Find the LCM of...", "using long division").
const FILLER = new Set(
  `find the of and using use by long division method show steps step working work out what is are please solve
   divide calculate answer in into upto up to places place decimal decimals a an following numbers number give
   write get its their with lcm hcf gcd lowest least highest greatest common multiple factor divisor prime
   factorisation factorization ladder q ques question add sum subtract difference between from multiply product
   times plus minus total column vertical x
   जोड़िए जोड़ो जोड़ें घटाइए घटाओ घटाएँ गुणा में
   बेरीज वजाबाकी गुणाकार मधून वजा यांची
   ज्ञात कीजिए करें करो का की के और तथा से को भाग दीजिए दो निकालिए दशमलव तक स्थान ला यास
   काढा चा ची चे आणि व ने भागा करा शोधा दशांश पर्यंत`.split(/\s+/)
);

/**
 * The one calculation a question asks for, when that is all it asks: then a
 * worked example is the whole answer and no AI is needed.
 */
export function pureProblem(question: string): WorkedProblem | null {
  const found = findProblems(question);
  if (found.length !== 1) return null;
  const leftover = asciiDigits(question)
    .toLowerCase()
    .replace(new RegExp(LCM_WORDS, "gi"), " ")
    .replace(new RegExp(HCF_WORDS, "gi"), " ")
    .replace(/[\d.,]+/g, " ")
    .replace(/[^\p{L}\p{M}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return leftover.every((w) => FILLER.has(w)) ? found[0].problem : null;
}

/** Works out a problem; null if it's out of range (too many digits, dividing by zero...). */
export function solve(problem: WorkedProblem): WorkedExample | null {
  switch (problem.kind) {
    case "division":
      return longDivision(problem.dividend, problem.divisor, problem.decimals);
    case "lcm-hcf":
      return lcmHcf(problem.numbers, problem.want);
    case "column":
      return problem.op === "add"
        ? columnAddition(problem.numbers)
        : columnSubtraction(problem.numbers[0], problem.numbers[1]);
    case "multiplication":
      return longMultiplication(problem.a, problem.b);
  }
}

/** A worked example as Markdown, for saving, Copy and the PDF. */
export function workedToMarkdown(example: WorkedExample): string {
  return [
    `**Answer:** ${example.answer}`,
    "## Steps",
    example.steps.map((s, i) => `${i + 1}. ${s.say}`).join("\n"),
    "*Worked out step by step by Syllabi's calculator (no AI).*",
  ].join("\n\n");
}
