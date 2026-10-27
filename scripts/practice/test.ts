import { EMPTY_REWARDS, STICKERS, STARS_PER_STICKER, dayOf, earn, parseRewards, parseRewardsSync, starsToNextSticker, stickersFor, streakOf } from "@/lib/rewards";
import { describe, explain, worksheetMarkdown, makeQuiz, markOrder, normaliseSettings, parseSample, settingsProblem, type OrderSettings } from "@/lib/practice/order";
import type { PracticeNumber } from "@/lib/practice/numbers";
import { makeCompareQuiz, makeCvcQuiz, makeSightQuiz, type CompareSettings, type SightSettings } from "@/lib/kindergarten/quiz";
import { IPA, PHONEMES, blendStart, soundText } from "@/lib/kindergarten/phonics";
import { makeBlendQuiz, cvcPool } from "@/lib/kindergarten/quiz";
import { PLACE_MAX, makePlaceQuiz, onesOf, placeSpeech, placeValue, tensOf, tutorialNumber, tutorialSteps } from "@/lib/kindergarten/place-value";
import { blockedReason, buildRequestBody, questionProblem, type Question } from "@/app/dashboard/_ask/build-request";
import { checkPages } from "@/lib/ingestion/upload-pages";
import { parsePhotos } from "@/lib/generation/attachments";
import { PAPER_REPORT } from "../fixtures/bhakti-exercise-pages";
import { checkPaperMarks, gradeFor, gradeScaleText, withoutStudentWork } from "@/lib/checks/paper";
import { checkArithmetic } from "@/lib/checks/arithmetic";
import { checkSamplePaper } from "@/lib/checks/rules";
import { autoKeyFor } from "@/lib/study-pack/auto-key";
import { pureProblem } from "@/lib/worked/detect";
import { splitAnswerBlocks } from "@/lib/generation/blocks";
import { HANDWRITTEN_PAGE, SOIL_EXERCISE_ANSWER, LESSON_PAGES, OUTSIDE_ANSWER, PAGES as BHAKTI_PAGES, SOIL_CONTEXT, SOIL_GROUNDED, SOIL_MIXED } from "../fixtures/bhakti-exercise-pages";
import { splitQuestions } from "@/lib/rag/split-questions";
import { handwritingIn, withoutHandwriting } from "@/lib/rag/handwriting";
import { chunkPageText } from "@/lib/ingestion/chunk";
import { fullContextBudget } from "@/lib/rag/budget";
import { COMMANDS, booksOfKinds, commandsInView, noBooksMessage, planCommand } from "@/app/dashboard/_ask/commands";
import { bookShare, describeDetails, levelOf, scoreAnswer } from "@/lib/generation/confidence";
import { scrub, scrubText } from "@/lib/debug/scrub";
import { parseBugReport, reportMarkdown, statusLabel } from "@/lib/bug-report";
import { pdfDisposition } from "@/lib/pdf/disposition";
import { signUpProblem, signUpRefusal } from "@/lib/signup-check";
import { parseGenerationRequest } from "@/lib/generation/request";
import { parseProfileUpdate } from "@/lib/profile-update";
import { extendedGuestUntil, parseAccountUpdate } from "@/lib/account-update";
import { parseStudyPackRequest } from "@/lib/study-pack/request";
import { parseProblem } from "@/lib/worked/parse";
import { describeOutcome } from "@/app/dashboard/library/_parts/upload-book";
import { LOGIN_ID, internalEmail, looksLikeLoginId, normaliseLoginId } from "@/lib/login-id";
import { readAnswerStream } from "@/lib/answer-stream";
import { factChecks, parseJudge, scoreCase } from "../quality/grade";
import { disagreements, numbersIn, parseFinals } from "@/lib/generation/second-solve";
import { checkCitations, withPageReferences } from "@/lib/generation/citations";
import type { MatchedChunk } from "@/types/database";
import { BOARD_COLUMNS, BOARD_ROWS, makeBoardGame, makeFamilySheet, makeMatchSheet, schoolFamilySheet, schoolMatchSheet } from "@/lib/kindergarten/worksheets";
import { BOARD_WORDS, CVC_WORDS, familiesOf, rimeOf, SIGHT_LEVELS, SIGHT_SETS, VOWELS } from "@/lib/kindergarten/words";

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



// ---- Bug-scan regressions ----
{
  const opts = ["(a) A king", "(b) A beggar", "(c) A farmer"];
  check(JSON.stringify(autoKeyFor("Who?", "mcq", opts, "A beggar")) === '{"kind":"option","index":1}', "Auto key: the answer 'A beggar' is option b, not option a");
  check(JSON.stringify(autoKeyFor("Who?", "mcq", opts, "(c) A farmer")) === '{"kind":"option","index":2}', "Auto key: a lettered answer still works");
  const quarter = autoKeyFor("Half of 1/2 is ____", "fill", [], "**1/4**");
  check(quarter?.kind === "blank" && quarter.answers.includes("1 4") && !quarter.answers.includes("1"), "Auto key: 1/4 is not split into 1 and 4");
  const lakh = autoKeyFor("Write one lakh: ____", "fill", [], "**1,00,000**");
  check(lakh?.kind === "blank" && lakh.answers.includes("100000"), "Auto key: 1,00,000 accepts 100000");
  const either = autoKeyFor("The sky is ____", "fill", [], "**blue or grey**");
  check(either?.kind === "blank" && either.answers.join() === "blue,grey", "Auto key: alternatives are still split");
  const paperText = "1. Define a cell.\n3. Case study: read and answer\n(a) Name the part\n(b) Why needed\n\n## Answer Key\n**Q1. ** A unit of life.\n**Q3 (a). Name the part** Nucleus\n**Q3 (b). Why needed** It controls the cell.";
  check(checkSamplePaper(paperText, null).every((c) => c.ok), "Rules: a key headed 'Q3 (a).' covers question 3");
  check(pureProblem("Add 10, 20, 30, 40 and 50") === null, "Worked: five numbers to add go to the AI, not a four-number board");
  check(pureProblem("Find the LCM of 0.5 and 0.75") === null, "Worked: decimals in an LCM go to the AI");
  check(pureProblem("Find the LCM of 12, 18 and 30") !== null, "Worked: a plain LCM is still answered by code");
}

// ---- Kindergarten: CVC inventory and word families ----
{
  const every = VOWELS.flatMap((v) => CVC_WORDS[v]);
  check(every.length >= 120, `The CVC inventory has ${every.length} words, not 120 or more`);
  const pictures = every.map((w) => w.emoji).filter(Boolean);
  check(new Set(pictures).size === pictures.length, "Two CVC words share a picture, so a picture choice could be ambiguous");
  for (const family of ["at", "an", "ap", "et", "en", "in", "it", "ip", "ig", "ot", "op", "og", "ug", "un", "ut"]) {
    check(VOWELS.some((v) => familiesOf(v).includes(family)), `The word family -${family} is missing`);
  }
  for (const v of VOWELS) for (const rime of familiesOf(v)) {
    const words = CVC_WORDS[v].filter((w) => rimeOf(w.word) === rime);
    check(words.length >= 3 && words.every((w) => w.word[1] === v), `Family -${rime} is not three or more words of vowel ${v}`);
  }
  check(cvcPool({ vowels: ["a"], questions: 5, family: "at" }).every((w) => w.word.endsWith("at")), "A chosen family limits the words");
  check(cvcPool({ vowels: ["a"], questions: 5, family: "zz" }).length === CVC_WORDS.a.length, "An unknown family falls back to all the vowel's words");
  for (let seed = 1; seed <= 200; seed++) {
    for (const family of ["at", "ig", "ug", "ex"]) {
      const quiz = makeBlendQuiz({ vowels: ["a", "i", "u"], questions: 10, family }, seed);
      check(quiz.length === 10 && quiz.every((q) => q.choices.length === 3 && new Set(q.choices.map((c) => c.word)).size === 3), `Blend quiz for family ${family}`);
      const spell = makeCvcQuiz({ vowels: ["a", "i", "u"], questions: 10, family }, seed);
      check(spell.length === 10 && spell.every((q) => q.tray.length === 5), `Spelling quiz for family ${family}`);
      // Spell the word shows the picture of the word to spell, so every word it asks has one.
      for (const vowels of [["a"], ["e"], ["o", "u"], [...VOWELS]] as const) {
        const pictured = makeCvcQuiz({ vowels: [...vowels], questions: 10, family }, seed, true);
        check(pictured.length === 10 && pictured.every((q) => q.emoji !== null), `Spell the word asked a word without a picture (${family}, ${vowels})`);
      }
    }
  }
}

