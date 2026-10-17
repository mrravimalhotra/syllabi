// Spots calculations a worked example can solve inside a question: "Divide
// 5255 by 5", "945 ÷ 7", "Find the LCM of 12, 18 and 30", "12 और 18 का
// म.स.प.", "१२, १८ चा ल.सा.वि." A question that is nothing but one such
// calculation is answered by code alone, with no AI.

import { longDivision, cleanNumber } from "@/lib/worked/division";
import { lcmHcf } from "@/lib/worked/lcm-hcf";
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
        if (dividend && divisor && Number(divisor) !== 0) {
          add({ kind: "division", dividend, divisor, decimals: DECIMALS.test(line) }, m[0]);
        }
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
   factorisation factorization ladder q ques question
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
