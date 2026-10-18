import { describe, explain, worksheetMarkdown, makeQuiz, markOrder, normaliseSettings, parseSample, settingsProblem, type OrderSettings } from "@/lib/practice/order";
import type { PracticeNumber } from "@/lib/practice/numbers";
import { makeCompareQuiz, makeCvcQuiz, makeSightQuiz, type CompareSettings, type SightSettings } from "@/lib/kindergarten/quiz";
import { IPA, PHONEMES, blendStart, soundText } from "@/lib/kindergarten/phonics";
import { makeBlendQuiz } from "@/lib/kindergarten/quiz";
import { blockedReason, buildRequestBody, questionProblem, type Question } from "@/app/dashboard/_ask/build-request";
import { checkPages } from "@/lib/ingestion/upload-pages";
import { parsePhotos } from "@/lib/generation/attachments";
import { pdfDisposition } from "@/lib/pdf/disposition";
import { signUpProblem, signUpRefusal } from "@/lib/signup-check";
import { parseGenerationRequest } from "@/lib/generation/request";
import { parseProfileUpdate } from "@/lib/profile-update";
import { parseAccountUpdate } from "@/lib/account-update";
import { parseStudyPackRequest } from "@/lib/study-pack/request";
import { parseProblem } from "@/lib/worked/parse";
import { describeOutcome } from "@/app/dashboard/library/_parts/upload-book";
import { LOGIN_ID, internalEmail, looksLikeLoginId, normaliseLoginId } from "@/lib/login-id";
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
  const q: Question = { task: "solution", prompt: "  What is 12 x 15?  ", totalMarks: "80", language: "auto", packBookId: "", bookIds: ["b1", "b2"], photos: [], docs: [] };
  check(questionProblem({ ...q, prompt: "  " }) === "Type a question or attach a photo or file first.", "An empty question is refused");
  check(questionProblem(q) === null && questionProblem({ ...q, prompt: "", docs: [{ name: "a.docx", text: "hi" }] }) === null, "A question or an attachment is enough");
  check(questionProblem({ ...q, task: "study_pack" }) !== null && questionProblem({ ...q, task: "study_pack", packBookId: "b1" }) === null, "A study pack needs a chapter or pages");
  const body = buildRequestBody({ ...q, docs: [{ name: "a.docx", text: "Hello" }] });
  check(body.prompt === "What is 12 x 15?" && JSON.stringify(body.documentIds) === '["b1","b2"]' && body.attachedText === 'Attached file "a.docx":\nHello', "An answer request carries the trimmed question, the books and the attached text");
  check(buildRequestBody({ ...q, task: "sample_paper", prompt: "Class 6 maths" }).prompt === "Class 6 maths\n\nTotal marks: 80", "A sample paper asks for the marks");
  check(buildRequestBody({ ...q, docs: [{ name: "big", text: "x".repeat(50_000) }] }).attachedText?.toString().length === 20_000, "Attached text is cut to the allowed length");
  const pack = buildRequestBody({ ...q, task: "study_pack", packBookId: "b1", prompt: " focus " });
  check(pack.documentId === "b1" && pack.focus === "focus" && JSON.stringify(pack.photos) === "[]" && !("documentIds" in pack), "A study pack request names the chapter");
  check(blockedReason({ overQuota: true, noBookSelected: true, readingFiles: true })?.includes("allowance") === true, "Over the allowance is the first reason given");
  check(blockedReason({ overQuota: false, noBookSelected: true, readingFiles: true })?.includes("no book is selected") === true && blockedReason({ overQuota: false, noBookSelected: false, readingFiles: true })?.includes("attachment") === true, "Then no book, then still reading a file");
  check(blockedReason({ overQuota: false, noBookSelected: false, readingFiles: false }) === null, "Nothing blocking means no message");
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
