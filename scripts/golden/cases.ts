// Golden-output cases: a few thousand inputs run through the maths, checking
// and question-splitting code. Each result is reduced to a short fingerprint.
// `npm run test:golden` compares them with scripts/golden/expected.json, so a
// refactor that changes any output shows up at once; `-- --update` accepts the
// current outputs as the new expected ones (after an intended change).
import { createHash } from "node:crypto";
import { findProblems, pureProblem, solve, workedToMarkdown } from "@/lib/worked/detect";
import { longDivision } from "@/lib/worked/division";
import { columnAddition, columnSubtraction } from "@/lib/worked/column";
import { fractionExample } from "@/lib/worked/fraction";
import { convertUnits } from "@/lib/worked/units";
import { longMultiplication as multiplicationExample } from "@/lib/worked/multiplication";
import { lcmHcf as lcmHcfExample } from "@/lib/worked/lcm-hcf";
import { checkArithmetic } from "@/lib/checks/arithmetic";
import { checkCoverage, checkSamplePaper } from "@/lib/checks/rules";
import { splitQuestions } from "@/lib/rag/split-questions";
import { ContentBody } from "@/lib/pdf/render";
import type { Narration } from "@/lib/worked/say";

export const cases: Record<string, string> = {};
const record = (name: string, value: unknown) => {
  cases[name] = createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 16);
};
const LANGS: (Narration | undefined)[] = [undefined, "hi", "mr"];
const tag = (l: Narration | undefined) => l ?? "auto";

// ---- Long division ----
const dividends = ["0", "1", "7", "12", "100", "999", "5255", "98765", "1234567", "0.5", "12.75", "1000", "10.05", "000123", "7.", ".5", "abc", "", "99999999999999999999"];
const divisors = ["1", "2", "3", "5", "7", "12", "0.5", "0.25", "13", "100", "0", "999", "1.5"];
for (const a of dividends) for (const b of divisors) for (const dec of [false, true]) for (const l of LANGS) record(`div ${a}/${b} dec=${dec} ${tag(l)}`, longDivision(a, b, dec, l));

// ---- Column addition and subtraction ----
const nums = ["0", "7", "9", "45", "99", "123", "999", "1000", "5.5", "12.75", "0.05", "100.1", "98765", "x"];
for (const a of nums) for (const b of nums) for (const l of LANGS) {
  record(`sub ${a}-${b} ${tag(l)}`, columnSubtraction(a, b, l));
  record(`add ${a}+${b} ${tag(l)}`, columnAddition([a, b], l));
}
for (const list of [["1", "2", "3"], ["999", "1", "10"], ["12.5", "0.75", "100", "3"], ["5"], [], ["1", "2", "3", "4", "5", "6", "7"]]) for (const l of LANGS) record(`add ${list.join("+")} ${tag(l)}`, columnAddition(list, l));

// ---- Multiplication, LCM and HCF ----
const factors = ["0", "1", "7", "12", "15", "99", "123", "1000", "2.5", "0.04", "99999"];
for (const a of factors) for (const b of factors) for (const l of LANGS) record(`mul ${a}x${b} ${tag(l)}`, multiplicationExample(a, b, l));
for (const list of [[12, 18], [12, 18, 30], [7, 13], [1, 1], [0, 5], [100, 75, 50], [24, 36], [17], [6, 9, 15, 21], [1000000, 999999]]) for (const want of ["lcm", "hcf", "both"] as const) for (const l of LANGS) record(`lcmhcf ${list.join(",")} ${want} ${tag(l)}`, lcmHcfExample(list, want, l));

