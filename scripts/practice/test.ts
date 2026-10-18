import { describe, explain, worksheetMarkdown, makeQuiz, markOrder, normaliseSettings, parseSample, settingsProblem, type OrderSettings } from "@/lib/practice/order";
import type { PracticeNumber } from "@/lib/practice/numbers";
import { makeCompareQuiz, makeCvcQuiz, makeSightQuiz, type CompareSettings, type SightSettings } from "@/lib/kindergarten/quiz";
import { CVC_WORDS, SIGHT_LEVELS, SIGHT_SETS, VOWELS } from "@/lib/kindergarten/words";

let passed = 0;
let failed = 0;
function check(ok: boolean, what: string) {
  if (ok) passed++;
  else {
    failed++;
    if (failed <= 20) console.log(`FAIL  ${what}`);
  }
}

// An independent reading of the value from the text (not the engine's own num/den).
function valueOf(n: PracticeNumber): number {
  const t = n.text.replace(/,/g, "");
  const mixed = /^(\d+) (\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(t);
}

function verify(s: OrderSettings, seed: number) {
  const quiz = makeQuiz(s, seed);
  const label = `${describe(s)} seed ${seed}`;
  check(quiz.length === s.questions, `${label}: ${quiz.length} of ${s.questions} questions`);
  for (const q of quiz) {
    const values = q.answer.map(valueOf);
    check(new Set(values.map((v) => v.toFixed(9))).size === s.size, `${label}: values not all different ${q.answer.map((n) => n.text)}`);
    const sorted = values.every((v, i) => i === 0 || (q.ascending ? v > values[i - 1] : v < values[i - 1]));
    check(sorted, `${label}: wrong order ${q.answer.map((n) => n.text)}`);
    check(q.numbers.length === s.size && q.numbers.every((n) => q.answer.includes(n)), `${label}: shown numbers differ from the answer`);
    check(markOrder(q, q.answer).every(Boolean), `${label}: the answer doesn't mark as right`);
    check(!markOrder(q, [...q.answer].reverse()).every(Boolean), `${label}: a reversed answer marks as right`);
    for (const n of q.answer) {
      const t = n.text.replace(/,/g, "");
      if (s.kind === "whole") check(t.length === s.digits && !t.startsWith("0"), `${label}: ${n.text} isn't ${s.digits} digits`);
      if (s.kind === "decimal") {
        const [int, frac] = t.split(".");
        check((s.digits === 0 ? int === "0" : int.length === s.digits && !int.startsWith("0")), `${label}: ${n.text} whole part`);
        check(frac.length >= s.minPlaces && frac.length <= s.maxPlaces && !frac.endsWith("0"), `${label}: ${n.text} decimal places`);
      }
      if (s.kind === "fraction") {
        const f = n.fraction!;
        check(f.bottom >= 2 && f.bottom <= s.maxDenominator, `${label}: ${n.text} bottom number`);
        check(s.improper || valueOf(n) < 1, `${label}: ${n.text} is bigger than 1`);
        check(!s.mixed ? !n.text.includes(" ") : true, `${label}: ${n.text} written as mixed`);
      }
    }
    if (s.spread !== null && s.kind !== "fraction") {
      const wholes = values.map(Math.floor);
      check(Math.max(...wholes) - Math.min(...wholes) <= s.spread, `${label}: spread ${wholes}`);
    }
    const e = explain(q);
    check(e.steps.length === s.size - 1, `${label}: explanation steps`);
    const words = JSON.stringify(e);
    check(!/undefined|NaN/.test(words), `${label}: explanation has undefined/NaN: ${words.slice(0, 300)}`);
    if (e.common) check(e.common.rows.every((r, i) => Math.abs(r.top / r.bottom - values[i]) < 1e-9), `${label}: common denominator rows`);
  }
}

const settings: Partial<OrderSettings>[] = [];
for (let digits = 1; digits <= 7; digits++) settings.push({ kind: "whole", digits }, { kind: "whole", digits, spread: 50 });
settings.push({ kind: "whole", digits: 3, spread: 4 }, { kind: "whole", digits: 2, size: 6 });
for (let digits = 0; digits <= 3; digits++) {
  for (const [minPlaces, maxPlaces] of [[1, 1], [1, 3], [2, 4]]) settings.push({ kind: "decimal", digits, minPlaces, maxPlaces });
  settings.push({ kind: "decimal", digits, minPlaces: 1, maxPlaces: 2, spread: 0 }, { kind: "decimal", digits, minPlaces: 1, maxPlaces: 3, spread: 5 });
}
for (const maxDenominator of [4, 6, 8, 12, 20]) {
  settings.push({ kind: "fraction", maxDenominator }, { kind: "fraction", maxDenominator, improper: true }, { kind: "fraction", maxDenominator, improper: true, mixed: true });
}
for (const raw of settings) {
  const s = normaliseSettings({ questions: 20, ...raw });
  if (settingsProblem(s)) {
    check(false, `settings rejected: ${JSON.stringify(raw)}: ${settingsProblem(s)}`);
    continue;
  }
  for (let seed = 1; seed <= 60; seed++) verify(s, seed * 7919);
  // The worksheet: every question, then the answer key, nothing missing.
  const sheet = worksheetMarkdown(s, makeQuiz(s, 3));
  check(/## Answer Key/.test(sheet) && (sheet.match(/^\d+\. /gm) ?? []).length === 2 * s.questions && !/undefined|NaN/.test(sheet), `worksheet for ${describe(s)}`);
}

// The same seed gives the same quiz.
const s = normaliseSettings({ kind: "decimal", digits: 1, minPlaces: 1, maxPlaces: 3 });
check(JSON.stringify(makeQuiz(s, 42), (_, v) => (typeof v === "bigint" ? String(v) : v)) === JSON.stringify(makeQuiz(s, 42), (_, v) => (typeof v === "bigint" ? String(v) : v)), "same seed, same quiz");

// The "longer decimal is bigger" trap appears.
let trap = 0;
for (let seed = 1; seed <= 50; seed++) {
  for (const q of makeQuiz(s, seed)) {
    const asc = [...q.answer].sort((a, b) => valueOf(a) - valueOf(b));
    if (asc.some((a, i) => asc.slice(i + 1).some((b) => (a.places ?? 0) > (b.places ?? 0)))) trap++;
  }
}
check(trap > 100, `the longer-decimal trap appears (${trap} questions)`);

// Samples.
const sample = (t: string) => parseSample(t);
check(JSON.stringify(sample("456")) === JSON.stringify({ settings: { kind: "whole", digits: 3 } }), "sample 456");
check(JSON.stringify(sample("4,07,500")) === JSON.stringify({ settings: { kind: "whole", digits: 6 } }), "sample 4,07,500");
check(JSON.stringify(sample("3.14")) === JSON.stringify({ settings: { kind: "decimal", digits: 1, minPlaces: 1, maxPlaces: 3 } }), "sample 3.14");
check(JSON.stringify(sample("0.5")) === JSON.stringify({ settings: { kind: "decimal", digits: 0, minPlaces: 1, maxPlaces: 2 } }), "sample 0.5");
check(JSON.stringify(sample(".25")) === JSON.stringify({ settings: { kind: "decimal", digits: 0, minPlaces: 1, maxPlaces: 3 } }), "sample .25");
check(JSON.stringify(sample("3/7")) === JSON.stringify({ settings: { kind: "fraction", improper: false, mixed: false, maxDenominator: 9 } }), "sample 3/7");
check(JSON.stringify(sample("7/4")) === JSON.stringify({ settings: { kind: "fraction", improper: true, mixed: false, maxDenominator: 7 } }), "sample 7/4");
check(JSON.stringify(sample("1 3/4")) === JSON.stringify({ settings: { kind: "fraction", improper: true, mixed: true, maxDenominator: 7 } }), "sample 1 3/4");
check(sample("") === null, "empty sample");
for (const bad of ["abc", "12345678", "3/0", "0/5", "1.23456"]) check(Boolean(sample(bad) && "error" in sample(bad)!), `sample ${bad} is rejected`);
check(settingsProblem(normaliseSettings({ kind: "whole", digits: 3, spread: 3 })) !== null, "spread 3 is too small for 5 numbers");

// One explanation of each kind printed in full, to read the wording.
for (const raw of [{ kind: "whole", digits: 4 }, { kind: "decimal", digits: 1, minPlaces: 1, maxPlaces: 3 }, { kind: "fraction", maxDenominator: 12 }, { kind: "fraction", maxDenominator: 9, improper: true, mixed: true }]) {
  const q = makeQuiz(normaliseSettings(raw), 11)[0];
  const e = explain(q);
  console.log(`${q.answer.map((n) => n.text).join(q.ascending ? " < " : " > ")}\n  ${e.rule}`);
  if (e.common) console.log(`  ${e.common.rows.map((r) => `${r.text} = ${r.top}/${r.bottom}`).join(", ")}`);
  for (const step of e.steps) console.log(`  ${step.relation}: ${step.reason}`);
}


// ---- Kindergarten: word lists and quizzes ----
for (const vowel of VOWELS) {
  for (const { word, emoji } of CVC_WORDS[vowel]) {
    check(/^[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]$/.test(word) && word[1] === vowel, `CVC word ${word} isn't consonant-vowel-consonant with vowel ${vowel}`);
    check(emoji.length > 0, `CVC word ${word} has no picture`);
  }
  check(CVC_WORDS[vowel].length >= 6, `Too few ${vowel} words`);
}
const allCvc = VOWELS.flatMap((v) => CVC_WORDS[v].map((w) => w.word));
check(new Set(allCvc).size === allCvc.length, "A CVC word is listed twice");
const everySight = SIGHT_LEVELS.flatMap((l) => [...SIGHT_SETS[l]]);
check(SIGHT_LEVELS.length === 5 && SIGHT_LEVELS.every((l) => SIGHT_SETS[l].length === 40), "There should be five sight-word sets of 40 words");
check(new Set(everySight.map((w) => w.toLowerCase())).size === everySight.length, "A sight word is listed twice");
check(everySight.every((w) => /^[A-Za-z']+$/.test(w)), "A sight word has an odd character");

for (let seed = 1; seed <= 400; seed++) {
  for (const questions of [5, 10]) {
    const vowelSets = [["a"], ["e", "i"], [...VOWELS]] as const;
    for (const vowels of vowelSets) {
      const quiz = makeCvcQuiz({ vowels: [...vowels], questions }, seed);
      check(quiz.length === questions, `CVC quiz length ${quiz.length}`);
      for (const q of quiz) {
        check(q.letters.join("") === q.word && vowels.includes(q.word[1] as never), `CVC question ${q.word} outside the chosen vowels`);
        check(q.tray.length === 5 && q.letters.every((l) => q.tray.includes(l)), `CVC tray for ${q.word} lacks its letters: ${q.tray}`);
        check(new Set(q.tray).size === 5, `CVC tray for ${q.word} repeats a letter: ${q.tray}`);
      }
      const words = quiz.map((q) => q.word);
      const poolSize = vowels.flatMap((v) => CVC_WORDS[v]).length;
      if (questions <= poolSize) check(new Set(words).size === words.length, `CVC quiz repeats a word within one round: ${words}`);
    }
    for (const level of SIGHT_LEVELS) {
      const settings: SightSettings = { level, questions };
      const list: readonly string[] = SIGHT_SETS[level];
      for (const q of makeSightQuiz(settings, seed)) {
        check(q.choices.length === 3 && new Set(q.choices.map((c) => c.toLowerCase())).size === 3, `Sight choices not 3 different words: ${q.choices}`);
        check(q.choices.includes(q.word) && list.includes(q.word), `Sight answer ${q.word} missing`);
        check(q.choices.filter((c) => c.toLowerCase() === q.word.toLowerCase()).length === 1, `Sight word ${q.word} appears twice`);
      }
    }
    for (const max of [5, 10, 20] as const) {
      const settings: CompareSettings = { max, questions };
      for (const q of makeCompareQuiz(settings, seed)) {
        check(q.left >= 1 && q.right >= 1 && q.left <= max && q.right <= max, `Compare group outside 1 to ${max}: ${q.left}, ${q.right}`);
        const expected = q.left === q.right ? "same" : (q.left > q.right) === (q.ask === "more") ? "left" : "right";
        check(q.answer === expected, `Compare answer wrong for ${q.left} vs ${q.right} (${q.ask})`);
      }
    }
  }
}
// The same seed gives the same questions (so a round can be repeated or printed).
check(JSON.stringify(makeCvcQuiz({ vowels: ["a", "o"], questions: 5 }, 77)) === JSON.stringify(makeCvcQuiz({ vowels: ["a", "o"], questions: 5 }, 77)), "The same seed gave different CVC questions");
check(JSON.stringify(makeCompareQuiz({ max: 10, questions: 5 }, 77)) === JSON.stringify(makeCompareQuiz({ max: 10, questions: 5 }, 77)), "The same seed gave different compare questions");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