// ---- Kindergarten: place value and face value ----
for (let seed = 1; seed <= 400; seed++) {
  const n = tutorialNumber(seed);
  check(n >= 12 && n <= 98 && tensOf(n) !== onesOf(n) && onesOf(n) !== 0, `Lesson number ${n} has equal digits or a zero`);
  const steps = tutorialSteps(n);
  check(steps.length === 5 && steps.every((x) => x.say.length > 10), `Lesson for ${n} is incomplete`);
  check(steps[2].say.includes(`place value is ${tensOf(n) * 10}`) && steps[4].say.includes(`${n}`), `Lesson for ${n} states a wrong value`);
  for (const max of PLACE_MAX) {
    for (const questions of [5, 10] as const) {
      for (const q of makePlaceQuiz({ max, questions }, seed)) {
        const t = tensOf(q.number);
        const o = onesOf(q.number);
        check(q.number >= 11 && q.number <= max, `Place number ${q.number} outside 11 to ${max}`);
        check(q.choices.length === 3 && new Set(q.choices).size === 3 && q.choices.includes(q.answer), `Place choices for ${q.kind} ${q.number}: ${q.choices} (answer ${q.answer})`);
        const digit = q.column === "tens" ? t : o;
        const expected = q.kind === "face" ? digit : q.kind === "place" ? placeValue(digit, q.column) : q.kind === "which" ? digit : q.number;
        check(Number(q.answer) === expected, `Place answer ${q.answer} wrong for ${q.kind} ${q.number} ${q.column}`);
        check(placeSpeech(q).includes(String(q.kind === "build" ? "tap" : q.number)) || q.kind === "build", `Place speech for ${q.kind} ${q.number}`);
        if (q.kind !== "build") check(t !== o, `Place question about ${q.number} cannot tell its digits apart`);
      }
    }
  }
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
        check(new Set(q.tray).size === new Set(q.letters).size + 2, `CVC tray for ${q.word} has a wrong extra letter: ${q.tray}`);
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
for (const l of LETTERS) check(typeof IPA[l] === "string" && IPA[l].length >= 1, `Letter ${l} has no IPA sound`);
check(IPA.a === "æ" && IPA.c === "k" && IPA.u === "ʌ", "IPA for a, c and u");
// The same seed gives the same questions (so a round can be repeated or printed).
check(JSON.stringify(makeCvcQuiz({ vowels: ["a", "o"], questions: 5 }, 77)) === JSON.stringify(makeCvcQuiz({ vowels: ["a", "o"], questions: 5 }, 77)), "The same seed gave different CVC questions");
check(JSON.stringify(makeCompareQuiz({ max: 10, questions: 5 }, 77)) === JSON.stringify(makeCompareQuiz({ max: 10, questions: 5 }, 77)), "The same seed gave different compare questions");

// User IDs for sign-in.
for (const ok of ["guest", "abc", "a1.b_c-d", "x".repeat(30)]) check(LOGIN_ID.test(ok), `${ok} should be a valid user ID`);
for (const bad of ["ab", "x".repeat(31), "has space", "a@b.com", "-guest", "Guest", ""]) check(!LOGIN_ID.test(bad), `${JSON.stringify(bad)} should not be a valid user ID`);
check(normaliseLoginId("  Guest ") === "guest", "A user ID is trimmed and lowercased");
check(looksLikeLoginId("guest") && !looksLikeLoginId("a@b.com"), "An email is not a user ID");
check(internalEmail("guest") === "guest@guest.syllabi-study.vercel.app", "Stand-in login address");

// The message at the end of a book upload.
{
  const done = describeOutcome({ saved: new Set(["a", "b", "c"]), failures: new Map(), fatal: null }, 3, " Maths ", false);
  check(done.error === null && /All 3 pages of "Maths" sent/.test(done.success ?? "") && /about 1 minute\./.test(done.success ?? ""), "A finished upload says all pages were sent");
  const one = describeOutcome({ saved: new Set(["a"]), failures: new Map(), fatal: null }, 1, "Maths", false);
  check(/All 1 page of/.test(one.success ?? "") && !/pages/.test((one.success ?? "").split("sent")[0]), "One page is written in the singular");
  const part = describeOutcome({ saved: new Set(["a"]), failures: new Map([["b", "Too large."], ["c", "Too large."]]), fatal: "The connection dropped." }, 3, "Maths", false);
  check(part.success === null && /2 pages are still below: press Upload to try again \(they go into the same book\)/.test(part.error ?? ""), "A partly sent upload says what is left");
  check(/The connection dropped\./.test(part.error ?? "") && (part.error?.match(/Too large\./g) ?? []).length === 1 && /1 page was already sent and is being read/.test(part.error ?? ""), "It names the reason once and what was already sent");
  const stopped = describeOutcome({ saved: new Set(), failures: new Map(), fatal: "ignored" }, 2, "Maths", true);
  check(/Upload stopped\. 2 pages are still below: press Upload to continue\./.test(stopped.error ?? "") && !/ignored/.test(stopped.error ?? ""), "A stopped upload says it was stopped");
}

// What is sent for a question on the Generate page.
{
  const q: Question = { task: "solution", prompt: "  What is 12 x 15?  ", totalMarks: "80", marksEach: "", language: "auto", packBookId: "", bookIds: ["b1", "b2"], photos: [], docs: [] };
  check(questionProblem({ ...q, prompt: "  " }) === "Type a question or attach a photo or file first.", "An empty question is refused");
  check(questionProblem(q) === null && questionProblem({ ...q, prompt: "", docs: [{ name: "a.docx", text: "hi" }] }) === null, "A question or an attachment is enough");
  check(questionProblem({ ...q, task: "study_pack" }) !== null && questionProblem({ ...q, task: "study_pack", packBookId: "b1" }) === null, "A study pack needs a chapter or pages");
  const body = buildRequestBody({ ...q, docs: [{ name: "a.docx", text: "Hello" }] });
  check(body.prompt === "What is 12 x 15?" && JSON.stringify(body.documentIds) === '["b1","b2"]' && body.attachedText === 'Attached file "a.docx":\nHello', "An answer request carries the trimmed question, the books and the attached text");
  check(buildRequestBody({ ...q, task: "sample_paper", prompt: "Class 6 maths" }).prompt === "Class 6 maths\n\nTotal marks: 80", "A sample paper asks for the marks");
  const big = { ...q, docs: [{ name: "big", text: "x".repeat(70_000) }] };
  check(String(buildRequestBody(big).attachedText).length > 70_000 && /too much text/.test(questionProblem(big) ?? ""), "Too much attached text is refused with a reason, not cut off");
  check(questionProblem({ ...q, prompt: "y".repeat(9_000) })?.includes("too long") === true, "A too-long question is refused with a reason");
  const pack = buildRequestBody({ ...q, task: "study_pack", packBookId: "b1", prompt: " focus " });
  check(pack.documentId === "b1" && pack.focus === "focus" && JSON.stringify(pack.photos) === "[]" && !("documentIds" in pack), "A study pack request names the chapter");
  const fromPages = buildRequestBody({ ...q, task: "study_pack", packBookId: "b1", photos: [{ imageBase64: "AAAA", mimeType: "image/jpeg" } as Question["photos"][number]] });
  check(fromPages.documentId === undefined && (fromPages.photos as unknown[]).length === 1, "Attached pages win over a chosen book for a study pack");
  check(blockedReason({ overQuota: true, noBookSelected: true, readingFiles: true, choosingPages: false })?.includes("allowance") === true, "Over the allowance is the first reason given");
  check(blockedReason({ overQuota: false, noBookSelected: true, readingFiles: true, choosingPages: false })?.includes("no book is selected") === true && blockedReason({ overQuota: false, noBookSelected: false, readingFiles: true, choosingPages: false })?.includes("attachment") === true, "Then no book, then still reading a file");
  check(blockedReason({ overQuota: false, noBookSelected: false, readingFiles: false, choosingPages: false }) === null, "Nothing blocking means no message");
  check(blockedReason({ overQuota: false, noBookSelected: false, readingFiles: false, choosingPages: true })?.includes("Choose which pages") === true, "A long PDF waiting for its pages blocks Generate and says what to do");
}

// Request checkers.
{
  const UUID = "123e4567-e89b-42d3-a456-426614174000";
  const bad = (r: { ok: boolean }) => !r.ok;
  // Profile
  check(bad(parseProfileUpdate(null)) && bad(parseProfileUpdate({})) && bad(parseProfileUpdate({ fullName: "  " })), "Profile: nothing, empty name and unreadable body are refused");
  const prof = parseProfileUpdate({ fullName: "  Asha K ", classLevel: "", board: "", answerLanguage: "auto" });
  check(prof.ok && prof.updates.full_name === "Asha K" && prof.updates.class_level === null && prof.updates.board === null && prof.updates.answer_language === null, "Profile: a name is cleaned, empty choices and auto clear the setting");
  check(bad(parseProfileUpdate({ classLevel: "Class 99" })) && bad(parseProfileUpdate({ board: "Nope" })) && bad(parseProfileUpdate({ answerLanguage: "xx" })), "Profile: unknown class, board and language are refused");
  const lang = parseProfileUpdate({ answerLanguage: "hi" });
  check(lang.ok && lang.updates.answer_language === "hi", "Profile: a listed language is accepted");
  // Admin account change
  check(bad(parseAccountUpdate(null)) && bad(parseAccountUpdate({ id: "nope", active: false })) && bad(parseAccountUpdate({ id: UUID })), "Account: no id, a bad id or nothing to change is refused");
  check(bad(parseAccountUpdate({ id: UUID, role: "owner" })) && bad(parseAccountUpdate({ id: UUID, token_quota: -1 })) && bad(parseAccountUpdate({ id: UUID, token_quota: 1.5 })) && bad(parseAccountUpdate({ id: UUID, token_quota: "5" })), "Account: a bad role or allowance is refused");
  {
    // Stars, streaks and stickers for the child's games.
    check(dayOf(new Date(2026, 0, 5)) === "2026-01-05", "Rewards: a day is written YYYY-MM-DD");
    check(streakOf(["2026-10-23", "2026-10-24", "2026-10-25"], "2026-10-25") === 3, "Rewards: three days in a row ending today");
    check(streakOf(["2026-10-23", "2026-10-24"], "2026-10-25") === 2, "Rewards: the streak holds until a whole day is missed");
    check(streakOf(["2026-10-22", "2026-10-24"], "2026-10-25") === 1, "Rewards: a missed day breaks the streak");
    check(streakOf(["2026-10-20"], "2026-10-25") === 0 && streakOf([], "2026-10-25") === 0, "Rewards: no recent play is no streak");
    check(streakOf(["2026-02-28", "2026-03-01"], "2026-03-01") === 2 && streakOf(["2025-12-31", "2026-01-01"], "2026-01-01") === 2, "Rewards: streaks run across months and years");
    let r = EMPTY_REWARDS;
    let got: string[] = [];
    ({ rewards: r, newStickers: got } = earn(r, 7, "2026-10-24"));
    check(r.stars === 7 && got.length === 0 && r.days.join() === "2026-10-24", "Rewards: 7 stars, no sticker yet");
    ({ rewards: r, newStickers: got } = earn(r, 5, "2026-10-24"));
    check(r.stars === 12 && got.join() === STICKERS[0] && r.days.length === 1, "Rewards: the 10th star wins the first sticker; the same day counts once");
    ({ rewards: r, newStickers: got } = earn(r, 20, "2026-10-25"));
    check(r.stars === 32 && got.join() === STICKERS.slice(1, 3).join() && streakOf(r.days, "2026-10-25") === 2, "Rewards: two more stickers at once, and a two-day streak");
    check(starsToNextSticker(32) === 8 && starsToNextSticker(STICKERS.length * STARS_PER_STICKER) === null, "Rewards: stars to the next sticker, none when all are won");
    check(stickersFor(10_000).length === STICKERS.length && new Set(STICKERS).size === STICKERS.length, "Rewards: stickers stop at the last one and are all different");
    check(earn(r, -3, "2026-10-25").rewards.stars === 32 && earn(r, 2.7, "2026-10-25").rewards.stars === 34, "Rewards: no negative or part stars");
    check(parseRewards(JSON.stringify(r)).stars === 32 && parseRewards("not json").stars === 0 && parseRewards('{"stars":-1,"days":[]}').stars === 0 && parseRewards('{"stars":5,"days":["x","2026-10-25"]}').days.join() === "2026-10-25", "Rewards: saved state is read back, bad state is ignored");
    let many = EMPTY_REWARDS;
    for (let d = 1; d <= 90; d++) many = earn(many, 1, dayOf(new Date(2026, 0, d))).rewards;
    check(many.days.length === 60 && many.days[59] === "2026-03-31", "Rewards: only the last 60 days are kept");
    const synced = parseRewardsSync({ stars: 4.6, days: ["2026-10-25", "x", "2026-10-24", "2026-10-25"], owner: "kid-1" });
    check(synced.stars === 4 && synced.days.join() === "2026-10-24,2026-10-25" && synced.owner === "kid-1", "Rewards sync: whole stars, valid days once each, in order");
    check(parseRewardsSync(null).stars === 0 && parseRewardsSync({ stars: -5, owner: 7 }).owner === null && parseRewardsSync({ stars: 1e9 }).stars === 100_000, "Rewards sync: nothing usable adds nothing, and one sync adds at most 100,000 stars");
  }
  {
    const ext = parseAccountUpdate({ id: UUID, extend_days: 30 });
    check(ext.ok && ext.value.extendDays === 30 && Object.keys(ext.value.updates).length === 0, "Account: more days for a guest is accepted on its own");
    check(bad(parseAccountUpdate({ id: UUID, extend_days: 0 })) && bad(parseAccountUpdate({ id: UUID, extend_days: 366 })) && bad(parseAccountUpdate({ id: UUID, extend_days: 2.5 })) && bad(parseAccountUpdate({ id: UUID, extend_days: "7" })), "Account: a bad number of extra days is refused");
    const now = Date.parse("2026-10-25T10:00:00Z");
    check(extendedGuestUntil("2026-10-01T00:00:00Z", 7, now) === "2026-11-01T10:00:00.000Z", "Guest: an ended login gets its days from today");
    check(extendedGuestUntil("2026-10-30T00:00:00Z", 7, now) === "2026-11-06T00:00:00.000Z", "Guest: a running login gets its days added to its end date");
  }
  const acc = parseAccountUpdate({ id: UUID, active: false, role: "admin", token_quota: 0, extra: "ignored" });
  check(acc.ok && acc.value.id === UUID && JSON.stringify(acc.value.updates) === '{"active":false,"role":"admin","token_quota":0}', "Account: only the editable fields are kept");
  // Study pack
  check(bad(parseStudyPackRequest(null, "auto")) && bad(parseStudyPackRequest({ documentId: "nope" }, "auto")) && bad(parseStudyPackRequest({}, "auto")), "Study pack: unreadable, unknown book and no chapter are refused");
  const pack = parseStudyPackRequest({ documentId: UUID, focus: "  x".repeat(800), language: "xx", fresh: true }, "hi");
  check(pack.ok && pack.value.documentId === UUID && pack.value.language === "hi" && pack.value.focus?.length === 1000 && pack.value.fresh, "Study pack: chapter, capped focus, default language and fresh flag");
  const noBook = parseStudyPackRequest({ documentId: "", photos: [{ data: "/9j/4AAQSkZJRgABAQEASABIAAD", mimeType: "image/jpeg" }], language: "mr" }, "auto");
  check(noBook.ok && noBook.value.documentId === undefined && noBook.value.photos.length === 1 && noBook.value.language === "mr" && !noBook.value.fresh, "Study pack: attached pages stand in for a book");
  // Worked example
  check(parseProblem({ kind: "division", dividend: "5255", divisor: "5" })?.kind === "division" && parseProblem({ kind: "division", dividend: "5255", divisor: "5", decimals: true }) !== null, "Worked: a division is read");
  check(parseProblem({ kind: "division", dividend: "52x5", divisor: "5" }) === null && parseProblem({ kind: "division", dividend: "1".repeat(31), divisor: "5" }) === null, "Worked: bad or oversized numbers are refused");
  check(parseProblem({ kind: "lcm-hcf", numbers: [12, 18, 30], want: "both" })?.kind === "lcm-hcf" && parseProblem({ kind: "lcm-hcf", numbers: [1, 2, 3, 4, 5, 6, 7], want: "lcm" }) === null && parseProblem({ kind: "lcm-hcf", numbers: [12, 1.5], want: "lcm" }) === null && parseProblem({ kind: "lcm-hcf", numbers: [12], want: "sum" }) === null, "Worked: LCM and HCF need a short list of whole numbers and a known want");
  check(parseProblem({ kind: "column", op: "add", numbers: ["123", "45.5"] })?.kind === "column" && parseProblem({ kind: "column", op: "times", numbers: ["1"] }) === null, "Worked: column sums");
  check(parseProblem({ kind: "multiplication", a: "12", b: "15" })?.kind === "multiplication" && parseProblem({ kind: "multiplication", a: "12" }) === null, "Worked: multiplication");
  check(parseProblem({ kind: "fraction", op: "add", fractions: [[1, 2], [1, 3]] })?.kind === "fraction" && parseProblem({ kind: "fraction", op: "add", fractions: [[1, 2], [1, 3], [1, 4]] }) === null && parseProblem({ kind: "fraction", op: "add", fractions: [[1, 2, 3]] }) === null, "Worked: fractions come in pairs, at most two");
  check(parseProblem({ kind: "convert", value: "2.5", from: "km", to: "m" })?.kind === "convert" && parseProblem({ kind: "convert", value: "2.5", from: "kilometres", to: "m" }) === null, "Worked: unit conversion with short unit names");
  check(parseProblem(null) === null && parseProblem("division") === null && parseProblem({ kind: "toString" }) === null && parseProblem({ kind: "__proto__" }) === null && parseProblem({ kind: "nope" }) === null, "Worked: nothing, text and made-up kinds are refused");
  check(parseProblem({ kind: "multiplication", a: "2", b: "3", language: "hi" }) !== null, "Worked: a narration language is accepted");
}

// Request for an answer.
{
  const bad = (r: { ok: boolean }) => !r.ok;
  check(bad(parseGenerationRequest(null, "solution", "auto")) && bad(parseGenerationRequest({}, "solution", "auto")) && bad(parseGenerationRequest({ prompt: "   " }, "solution", "auto")), "Answer: unreadable and empty questions are refused");
  check(bad(parseGenerationRequest({ prompt: "x", photos: "nope" }, "solution", "auto")), "Answer: photos that aren't a list are refused");
  const askOf = (body: Record<string, unknown>) => {
    const r = parseGenerationRequest(body, "solution", "auto");
    return r.ok ? r.value.askedFor : "";
  };
  const worksheet = "Exercise 3\n1. What is a noun?\n2. Name three verbs.\n3. Underline the adjectives.";
  check(askOf({ prompt: "Do all of Exercise 4.2" }).includes("Exercise 4.2"), "Whole exercise: typed words can ask for it");
  check(!/exercise/i.test(askOf({ prompt: "Answer these", attachedText: worksheet })), "Whole exercise: an attached worksheet's heading doesn't switch it on");
  check(askOf({ prompt: "Answer these", attachedText: "Do every question on page 12" }).includes("page 12"), "Whole exercise: a short attached instruction still counts");
  check(askOf({ prompt: `Answer these:\n\n${worksheet}\n4. Spell "receive".` }) === "Answer these:", "Whole exercise: a long paste in the box counts only by its first line");
  const UUID = "123e4567-e89b-42d3-a456-426614174000";
  const a = parseGenerationRequest({ prompt: "  Explain light  ", documentIds: [UUID, "bad", 5], language: "mr", fresh: true, stream: true }, "notes", "hi");
  check(a.ok && a.value.prompt === "Explain light" && a.value.typedPrompt === "Explain light" && !a.value.hasAttachedText && JSON.stringify(a.value.documentIds) === `["${UUID}"]` && a.value.language === "mr" && a.value.fresh && a.value.stream, "Answer: a typed question with books, language, fresh and stream");
  const d = parseGenerationRequest({ prompt: "Hi", language: "xx" }, "solution", "hi");
  check(d.ok && d.value.language === "hi" && d.value.documentIds === undefined && !d.value.fresh && !d.value.stream, "Answer: defaults apply when nothing is chosen");
  const f = parseGenerationRequest({ attachedText: "Q1. 2+2?" }, "sample_paper", "auto");
  check(f.ok && f.value.typedPrompt === "" && f.value.hasAttachedText && f.value.prompt.startsWith("Make a sample paper") && f.value.prompt.endsWith("---\nQ1. 2+2?"), "Answer: an attached file alone gets the kind's default instruction");
}

// Pages sent for a book.
{
  const jpeg = "/9j/4AAQSkZJRgABAQEASABIAAD";
  const msg = (pages: unknown) => ("error" in checkPages(pages) ? (checkPages(pages) as { error: string }).error : "");
  check(/No pages/.test(msg([])) && /No pages/.test(msg("x")) && /Too many pages/.test(msg(Array.from({ length: 500 }, () => ({ text: "a" })))), "Pages: none, not a list and too many are refused");
  check(/Page 1 wasn't sent correctly/.test(msg([null])) && /Page 1 has an unknown kind/.test(msg([{ text: "a", sourceType: "nope" }])), "Pages: an empty entry or an unknown kind is refused");
  check(/Page 2 has an empty picture/.test(msg([{ text: "a" }, { imageBase64: "", mimeType: "image/jpeg" }])), "Pages: the page number is named, and an empty picture is refused");
  check(/isn't a JPEG, PNG or WebP/.test(msg([{ imageBase64: jpeg, mimeType: "image/gif" }])) && /damaged or isn't really a picture/.test(msg([{ imageBase64: "AAAAAAAA", mimeType: "image/jpeg" }])), "Pages: wrong type and fake pictures are refused");
  check(/too large \(over 3 MB/.test(msg([{ imageBase64: "/9j/" + "A".repeat(3_200_000), mimeType: "image/jpeg" }])), "Pages: an oversized picture is refused");
  check(/has no text/.test(msg([{ text: "   " }])) && /too much text/.test(msg([{ text: "a".repeat(200_000) }])) && /neither a picture nor text/.test(msg([{ sourceType: "textbook" }])), "Pages: empty, huge and missing content are refused");
  check(/note that is too long/.test(msg([{ imageBase64: jpeg, mimeType: "image/jpeg", hint: "x".repeat(501) }])), "Pages: a long note is refused");
  const ok = checkPages([{ text: "Chapter 1", sourceType: "textbook" }, { imageBase64: jpeg, mimeType: "image/jpeg", hint: "figure 2" }, { text: "typed", imageBase64: jpeg, mimeType: "image/jpeg" }]);
  check("pages" in ok && ok.pages.length === 3, "Pages: text, picture and picture-with-text pages are accepted");
}

// Sign-up form checks.
{
  process.env.OPEN_SIGNUPS = "true";
  const form = { email: "a@b.com", password: "longenough", confirmPassword: "longenough", accountType: "parent", adultConfirmed: true };
  check(signUpProblem(form) === null && signUpProblem({ ...form, accountType: "tutor" }) === null, "Sign-up: a good form is accepted");
  check(signUpProblem({ ...form, email: "a".repeat(250) + "@b.com" }) === "too-long" && signUpProblem({ ...form, password: "é".repeat(40), confirmPassword: "é".repeat(40) }) === "too-long", "Sign-up: a very long email or password is refused (in bytes)");
  check(signUpProblem({ ...form, confirmPassword: "different1" }) === "mismatch" && signUpProblem({ ...form, password: "short", confirmPassword: "short" }) === "weak", "Sign-up: mismatch and a short password are refused");
  check(signUpProblem({ ...form, accountType: "child" }) === "account-type" && signUpProblem({ ...form, accountType: "" }) === "account-type", "Sign-up: only parent or tutor");
  check(signUpProblem({ ...form, adultConfirmed: false }) === "adult", "Sign-up: the adult box must be ticked");
  process.env.OPEN_SIGNUPS = "false";
  process.env.ADMIN_EMAIL = "owner@example.com";
  check(signUpProblem(form) === "private" && signUpProblem({ ...form, email: " Owner@Example.com " }) === null, "Sign-up: while private, only the owner's email may sign up");
  check(signUpProblem({ ...form, email: "a".repeat(300), password: "x" }) === "too-long", "Sign-up: length is checked before anything else");
  process.env.OPEN_SIGNUPS = "true";
  check(signUpRefusal("User already registered") === "exists" && signUpRefusal("Password should be at least 8") === "weak" && signUpRefusal("boom") === "unknown", "Sign-up: refusals from the sign-in service map to messages");
}

// Attached photos on a question.
{
  const jpeg = "/9j/4AAQSkZJRgABAQEASABIAAD";
  const photo = (extra: object = {}) => ({ data: jpeg, mimeType: "image/jpeg", ...extra });
  check(Array.isArray(parsePhotos(undefined)) && Array.isArray(parsePhotos(null)) && parsePhotos(null).length === 0, "Photos: none is fine");
  check(typeof parsePhotos("x") === "string" && typeof parsePhotos(Array.from({ length: 13 }, () => photo())) === "string", "Photos: not a list, or too many, is refused");
  check(/JPEG, PNG or WebP/.test(String(parsePhotos([{ data: jpeg, mimeType: "image/gif" }]))) && /JPEG, PNG or WebP/.test(String(parsePhotos([null]))) && /damaged/.test(String(parsePhotos([{ data: "AAAAAAAA", mimeType: "image/jpeg" }]))), "Photos: wrong type, empty entry and fake pictures are refused");
  const ok = parsePhotos([photo({ text: "  page text " }), photo({ text: "   " })]);
  check(Array.isArray(ok) && ok.length === 2 && ok[0].text === "  page text ".slice(0, 20_000) && !("text" in ok[1]), "Photos: page text is kept, blank text is dropped");
  check(/too large together/.test(String(parsePhotos([photo({}), { data: "/9j/" + "A".repeat(3_100_000), mimeType: "image/jpeg" }]))), "Photos: a total over the size budget is refused");
  check(/too much text/.test(String(parsePhotos(Array.from({ length: 3 }, () => photo({ text: "a".repeat(15_000) }))))), "Photos: too much attached text in total is refused");
}

// The PDF's download name.
{
  check(pdfDisposition("What is 12 x 15?") === `inline; filename="What is 12 x 15.pdf"; filename*=UTF-8''What%20is%2012%20x%2015.pdf`, `Disposition: ${pdfDisposition("What is 12 x 15?")}`);
  check(/filename="Syllabi answer\.pdf"/.test(pdfDisposition("पौधे भोजन कैसे बनाते हैं")) && /filename\*=UTF-8''%E0%A4%AA/.test(pdfDisposition("पौधे भोजन कैसे बनाते हैं")), "Disposition: a Hindi title keeps its letters, with a plain fallback");
  check(!/[/\\:*?"<>|]/.test(pdfDisposition('a/b\\c:d*e?f"g<h>i|j').replace(/^inline; filename="|\.pdf.*$/g, "")), "Disposition: characters not allowed in file names become spaces");
  check(pdfDisposition("x".repeat(200)).length < 260 && pdfDisposition("   ").includes('filename="Syllabi answer.pdf"'), "Disposition: a long or blank title is cut or replaced");
}

// The owner's sample chapter: pages 11 to 15 are a textual exercise and a worksheet. Every question must be found, under its own heading.
{
  const found = splitQuestions(BHAKTI_PAGES.join("\n\n"));
  const headed = (heading: string) => found.filter((q) => q.includes(heading)).length;
  check(found.length === 28, `Sample chapter: 20 exercise questions and 8 worksheet questions are found (${found.length})`);
  check([["Q1. Fill in the blanks.", 4], ["Q2. State whether", 4], ["Q3. Multiple Choice", 4], ["Q4. Answer the following questions in short.", 4], ["Q5. Answer the following questions in detail.", 4], ["Q.I. Multiple Choice Question.", 4], ["Q.II. Answer the following in detail.", 4]].every(([h, n]) => headed(h as string) === n), "Sample chapter: each heading (including Q.I. and Q.II.) owns its four questions");
  check(found.every((q) => !/^.*\n[a-d]\. [ivx]+-/m.test(q.split("\n")[1] ?? "")), "Sample chapter: no answer option such as 'd. ii-i-iv-iii' is taken for a heading");
  const pranali = found.find((q) => q.includes("Pranali")) ?? "";
  check(pranali.includes("Q3. Multiple Choice") && !pranali.includes("Q5."), "Sample chapter: a question whose options run onto the next page keeps its own heading");
  check((found.find((q) => q.includes("Bhanu")) ?? "").includes("Q.I."), "Sample chapter: a worksheet question is not filed under the exercise's last heading");
  check((found.find((q) => q.includes("Read the passage")) ?? "").includes("Bhakta Kulam"), "Sample chapter: a passage stays with its question");
  const labels = BHAKTI_PAGES.flatMap((p, i) => chunkPageText(p, 11 + i).map((c) => c.sectionLabel));
  check(labels.includes("Q.I. Multiple Choice Question.") && labels.includes("Q.II. Answer the following in detail."), "Sample chapter: the worksheet's Q.I. and Q.II. become section labels when pages are indexed");

  // Question boxes inside the lesson (Warm-up, 21st Century Skills, Source Analysis) are questions to answer too.
  const lesson = splitQuestions(LESSON_PAGES.join("\n\n"));
  check(lesson.length === 9, `Lesson boxes: 3 + 3 + 3 questions are found (${lesson.length})`);
  check(["Warm-up", "21st Century Skills", "Source Analysis"].every((box) => lesson.filter((q) => q.includes(box)).length === 3), "Lesson boxes: each box owns its three questions");
  const lessonLabels = LESSON_PAGES.flatMap((p, i) => chunkPageText(p, 2 + i).map((c) => c.sectionLabel));
  check(lessonLabels.filter((l) => l?.startsWith("[Questions:")).length === 3, "Lesson boxes: each box starts its own chunk, labelled with its title");
  check(splitQuestions([...LESSON_PAGES, ...BHAKTI_PAGES].join("\n\n")).length === 37, "Lesson boxes and the exercise together: 9 + 28 questions");

  // A student's handwritten answers on the page are reference only: never part of a question.
  const hw = splitQuestions(HANDWRITTEN_PAGE);
  check(hw.length === 2 && hw.every((q) => !/Black Soil|Red Soil|Cotton|Handwritten/.test(q)), `Handwriting: two questions are found, with none of the student's answers in them (${hw.length})`);
  check(!withoutHandwriting(HANDWRITTEN_PAGE).includes("Handwritten") && withoutHandwriting(HANDWRITTEN_PAGE).includes("Which type of soil do you think it will be?"), "Handwriting: removing it leaves the printed questions whole");
  const attempts = handwritingIn(HANDWRITTEN_PAGE);
  check(attempts.length === 2 && attempts[0].startsWith("The type of soil in that region would be Black Soil.") && attempts[0].includes("4. Millets") && !attempts[0].includes("["), "Handwriting: each answer is found whole, without its marker");
  check(withoutHandwriting("1. Define cell.\n[Handwritten: cell is the [illegible] of life]") === "1. Define cell.", "Handwriting: [illegible] inside handwriting is taken out with it");
  check(checkArithmetic("Total length = 12 m + 8 m = 20 m").every((c) => c.ok), "Arithmetic: a sum of quantities is not a unit conversion");
  check(checkArithmetic("Hence 12 × 15 = 170").some((c) => !c.ok), "Arithmetic: a wrong sum after a plain word is caught");
  check(checkArithmetic("So 25 × 4 = 100").every((c) => c.ok), "Arithmetic: a right sum after a plain word passes");
  check(withoutHandwriting("Fill in: Vajji is a ____ [Handwritten: Gana-Sangha] republic.") === "Fill in: Vajji is a ____  republic.", "Handwriting: a short note inside a line is taken out too");
  check(splitQuestions("Q1. Answer.\n1. What is soil used for in farming?\n[Handwritten: 1. for crops\n2. for houses]\n2. Name one crop of black soil.").length === 2, "Handwriting: numbered lines inside a handwritten answer are not counted as questions");

  // Other layouts of the same kind of paper.
  const upper = splitQuestions("Q1. Choose the right answer.\n1. Which is a prime?\nA. 4\nB. 6\nC. 7\nD. 9\n2. Which is even?\nA. 3\nB. 5\nC. 8\nD. 9");
  check(upper.length === 2 && upper.every((q) => q.includes("Q1.")), "Layouts: capital-letter options (A. B. C. D.) stay with their question");
  const sections = splitQuestions("A. Fill in the blanks\n1. The sun rises in the ____ .\n2. Water boils at ____ degrees.\nB. Match the following\n1. Cat - meows\n2. Dog - barks");
  check(sections.length === 4 && sections[2].includes("B. Match"), "Layouts: lettered section headings still start a new section");
  const three = splitQuestions("Q.I. Fill in the blanks.\n1. The sky is ____ .\n2. Grass is ____ .\nQ.II. True or false.\n1. Fish can fly always.\n2. Birds have feathers.\nQ.III. Short answers.\n1. What is a noun in a sentence?\n2. What is a verb in a sentence?");
  check(three.length === 6 && three[5].includes("Q.III."), "Layouts: Roman-numeral headings Q.I., Q.II., Q.III. each start a section");
  const word = splitQuestions("Question is this chapter about nouns?\nQuestion II: Name three nouns in a sentence.\n1. Write a noun here.\n2. Write another noun here.");
  check(word.length === 2, "Layouts: the word 'is' after Question is not a Roman numeral");
}

// Quick commands: ready-made requests, some tied to kinds of book.
{
  const lib = (id: string, source_type: "textbook" | "exercise" | "past_paper" | "notes") => ({ id, title: id, subject: null, grade: null, status: "ready" as const, source_type });
  const books = [lib("t1", "textbook"), lib("e1", "exercise"), lib("p1", "past_paper"), lib("e2", "exercise")];
  check(booksOfKinds(books, ["exercise"]).join() === "e1,e2" && booksOfKinds(books, ["past_paper"]).join() === "p1" && booksOfKinds(books, ["exercise", "textbook"]).join() === "t1,e1,e2", "Commands: books are picked by kind");
  check(booksOfKinds(books, ["notes"]).length === 0, "Commands: no book of that kind means none are picked");
  check(/exercise books/.test(noBooksMessage(["exercise"])) && /Past paper/.test(noBooksMessage(["past_paper"])) && /test papers/.test(noBooksMessage(["past_paper"])), "Commands: the message for a missing kind names it, and says how to add one");

  const solve = COMMANDS.solution;
  check(solve.length === 1 && solve[0].label === "Solve all exercise questions" && solve[0].books?.join() === "exercise,textbook", "Commands: Solve has the one command, using exercise books and textbooks");
  const prompt = solve[0].prompt;
  const kinds = ["fill in the blanks", "true or false", "multiple choice", "assertion and reason", "match the following", "ordering", "picture and passage based", "one-word", "in brief or in short", "in detail", "research or find-out"];
  check(kinds.every((k) => prompt.includes(k)), `Commands: the request names every kind of question (${kinds.filter((k) => !prompt.includes(k)).join(", ")})`);
  check(/Warm-up, Source Analysis/.test(prompt) && /Do not skip or merge/.test(prompt) && /section and number/.test(prompt), "Commands: it also asks for the questions inside lessons, no skipping, and section-and-number labels");
  check(/exercise/i.test(prompt), "Commands: it says 'exercise', which brings in the whole exercise pages");
  check(Object.entries(COMMANDS).filter(([k]) => k !== "solution").every(([, v]) => v.length === 0), "Commands: the other kinds of answer have none yet");
  check(commandsInView("solution", "", false) && commandsInView("solution", prompt, false) && !commandsInView("solution", "my own question", false) && !commandsInView("solution", "", true), "Commands: they stay in view for an empty box or one of them, not for typed text or an attachment");
  check(planCommand(solve[0], books).books?.join() === "t1,e1,e2" && planCommand(solve[0], [lib("p1", "past_paper")]).notice?.includes("exercise books") === true && planCommand({ label: "x", prompt: "y" }, books).books === null, "Commands: a plan picks the books, warns when there are none of that kind, or leaves the choice alone");
}

// Problem reports: private things come out, bulky things shrink, the ticket reads clearly.
{
  const photo = "A".repeat(5000);
  const cleaned = scrub({ prompt: "Solve", password: "hunter2", nested: { api_key: "k", Authorization: "Bearer x", token: "t" }, photos: [{ data: photo, mimeType: "image/jpeg" }], note: "ok" }) as { password: string; nested: Record<string, string>; photos: { data: string; mimeType: string }[]; prompt: string };
  check(cleaned.password === "[hidden]" && cleaned.nested.api_key === "[hidden]" && cleaned.nested.Authorization === "[hidden]" && cleaned.nested.token === "[hidden]", "Report: passwords, keys, tokens and authorization are hidden");
  check(/^\[file or image data, about \d+ KB\]$/.test(cleaned.photos[0].data) && cleaned.photos[0].mimeType === "image/jpeg" && cleaned.prompt === "Solve", "Report: image data is replaced by its size, the rest is kept");
  check(JSON.stringify(scrub("word ".repeat(2000))).length < 2700 && String(scrub("word ".repeat(2000))).includes("more characters"), "Report: long text is cut, saying how much");
  check((scrub(Array.from({ length: 50 }, (_, i) => i)) as unknown[]).length === 21, "Report: a long list is cut to 20 with a count");
  check(!JSON.stringify(scrubText(JSON.stringify({ photos: [{ data: photo }], password: "p" }))).includes("AAAAAAAAAA") && scrubText('{"password":"p1"}').includes("[hidden]"), "Report: sent text has file data and passwords taken out");
  check(!scrubText('{"type":"delta","text":"hello","token":"abc123"}\n{"type":"delta","text":"wor').includes("abc123") && scrubText('{"type":"delta","text":"hello","token":"abc123"}\n{"type":"delta","text":"wor').includes("hello"), "Report: a cut-off stream keeps its words but not its tokens");

  const ok = parseBugReport({ title: "  Answer skipped Q4  ", description: "I expected 8", path: "/dashboard", build: "abc", context: { steps: Array.from({ length: 60 }, (_, i) => ({ at: "2026-10-20T10:00:00Z", kind: "click", text: `c${i}` })), requests: [{ path: "/api/x", sent: "{}", password: "p" }], userAgent: "UA" } });
  check(ok.ok && ok.value.title === "Answer skipped Q4" && (ok.value.context.steps as unknown[]).length === 60 && JSON.stringify(ok.value.context).includes("[hidden]"), "Report: a good report is cleaned, keeps its 60 steps and hides secrets sent in the context");
  check(!parseBugReport({ title: "   " }).ok && !parseBugReport(null).ok && !parseBugReport({ title: "x", description: "y".repeat(5001) }).ok, "Report: a missing title, a missing body or an over-long description is refused");
  check(!parseBugReport({ title: "x", context: { big: "z".repeat(600_000) } }).ok, "Report: a huge report is refused");

  const md = reportMarkdown({ number: 7, title: "Answer skipped Q4", description: "I expected 8", path: "/dashboard", app_build: "abc123", status: "open", created_at: "2026-10-20T10:00:00Z", who: "ravi@example.com", resolution: null, context: { userAgent: "Chrome", viewport: "390x844", url: "https://x/dashboard", steps: [{ at: "2026-10-20T10:00:01Z", kind: "click", text: 'Clicked button "Generate"' }], requests: [{ at: "2026-10-20T10:00:02Z", method: "POST", path: "/api/generate/solution", status: 200, ms: 4100, sent: '{"prompt":"Solve"}', received: "```x```" }], onScreen: { fields: [{ label: "Your question", value: "Solve" }], text: "Answer text" } } });
  check(["# Bug #7: Answer skipped Q4", "by ravi@example.com", "## What the person wrote", "I expected 8", "## Typed on the screen (input)", "- Your question: Solve", "## What the screen showed (output)", "Answer text", 'Clicked button "Generate"', "POST /api/generate/solution → 200 (4100 ms)", "Sent:", '{"prompt":"Solve"}', "Received:"].every((t) => md.includes(t)), "Report: the ticket text has the person's words, input, output, steps and requests");
  check(!md.includes("```x```") && statusLabel("working") === "Being fixed" && statusLabel("wontfix") === "Won't fix", "Report: code fences inside captured text can't break the ticket, and statuses read in plain words");
}

// Answer confidence: two numbers, "correct and grounded : from the books", in red, amber or green.
{
  const base = { context: SOIL_CONTEXT, checks: [] as { kind: "calculation" | "marks" | "coverage"; ok: boolean; message: string }[], coverageLow: false, usedSearchGrounding: false, weakPages: 0 };
  const grounded = scoreAnswer({ ...base, text: SOIL_GROUNDED });
  check(grounded.fromBook >= 90 && grounded.correct >= 90 && levelOf(grounded.correct) === "green" && levelOf(grounded.fromBook) === "green", `Confidence: an answer that follows the book is green and green (${grounded.correct}:${grounded.fromBook})`);
  check(grounded.correct < 100 && grounded.reasons.length > 0, "Confidence: it is never 100, and always says why");
  const mixed = scoreAnswer({ ...base, text: SOIL_MIXED });
  check(mixed.fromBook > 15 && mixed.fromBook < 50 && levelOf(mixed.fromBook) === "red" && mixed.correct < grounded.correct && /not found in the pages/.test(mixed.reasons.join(" ")), `Confidence: an answer with outside facts added scores low on the book share (${mixed.correct}:${mixed.fromBook})`);
  const outside = scoreAnswer({ ...base, text: OUTSIDE_ANSWER });
  check(outside.fromBook === 0 && levelOf(outside.correct) === "red" && outside.correct <= 65, `Confidence: an answer from general knowledge is 0% from the book and red (${outside.correct}:${outside.fromBook})`);
  check(bookShare(SOIL_GROUNDED, [{ content: "Black soil is [Handwritten answer: formed from the weathering of volcanic basalt rock rich in clay holds moisture suits cotton tobacco oilseeds millets]" }]) !== null && (bookShare(SOIL_GROUNDED, [{ content: "[Handwritten answer: formed from the weathering of volcanic basalt rock rich in clay holds moisture suits cotton tobacco oilseeds millets farm northern Maharashtra]" }]) ?? 0) < 20, "Confidence: a student's handwriting on the page doesn't count as the book");
  check(bookShare("**Q1** Name it.\n\n**Ans:** **True**", SOIL_CONTEXT) === null, "Confidence: an answer too short to judge by words gives no share");
  check(scoreAnswer({ ...base, text: "**Q2.1** Sufis.\n\n**Ans:** **True**", coverageLow: false }).fromBook === 85 && scoreAnswer({ ...base, text: "**Q2.1** Sufis.\n\n**Ans:** **True**", coverageLow: true }).fromBook === 40, "Confidence: for a very short answer the share follows how well the pages matched");
  const none = scoreAnswer({ ...base, context: [], text: SOIL_GROUNDED });
  check(none.fromBook === 0 && /No matching pages/.test(none.reasons.join(" ")), "Confidence: with no matching pages everything is from outside, and it says so");
  const failed = scoreAnswer({ ...base, text: SOIL_GROUNDED, checks: [{ kind: "calculation", ok: false, message: "12 × 15 = 180, not 170" }] });
  check(failed.correct <= grounded.correct - 20 && failed.reasons[0].includes("12 × 15 = 180"), "Confidence: a failed automatic check lowers the score by 20 and comes first in the reasons");
  const calc = scoreAnswer({ ...base, text: SOIL_GROUNDED, checks: [{ kind: "calculation", ok: true, message: "ok" }] });
  check(calc.correct >= grounded.correct && /exact calculator/.test(calc.reasons.join(" ")), "Confidence: checked calculations are credited");
  const web = scoreAnswer({ ...base, text: SOIL_GROUNDED, usedSearchGrounding: true });
  const weak = scoreAnswer({ ...base, text: SOIL_GROUNDED, weakPages: 2, coverageLow: true });
  check(web.correct === grounded.correct - 8 && /web search/.test(web.reasons.join(" ")), "Confidence: a web search lowers it by 8, and says why");
  check(weak.correct <= grounded.correct - 20 && /2 pages it relied on were hard to read/.test(weak.reasons.join(" ")) && /matched the question only weakly/.test(weak.reasons.join(" ")), "Confidence: hard-to-read pages and weak matches lower it, and say why");
  check(scoreAnswer({ ...base, text: SOIL_GROUNDED, checks: Array.from({ length: 9 }, () => ({ kind: "calculation" as const, ok: false, message: "x" })), weakPages: 9, usedSearchGrounding: true, coverageLow: true }).correct >= 5, "Confidence: it never goes below 5");
  check(levelOf(80) === "green" && levelOf(79) === "amber" && levelOf(60) === "amber" && levelOf(59) === "red" && levelOf(0) === "red", "Confidence: green from 80, amber from 60, red below");
  const hindi = scoreAnswer({ ...base, context: [{ content: "काली मिट्टी बेसाल्ट चट्टानों के अपक्षय से बनती है। यह कपास तंबाकू तिलहन और बाजरा के लिए उपयुक्त है।" }], text: "**Ans:** काली मिट्टी बेसाल्ट चट्टानों के अपक्षय से बनती है। यह कपास तंबाकू तिलहन के लिए उपयुक्त है।" });
  check(hindi.fromBook >= 80, `Confidence: Hindi answers are judged too (${hindi.fromBook})`);
}

// Confidence details: the facts behind the numbers, so a low score can be traced to its cause.
{
  const passages = SOIL_CONTEXT.map((c, i) => ({ ...c, source_type: i === 0 ? "textbook" : "exercise", page_number: 3 + i, similarity: 0.7 }));
  const r = scoreAnswer({ context: passages, retrieval: { mode: "exercise", books: 2, totalChars: 9000, sectionChunks: 1, questions: 5, supportChunks: 1, topSimilarity: 0.42 }, checks: [], coverageLow: true, usedSearchGrounding: false, weakPages: 1, text: SOIL_MIXED });
  const d = r.details!;
  check(d.statements >= 3 && d.grounded >= 1 && d.grounded < d.statements, `Details: the statements judged and how many were found in the books (${d.grounded} of ${d.statements})`);
  check(d.passages === 2 && d.pages === "textbook p3 (1), exercise p4 (1)" && /whole exercise: 1 exercise passages added; 5 questions searched in the books, 1 lesson passages added/.test(d.retrieval), `Details: where the passages came from and how they were found (${d.pages} | ${d.retrieval})`);
  check(d.coverageLow && d.topSimilarity === 0.42 && d.weakPages === 1 && !d.usedSearchGrounding && d.failedChecks === 0, "Details: the match quality, weak pages, web search and failed checks are recorded");
  check(d.outside.length >= 1 && d.outside.length <= 6 && d.outside[0].found < 55 && d.outside[0].missing.length > 0 && d.outside.every((o, i, a) => i === 0 || a[i - 1].found <= o.found), "Details: the statements furthest from the books are listed, worst first, with the words not found");
  check(d.outside.some((o) => /vertisols|agronomists|foundations/.test(o.text + o.missing.join(" "))), "Details: the outside facts are the ones named");
  const text = describeDetails(r);
  check(["Confidence", "Statements judged", "Where they came from: textbook p3 (1), exercise p4 (1)", "How they were found: whole exercise", "Closest match to the request: 0.42 (weak", "Statements furthest from the books", "[not found:"].every((t) => text.includes(t)), "Details: the text to copy has all of it");
  const clean = scoreAnswer({ context: passages, checks: [], coverageLow: false, usedSearchGrounding: false, weakPages: 0, text: SOIL_GROUNDED });
  check(clean.details!.outside.length === 0 && /Every statement judged was found/.test(describeDetails(clean)) && clean.details!.retrieval === "not recorded", "Details: a well grounded answer lists no outside statements");
  check(describeDetails({ correct: 80, fromBook: 80, reasons: [] }) === "", "Details: an older answer has none to describe");
  const full = scoreAnswer({ context: passages, retrieval: { mode: "full", books: 3, totalChars: 66480, sectionChunks: 0, questions: 0, supportChunks: 0, topSimilarity: null }, checks: [], coverageLow: false, usedSearchGrounding: false, weakPages: 0, text: SOIL_GROUNDED });
  check(full.details!.retrieval === "every page of the selected books was passed (3 books, 66,480 characters)", `Details: whole-book passing is described (${full.details!.retrieval})`);
  const big = scoreAnswer({ context: passages, retrieval: { mode: "search", books: 3, totalChars: 1200000, sectionChunks: 0, questions: 0, supportChunks: 0, topSimilarity: 0.6 }, checks: [], coverageLow: false, usedSearchGrounding: false, weakPages: 0, text: SOIL_GROUNDED });
  check(/too much to pass whole/.test(big.details!.retrieval) && /12,00,000/.test(big.details!.retrieval), `Details: books too large to pass whole are called out (${big.details!.retrieval})`);
}

// How much book text may be passed whole.
{
  check(fullContextBudget() === 400_000, "Budget: up to 400,000 characters (about 100,000 tokens) of book text are passed whole, whatever allowance is left");
}

// Answers to check: each answer of an exercise is judged on its own and the weak ones are flagged.
{
  const blocks = splitAnswerBlocks(SOIL_EXERCISE_ANSWER);
  check(blocks.map((b) => b.label).join("|") === "|Q1 (i)|Q1 (ii)|Q1 (iii)|Q2.1|Warm-up Q1", `Review: the answer splits into one block per question (${blocks.map((b) => b.label).join("|")})`);
  check(blocks[0].label === null && blocks[0].text.startsWith("# Unit 2") && !blocks[1].text.includes("Q1 (ii)") && blocks[1].text.includes("Black soil"), "Review: text before the first question is its own block, and each block holds only its question and answer");
  check(splitAnswerBlocks("Plain paragraphs.\n\nNo questions here.").length === 1 && splitAnswerBlocks("**Q3.2 Why?**\n**Ans:** Because.\n---\nNote after.").map((b) => b.label).join() === "Q3.2,", "Review: an answer without questions is one block, and a rule ends a question");
  const base = { context: SOIL_CONTEXT, checks: [], coverageLow: false, usedSearchGrounding: false, weakPages: 0 };
  const r = scoreAnswer({ ...base, text: SOIL_EXERCISE_ANSWER });
  const flagged = (r.review ?? []).map((x) => x.label).join("|");
  check(flagged === "Q1 (iii)|Q2.1|Warm-up Q1", `Review: the invented, unrelated and general-knowledge answers are flagged, the good ones are not (${flagged})`);
  check((r.review ?? []).every((x) => x.level === "red" && x.index >= 3) && (r.review ?? [])[2].reason === "From general knowledge, not from your books." && /Only \d+% of this answer's words are in your books\./.test((r.review ?? [])[0].reason), "Review: each flag says why, and general-knowledge answers say so");
  check(!(r.review ?? []).some((x) => x.label === "Q1 (ii)"), "Review: a short true answer (Red soil) is judged by its question, and passes");
  check(/3 answers should be checked: Q1 \(iii\), Q2\.1, Warm-up Q1\./.test(r.reasons.join(" ")), "Review: the confidence reasons name the answers to check");
  const good = scoreAnswer({ ...base, text: SOIL_GROUNDED });
  check(good.review === undefined, "Review: an answer that follows the book has nothing to check");
  check(scoreAnswer({ ...base, text: "**Q1 Soil?**\n**Ans:** Volcanic eruptions create pillow lava formations underwater near ridges." }).review === undefined, "Review: a single answer isn't flagged (an exercise needs two or more questions)");
  check(scoreAnswer({ ...base, context: [], text: SOIL_EXERCISE_ANSWER }).review === undefined, "Review: with no book passages there is nothing to compare, so no per-answer flags");
}

// The paper checker: a teacher's marking, with its marks, total and grade checked by code.
{
  const good = checkPaperMarks(PAPER_REPORT, null);
  check(good.every((c) => c.ok) && good.some((c) => c.message === "Marks add up to 12 / 15"), `Paper check: a correct report passes (${good.map((c) => c.message).join("; ")})`);
  const bad = (from: string, to: string, per: number | null = null) => checkPaperMarks(PAPER_REPORT.replace(from, to), per).filter((c) => !c.ok).map((c) => c.message);
  check(/adds up to 12 \/ 15, not the 13 \/ 15/.test(bad("Total: 12 / 15", "Total: 13 / 15").join()), "Paper check: a wrong total is caught");
  check(/is 80%, not 85%/.test(bad("(80%)", "(85%)").join()), "Paper check: a wrong percentage is caught");
  check(/80% is grade A, not B/.test(bad("Grade: A**", "Grade: B**").join()), "Paper check: a grade that doesn't follow from the percentage is caught");
  check(/6 marks is not within 0 to 5/.test(bad("| 3 | 5 | 3 |", "| 3 | 5 | 6 |").join()), "Paper check: marks above the maximum are caught");
  check(/heading says 4 \/ 5 but the table says 3 \/ 5/.test(bad("## Question 3 — 3/5", "## Question 3 — 4/5").join()), "Paper check: a question heading that disagrees with the table is caught");
  check(/Question 1 is out of 5, but every question is out of 10/.test(bad("x", "y", 10).join()) && bad("x", "y", 5).length === 0, "Paper check: when the teacher sets marks per question, every question must be out of that");
  check(checkPaperMarks("Just some text", null)[0].message.includes("no marks table"), "Paper check: a report with no table is refused");
  check(!checkPaperMarks(PAPER_REPORT.replace(/\*\*Total:[^\n]*\n/, ""), null).every((c) => c.ok), "Paper check: a report without the Total line is refused");
  check(gradeFor(90) === "A+" && gradeFor(89) === "A" && gradeFor(80) === "A" && gradeFor(70) === "B+" && gradeFor(60) === "B" && gradeFor(50) === "C" && gradeFor(40) === "D" && gradeFor(39) === "E" && gradeFor(0) === "E", "Paper check: the grades follow the scale");
  check(gradeScaleText().startsWith("A+ is 90% and above, A is 80% up to 89%") && gradeScaleText().endsWith("E is 0% up to 39%"), "Paper check: the scale given to the teacher says the same");

  // The student's wrong sums are quoted in the report: only the teacher's own sums are recomputed.
  const sums = checkArithmetic(PAPER_REPORT);
  const teacherOnly = checkArithmetic(withoutStudentWork(PAPER_REPORT));
  check(sums.some((c) => !c.ok) && teacherOnly.every((c) => c.ok) && teacherOnly.length >= 2, `Paper check: the student's wrong sums are not mistaken for the teacher's (${sums.filter((c) => !c.ok).length} wrong sums quoted, ${teacherOnly.filter((c) => !c.ok).length} counted against the teacher)`);
  check(!withoutStudentWork(PAPER_REPORT).includes("Student wrote") && withoutStudentWork(PAPER_REPORT).includes("5255 ÷ 5 = 1051"), "Paper check: quoted student lines are removed, the correct answers stay");

  // The request.
  const pq: Question = { task: "paper_check", prompt: "", totalMarks: "80", marksEach: "", language: "auto", packBookId: "", bookIds: ["b1"], photos: [], docs: [] };
  check(/Attach photos or a PDF of the solved paper/.test(questionProblem(pq) ?? ""), "Paper check: nothing attached or typed is refused, saying what to attach");
  check(questionProblem({ ...pq, prompt: "1) 12 x 15 = 170" }) === null && questionProblem({ ...pq, photos: [{ imageBase64: "AAAA", mimeType: "image/jpeg" } as never] }) === null, "Paper check: typed sums or an attached paper are enough");
  check(/Marks per question must be a number/.test(questionProblem({ ...pq, prompt: "x", marksEach: "abc" }) ?? "") && questionProblem({ ...pq, prompt: "x", marksEach: "0" }) !== null && questionProblem({ ...pq, prompt: "x", marksEach: "7" }) === null, "Paper check: marks per question must be a number from 1 to 100, or empty");
  const none = buildRequestBody({ ...pq, prompt: "Sums" });
  check(String(none.prompt).includes("Marks per question: not given") && String(none.prompt).includes("5 per question") && JSON.stringify(none.documentIds) === "[]", "Paper check: with no marks given the request says 5 per question is assumed, and no book is used");
  check(String(buildRequestBody({ ...pq, prompt: "Sums", marksEach: "8" }).prompt).includes("Marks per question (set): 8"), "Paper check: marks per question set by the teacher are sent");
  check(!String(buildRequestBody({ ...q0(), prompt: "x" }).prompt).includes("Marks per question"), "Paper check: other kinds of answer don't get a marks line");
}
function q0(): Question {
  return { task: "solution", prompt: "", totalMarks: "80", marksEach: "5", language: "auto", packBookId: "", bookIds: [], photos: [], docs: [] };
}

{
  // A streamed answer: draft pieces, then the checking stages, then the checked answer.
  const lines = [{ type: "text", delta: "Draft" }, { type: "stage", stage: "checking" }, { type: "stage", stage: "fixing" }, { type: "done", answer: { text: "Checked" } }];
  const body = new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n").body!;
  const seen: string[] = [];
  const answer = await readAnswerStream<{ text: string }>(body, { onText: (d) => seen.push(`text:${d}`), onReset: () => seen.push("reset"), onStage: (st) => seen.push(`stage:${st}`) });
  check(seen.join() === "text:Draft,stage:checking,stage:fixing" && answer.text === "Checked", "A streamed answer reports the checking stages, then gives the checked answer");
}

{
  // Maths solved twice: the numbers in a final answer, and where two solutions disagree.
  check(numbersIn("₹1,200 and 3/4, 1 1/4, −8, 23½").join() === "1200,0.75,1.25,-8,23.5", "Second solution: numbers are read as values (commas, fractions, mixed numbers, minus, ½)");
  const draft = "Step 1: 150 ÷ 3 = 50\n**Answer:** 50 km/h, which is 13.9 m/s";
  check(disagreements([{ where: "Q1", final: "50 km/h" }, { where: "Q1", final: "13.89 m/s" }], draft).length === 0, "Second solution: matching results (allowing for rounding) are not a problem");
  const off = disagreements([{ where: "Q2", final: "x = 6" }], "**Answer:** x = 7");
  check(off.length === 1 && off[0].where === "Q2" && off[0].fromSecondSolution === true && off[0].problem.includes("x = 6"), "Second solution: a different result is reported for the fix step");
  check(disagreements([{ where: "Q3", final: "5/4" }], "**Ans:** 1 1/4") .length === 0, "Second solution: 5/4 and 1 1/4 are the same answer");
  check(parseFinals('{"answers":[{"where":"Q1","final":"65°"},{"where":"Q2","final":""}]}')?.length === 1 && parseFinals("nope") === null, "Second solution: final answers are read, empty ones left out");
}
{
  // Citations: each "[S2]" must point at a passage that holds what it says, and becomes a page reference.
  const chunk = (id: string, page: number, content: string, book = "Science"): MatchedChunk =>
    ({ id, document_id: book, content, section_label: `Chapter ${page}`, page_number: page, source_type: "textbook", image_path: null, similarity: 0.8, book }) as MatchedChunk;
  const passages = [chunk("a", 14, "Plants make glucose from carbon dioxide and water using sunlight; oxygen is released."), chunk("b", 52, "Acids and bases react in neutralisation to form a salt and water.")];
  const good = "**Q1. What is photosynthesis?**\n**Ans:** Plants make glucose from carbon dioxide and water using sunlight, releasing oxygen. [S1]";
  check(checkCitations(good, passages).every((c) => c.ok) && checkCitations(good, passages)[0]?.message.includes("All 1 page reference"), "Citations: a citation whose page holds the answer passes");
  const wrong = "**Q1. What is photosynthesis?**\n**Ans:** Plants make glucose from carbon dioxide and water using sunlight, releasing oxygen. [S2]";
  const doubted = checkCitations(wrong, passages);
  check(doubted.length === 1 && !doubted[0].ok && doubted[0].message.startsWith("Q1 cites p. 52"), "Citations: a citation of the wrong page is doubted, naming the question and the page");
  check(checkCitations("**Ans:** Something. [S9]", passages).some((c) => !c.ok && c.message.includes("source 9")), "Citations: a source number that is not in the material is caught");
  check(withPageReferences(good, passages).endsWith("releasing oxygen. (p. 14)"), "Citations: marks become page references");
  check(withPageReferences("Fact. [S1, S2]", [passages[0], chunk("c", 7, "x", "History")]) === "Fact. (Science, p. 14; History, p. 7)", "Citations: with several books, the book is named");
}
{
  // Dark mode: the automatic block and the chosen-Dark block in globals.css hold the same colours.
  const { readFileSync } = await import("node:fs");
  const css = readFileSync("src/app/globals.css", "utf8");
  const blocks = [...css.matchAll(/:not\(:has\(\[data-kid-zone\]\)\) \{([\s\S]*?)\n {2}\}/g)].map((m) => m[1].trim());
  check(blocks.length === 2 && blocks[0] === blocks[1] && blocks[0].includes("--color-white"), "Dark mode: the automatic and the chosen-Dark colours are the same");
}
{
  // The quality test set's grading (scripts/quality), without the AI.
  const facts = factChecks("**Ans:** Akbar became emperor in 1556, aged 13.", ["1556", "thirteen|13", "Bairam"], ["1605"]);
  check(facts.missing.join() === "Bairam" && facts.unwanted.length === 0, "Quality: missing must-have facts are found, and either spelling counts");
  check(factChecks("It was 1605.", [], ["1605"]).unwanted.join() === "1605", "Quality: a known wrong answer is caught");
  const judged = parseJudge('{"correct":2,"complete":2,"grounded":1,"notes":"adds an outside date"}');
  check(judged?.grounded === 1 && parseJudge('{"correct":3}') === null && parseJudge("no") === null, "Quality: the examiner's scores are read, out-of-range ones refused");
  check(scoreCase({ correct: 2, complete: 2, grounded: 2, notes: "" }, { missing: [], unwanted: [] }).score === 100, "Quality: a perfect answer scores 100 and passes");
  const capped = scoreCase({ correct: 2, complete: 2, grounded: 2, notes: "" }, { missing: ["1556"], unwanted: [] });
  check(!capped.pass && capped.score === 75, "Quality: a missing must-have fact fails the case even if the examiner liked it");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