// ---- Fractions and units ----
const fr: [number, number][] = [[1, 2], [2, 4], [12, 18], [5, 3], [7, 7], [0, 5], [1, 0], [-3, 4], [100, 1000], [9, 4], [1, 3], [3, 8]];
for (const a of fr) for (const l of LANGS) record(`simplify ${a} ${tag(l)}`, fractionExample("simplify", [a], l));
for (const a of fr) for (const b of fr) for (const op of ["add", "subtract"] as const) record(`frac ${op} ${a} ${b} auto`, fractionExample(op, [a, b]));
for (const a of [[1, 2], [3, 4], [5, 6]] as [number, number][]) for (const b of [[1, 3], [2, 5], [1, 4]] as [number, number][]) for (const op of ["add", "subtract"] as const) for (const l of LANGS) record(`frac ${op} ${a} ${b} ${tag(l)}`, fractionExample(op, [a, b], l));
const units = ["km", "m", "cm", "mm", "kg", "g", "mg", "l", "ml", "hm", "dam", "dm", "kilometre", "metre", "gram", "litre", "xx", "min", "hours"];
for (const f of units) for (const t of units) for (const v of ["1", "2.5", "0.003", "1250", "0", "x"]) record(`unit ${v}${f}>${t}`, convertUnits(v, f, t));
for (const l of LANGS) for (const [v, f, t] of [["2.5", "km", "m"], ["7500", "g", "kg"], ["3", "l", "ml"], ["45", "cm", "mm"]]) record(`unit ${v}${f}>${t} ${tag(l)}`, convertUnits(v, f, t, l));

// ---- Finding calculations in a question ----
const sentences = [
  "Divide 5255 by 5", "5255 ÷ 5", "What is 12 x 15?", "Multiply 123 by 45", "Find the LCM of 12, 18 and 30", "HCF of 24 and 36", "LCM and HCF of 8 and 12",
  "Add 345 + 678", "345 + 678 + 12", "Subtract 357 from 1000", "1000 - 357", "Simplify 12/18", "1/2 + 1/3", "3/4 - 1/4", "Convert 2.5 km to m", "How many grams in 3 kg?", "5 kg to g",
  "Solve: 12 x 15 and also divide 144 by 12", "Q1. 25 + 75  Q2. 100 - 36  Q3. 8 x 9  Q4. 81 ÷ 9", "Find 7.5 ÷ 2.5", "Divide 10 by 4 and write the answer in decimals",
  "5255 को 5 से भाग दें", "12 और 18 का ल.स.प. निकालिए", "345 + 678 कीजिए", "५२५५ ÷ ५", "12 आणि 18 चा लसावि काढा", "२.५ किमी मीटरमध्ये", "10 ÷ 0", "0 x 0", "What is the capital of France?", "Explain photosynthesis", "", "   ",
  "The 12 x 15 = 180 and 144 ÷ 12 = 12", "x + 5 = 10", "2/0 + 1/2", "100 m to km 3 g to kg 4 l to ml", "Add 1,234 and 5,678", "1,00,000 + 50,000", "99999999999999999999 x 2",
];
for (const text of sentences) for (const l of [undefined, "en", "hi", "mr", "auto"] as (string | undefined)[]) {
  const found = findProblems(text, l);
  record(`find ${text} ${l}`, found);
  record(`pure ${text} ${l}`, pureProblem(text, l));
  for (const f of found) record(`solve ${text} ${l} ${JSON.stringify(f.problem)}`, (() => { const ex = solve(f.problem); return ex ? [ex, workedToMarkdown(ex)] : null; })());
}

