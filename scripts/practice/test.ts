import { describe, explain, worksheetMarkdown, makeQuiz, markOrder, normaliseSettings, parseSample, settingsProblem, type OrderSettings } from "@/lib/practice/order";
import type { PracticeNumber } from "@/lib/practice/numbers";
import { makeCompareQuiz, makeCvcQuiz, makeSightQuiz, type CompareSettings, type SightSettings } from "@/lib/kindergarten/quiz";
import { PHONEMES, blendStart, soundText } from "@/lib/kindergarten/phonics";
import { makeBlendQuiz } from "@/lib/kindergarten/quiz";
import { BOARD_COLUMNS, BOARD_ROWS, makeBoardGame, makeFamilySheet, makeMatchSheet, schoolFamilySheet, schoolMatchSheet } from "@/lib/kindergarten/worksheets";
import { BOARD_WORDS, CVC_WORDS, SIGHT_LEVELS, SIGHT_SETS, VOWELS } from "@/lib/kindergarten/words";

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
    check(emoji === null || emoji.length > 0, `CVC word ${word} has an empty picture`);
  }
  check(CVC_WORDS[vowel].length >= 6, `Too few ${vowel} words`);
  check(CVC_WORDS[vowel].filter((w) => w.emoji).length >= 5, `Too few ${vowel} words with pictures`);
}
const allCvc = VOWELS.flatMap((v) => CVC_WORDS[v].map((w) => w.word));
check(new Set(allCvc).size === allCvc.length, "A CVC word is listed twice");
const DOLCH_SETS = SIGHT_LEVELS.filter((l) => l !== "school");
const everySight = DOLCH_SETS.flatMap((l) => [...SIGHT_SETS[l]]);
check(DOLCH_SETS.length === 5 && DOLCH_SETS.every((l) => SIGHT_SETS[l].length === 40), "There should be five Dolch sets of 40 words");
check(new Set(everySight.map((w) => w.toLowerCase())).size === everySight.length, "A Dolch word is listed twice");
check(SIGHT_LEVELS.flatMap((l) => [...SIGHT_SETS[l]]).every((w) => /^[A-Za-z']+$/.test(w)), "A sight word has an odd character");
check(new Set(SIGHT_SETS.school).size === SIGHT_SETS.school.length, "The school set repeats a word");

// Every word the school sent home must be in the app (pictures, spelling, board game or sight words).
const SCHOOL_WORDS = "cat map pod rub jog fit sin sun keg cub dot hut toy fix hit run joy bat pot bed cap dog pig pen bug man top pet hen sit".split(" ");
const spelling = new Set(VOWELS.flatMap((v) => CVC_WORDS[v].map((w) => w.word)));
const board = new Set(VOWELS.flatMap((v) => BOARD_WORDS[v]));
const sight = new Set(SIGHT_SETS.school as readonly string[]);
for (const w of SCHOOL_WORDS) check(spelling.has(w) || (sight.has(w) && (w === "toy" || w === "joy")), `School word "${w}" is not in the spelling game`);
for (const w of SCHOOL_WORDS) check(board.has(w) || w === "toy" || w === "joy", `School word "${w}" is not in the board game`);
for (const w of SCHOOL_WORDS) check(sight.has(w) || spelling.has(w), `School word "${w}" is missing`);
// The word families on the school's worksheet each have an example word.
for (const fam of ["at", "an", "ig", "op", "un", "et", "en", "it", "ot", "ub"]) check(spelling.has(["c", "m", "p", "t", "s", "p", "h", "s", "p", "c"][["at", "an", "ig", "op", "un", "et", "en", "it", "ot", "ub"].indexOf(fam)] + fam), `The school word family -${fam} has no example`);

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
for (let seed = 1; seed <= 400; seed++) {
  for (const vowels of [["a"], ["e", "i"], [...VOWELS]] as const) {
    const fam = makeFamilySheet(seed, [...vowels]);
    check(fam.length >= 1 && fam.length <= 10 && new Set(fam.map((f) => f.rime)).size === fam.length, `Word-family sheet rows: ${fam.map((f) => f.rime)}`);
    check(fam.every((f) => f.example.endsWith(f.rime) && f.example.length === 3 && (vowels as readonly string[]).includes(f.vowel)), `A word-family example doesn't match its family`);
    const m = makeMatchSheet(seed, [...vowels]);
    const wordSet = new Set(m.pictures.map((p) => p.word));
    check(m.pictures.length === Math.min(10, m.pictures.length) && wordSet.size === m.pictures.length, `Match sheet repeats a picture`);
    check(m.words.length === m.pictures.length && m.words.every((w) => wordSet.has(w)) && new Set(m.words).size === m.words.length, `Match sheet words don't match its pictures`);
    check(m.pictures.length < 2 || m.words.some((w, i) => w !== m.pictures[i].word), `Match sheet leaves every word opposite its own picture`);
  }
}
for (const vowel of VOWELS) {
  for (const w of BOARD_WORDS[vowel]) check(/^[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]$/.test(w) && w[1] === vowel, `Board word ${w} isn't CVC with vowel ${vowel}`);
  check(new Set(BOARD_WORDS[vowel]).size === BOARD_WORDS[vowel].length && BOARD_WORDS[vowel].length >= 19, `Board words for ${vowel}: duplicates or too few`);
}
for (let seed = 1; seed <= 400; seed++) {
  for (const vowels of [["a"], ["e"], ["i", "o"], [...VOWELS]] as const) {
    const cells = makeBoardGame(seed, [...vowels]);
    check(cells.length === BOARD_COLUMNS * BOARD_ROWS, `Board has ${cells.length} cells`);
    check(cells[0].kind === "start" && cells[cells.length - 1].kind === "pond", "Board must start at the start and end at the pond");
    const pads = cells.map((c, i) => (c.kind === "pad" ? i : -1)).filter((i) => i >= 0);
    check(pads.length >= 4 && pads.every((p, i) => p >= 4 && p <= cells.length - 4 && (i === 0 || p - pads[i - 1] >= 2)), `Lily pads badly placed: ${pads}`);
    const words = cells.flatMap((c) => (c.kind === "word" ? [c.word] : []));
    check(words.every((w) => vowels.some((v) => w[1] === v)), "A board word is outside the chosen vowels");
    const pool = vowels.reduce((n, v) => n + BOARD_WORDS[v as keyof typeof BOARD_WORDS].length, 0);
    if (words.length <= pool) check(new Set(words).size === words.length, `A board word repeats although there are enough words: ${seed}`);
  }
}
const schoolFam = schoolFamilySheet();
check(schoolFam.map((f) => `${f.rime} ${f.example}`).join(",") === "at cat,an man,ig pig,op top,un sun,et pet,en hen,it sit,ot pot,ub cub", "The school word-family sheet differs from the printed one");
const schoolMatch = schoolMatchSheet();
check(schoolMatch.pictures.length === 10 && schoolMatch.pictures.every((p) => p.emoji) && schoolMatch.words.join(" ") === "bat sun cat pot bed cap dog pig pen bug", "The school matching sheet differs from the printed one");
check(schoolMatch.words.every((w) => schoolMatch.pictures.some((p) => p.word === w)), "A school matching word has no picture");
// ---- Phonics: every letter has a sound, a tip and a keyword ----
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
for (const l of LETTERS) {
  const p = PHONEMES[l];
  check(Boolean(p) && p.say.length > 0 && p.hold.length > 0 && p.tip.length > 10 && Boolean(p.keyword.emoji) && p.keyword.word.length > 1, `Letter ${l} lacks a sound, tip or keyword`);
  check(p?.say !== l && p?.say.toLowerCase() !== `${l}ee` && p?.say.toLowerCase() !== `${l}ay`, `Letter ${l} would be said as its name`);
}
check(LETTERS.filter((l) => PHONEMES[l].kind === "vowel").join("") === "aeiou", "Only a, e, i, o, u are vowels");
check(LETTERS.filter((l) => PHONEMES[l].kind === "continuous").join("") === "flmnrsvz", "The sounds you can hold should be f l m n r s v z");
check(soundText("m", true) === "mmmm" && soundText("p", true) === "puh" && soundText("m") === "mmm", "Stretching applies only to sounds that can be held");
const usedLetters = new Set([...VOWELS.flatMap((v) => CVC_WORDS[v].map((w) => w.word)), ...VOWELS.flatMap((v) => BOARD_WORDS[v])].join("").split(""));
for (const l of usedLetters) check(Boolean(PHONEMES[l]), `Letter ${l} is used in a word but has no sound`);
for (let seed = 1; seed <= 400; seed++) {
  for (const vowels of [["a"], ["e", "i"], [...VOWELS]] as const) {
    for (const q of makeBlendQuiz({ vowels: [...vowels], questions: 10 }, seed)) {
      check(q.choices.length === 3 && new Set(q.choices.map((c) => c.word)).size === 3, `Blend choices not 3 different pictures: ${q.choices.map((c) => c.word)}`);
      check(q.choices.some((c) => c.word === q.word && c.emoji === q.emoji) && q.choices.every((c) => c.emoji.length > 0), `Blend question ${q.word} has a wrong or empty choice`);
      check(q.letters.join("") === q.word && (vowels as readonly string[]).includes(q.word[1]), `Blend word ${q.word} outside the chosen vowels`);
    }
  }
}
for (const word of [...VOWELS.flatMap((v) => CVC_WORDS[v].map((w) => w.word)), ...VOWELS.flatMap((v) => BOARD_WORDS[v])]) {
  const start = blendStart(word.split(""));
  check(start.length >= 2 && start.startsWith(PHONEMES[word[0]].say.replace(/(uh|ih|ah)$/i, "").replace(/(.)\1{2,}$/, "$1")), `Blend start for ${word} is wrong: ${start}`);
}
check(blendStart(["m", "a", "p"]) === "maah" && blendStart(["s", "a", "t"]) === "saah" && blendStart(["c", "a", "t"]) === "kaah", `Blend start of map/sat/cat: ${blendStart(["m", "a", "p"])}, ${blendStart(["s", "a", "t"])}, ${blendStart(["c", "a", "t"])}`);
// The same seed gives the same questions (so a round can be repeated or printed).
check(JSON.stringify(makeCvcQuiz({ vowels: ["a", "o"], questions: 5 }, 77)) === JSON.stringify(makeCvcQuiz({ vowels: ["a", "o"], questions: 5 }, 77)), "The same seed gave different CVC questions");
check(JSON.stringify(makeCompareQuiz({ max: 10, questions: 5 }, 77)) === JSON.stringify(makeCompareQuiz({ max: 10, questions: 5 }, 77)), "The same seed gave different compare questions");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