// ---- Checking an answer ----
const answers = [
  "8 : 12 = 2 : 3", "8 : 12 = 3 : 2", "5 km = 5000 m", "5 km = 4000 m", "2 hours 15 minutes = 135 minutes", "3 kg = 3000 g and 2 l = 2000 ml", "10 m = 5 kg", "x + 5 = 10", "2x = 6", "Q1 = 5", "Q1 + 2 = 3", "2 x 3 = 6 = 7", "5 = 5", "5 = 6", "-3 + 5 = 2", "(2 + 3) x 4 = 20", "(2 + 3 x 4 = 20", "22/7 = 3.14", "22/7 = 3.1", "2^3 = 8", "2² = 4", "√16 = 4", "√(16) = 5", "25% of 80 = 20", "25% of 80 = 21", "1/0 = 0", "3 x 4 = 12 approximately", "```\n2 + 2 = 5\n```", "about 2 + 2 = 5", "0.1 + 0.2 = 0.30000000000000004", "1 000 + 1 = 1001", "1,000 + 1 = 1001", "7 ÷ 2 = 3.5", "7 / 2 = 3", "3.14159 x 2 = 6.28", "10 - 3 - 2 = 5", "10 - 3 - 2 = 4", "5 + 5 = 10 = 5 x 2", "100 g = 0.1 kg", "1 hour = 60 minutes", "1 hour = 70 minutes", "2 : 4 = 1 : 2 = 3 : 6",
  "12 x 15 = 180", "12 x 15 = 181", "5255 ÷ 5 = 1051", "5255 ÷ 5 = 1050", "345 + 678 = 1023", "345 + 678 = 1024", "1000 - 357 = 643", "1000 - 357 = 644",
  "2/3 + 1/6 = 5/6", "2/3 + 1/6 = 1/2", "Total = 25 + 75 = 100 and 8 x 9 = 72 and 81 / 9 = 9", "10 ÷ 0 = undefined", "0.1 + 0.2 = 0.3", "1.5 x 4 = 6", "7 - 9 = -2", "2 x 3 x 4 = 24", "2 x 3 x 4 = 25",
  "No sums here.", "", "Step 1: 12 x 15 = 180. Step 2: 180 + 20 = 200. Step 3: 200 - 50 = 140.", "99999999 x 99999999 = 9999999800000001", "5 x 5 = 25 (correct) 6 x 6 = 37 (wrong)", "१२ x १५ = १८०",
];
for (const a of answers) record(`arith ${a}`, checkArithmetic(a));
const papers = [
  "Section A\n1. a [1]\n2. b [2]\nSection B\n3. c [3] (a) x [1] (b) y [2]\nAnswer Key\n1. x\n2. y\n3. z", "Q1. [5]\nQ2. [5]\nANSWER KEY\nQ1. yes", "१. प्रश्न [२]\n२. प्रश्न [३]\nउत्तर कुंजी\n१. हाँ\n२. नहीं",
  "1. One [2 marks]\n2. Two [3 marks]\n3. Three [5 marks]\nAnswer Key\n1.\n2.\n3.", "No numbers but an answer key\nAnswer Key\nsomething",
  "Section A\n1. What is 2+2? [1]\n2. Define a noun. [2]\nSection B\n3. Explain. [5]\nAnswer Key\n1. 4\n2. A naming word\n3. ...",
  "1. (a) One (b) Two (2 marks)\n2. Three (3 marks)", "Total marks: 80\nQ1 [40]\nQ2 [40]", "No marks here", "", "Q1. x [10]\nQ2. y [10]\nQ3. z [10]\nQ4. w [10]\nQ5. v [10]\nQ6. u [10]\nQ7. t [10]\nQ8. s [10]",
  "Section A (20 marks)\n1. a [1]\n2. b [1]\n(Answer key follows)\n1. yes\n2. no", "1. [2] 2. [3] 3. [4]",
];
for (const p of papers) for (const total of [null, 5, 20, 80, 100]) record(`paper ${total} ${p}`, checkSamplePaper(p, total));
for (const q of ["Solve all the questions in the exercise", "1. What is 2+2?\n2. Name the capital.", "", "Q1 Q2 Q3"]) for (const a of ["1. 4\n2. Delhi", "Only one answer", "", "Q1 yes Q2 no Q3 maybe"]) record(`coverage ${q} | ${a}`, checkCoverage(q, a));

// ---- The PDF's reading of Markdown (as a tree of blocks) ----
const plain = (n: unknown): unknown => {
  if (Array.isArray(n)) return n.map(plain);
  if (n && typeof n === "object" && "props" in n) {
    const el = n as { type: unknown; props: Record<string, unknown>; key: unknown };
    const name = typeof el.type === "string" ? el.type : ((el.type as { displayName?: string; name?: string })?.displayName ?? (el.type as { name?: string })?.name ?? "?");
    return { name, props: Object.fromEntries(Object.entries(el.props).map(([k, v]) => [k, plain(v)])) };
  }
  return n;
};
const markdowns = [
  "# Heading one\n## Two\n### Three\n#### Four", "Plain paragraph with **bold** words.\n\nSecond paragraph.", "- one\n- two\n  - nested\n    - deeper\n* star\n• dot", "1. first\n2) second\na. letter\nB) capital",
  "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |", "```\ncode line\n  indented\n\tTabbed\n```\nafter", "> quoted line\n> second quoted\nnormal", "---\n***\n___", "## Answer Key\nanswers here", "## Answer key\n1. yes",
  "Text before\n```\nunclosed code", "| only | header |", "", "   \n\n  ", "**all bold**", "Mixed **bold** and 12 × 15 = 180 and √16 ≤ 5", "1.5 is not a list\n2.5 either", "- item with\u2028line break", "|a|b|\n|:--|--:|\n|x|y|",
  "# Title\n\nSome text\n\n- a\n- b\n\n| h1 | h2 |\n|----|----|\n| c1 | c2 |\n\n> note\n\n```\ncode\n```\n\n---\n\nEnd.",
];
for (const m of markdowns) record(`pdf blocks ${m.slice(0, 50)} ${m.length}`, plain(ContentBody({ text: m })));

// ---- Splitting a worksheet into questions ----
const worksheets = [
  "1. What is 2+2?\n2. Name the capital of India.\n3. Define a noun.", "Q1. Add 5 and 6\nQ2. Subtract 3 from 9\nQ3. Multiply 4 by 7", "(a) one (b) two (c) three", "Exercise 3.1\n1. Find x.\n(i) 2x = 4\n(ii) 3x = 9\n2. Prove that...",
  "Solve all the questions in the attached exercise", "", "   ", "A single long question with no numbering that goes on for a while and asks the child to explain in detail how plants make food from sunlight.",
  "Q.1 Fill in the blanks:\n(a) The sun is a ____\n(b) The moon is a ____\nQ.2 True or false:\n(a) Earth is flat", "1) one\n2) two\n3) three\n4) four\n5) five\n6) six\n7) seven\n8) eight\n9) nine\n10) ten\n11) eleven\n12) twelve",
  "प्रश्न 1. पौधे भोजन कैसे बनाते हैं?\nप्रश्न 2. जल चक्र क्या है?", "1. a\n\n\n2. b\n\n3. c", "Question 1: x\nQuestion 2: y", "I. Choose the correct answer\n1. a) x b) y\n2. a) p b) q", "1.1 first 1.2 second 1.3 third",
  "SECTION B\nA. Knowledge & Understanding\nWhat is a noun? Name two verbs? Define an adjective?\nB. Application\nWrite a sentence?",
  "Chapter 4: Light\nRead the instructions.\nSECTION A\n1. What is light?\n2. Name a source of light.\nSECTION B\nQ.3 Justify why shadows form.\nQ.4 Draw a ray diagram.",
  "* Question: What do you mean by reflection?\nIt is bouncing.\n* Question: Define refraction?\n- Q: Name a lens?",
  "```\n1. not a question\n2. also not\n```\n1. Real question one?\n2. Real question two?",
  "Part 1\nPart 2\nPart 3", "Section A: Objective questions\n1. a)x b)y\n   continues here\n2. next\n   more text", "Exercice 1: Calculer.\n1. 2+2\n2. 3+3\nExercice 2: Écrire.\n1. Un mot\n2. Deux mots",
  "विभाग अ\n१. सूर्य क्या है?\n२. चंद्रमा क्या है?\nविभाग ब\nप्रश्न ३. जल चक्र समझाइए।",
  "short\n1. a\n2. b", "1.5 litres is how much?\n2.5 kg of rice?\n3. Real one here please\n4. Another real one here",
  Array.from({ length: 40 }, (_, i) => `${i + 1}. Question number ${i + 1} about the chapter?`).join("\n"),
];
for (const w of worksheets) record(`split ${w.slice(0, 60)} ${w.length}`, splitQuestions(w));
