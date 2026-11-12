import { sameValue, wrongAlgebraSteps } from "@/lib/checks/algebra";
import { checkArithmetic } from "@/lib/checks/arithmetic";
import type { AnswerCheck } from "@/types/database";

/** Marks for one question when none are printed on the paper and none are given. */
export const DEFAULT_MARKS_PER_QUESTION = 5;

/** The grade for a percentage: the same scale is given to the teacher (the AI) and used to check what it wrote. */
const GRADES: { min: number; grade: string }[] = [
  { min: 90, grade: "A+" },
  { min: 80, grade: "A" },
  { min: 70, grade: "B+" },
  { min: 60, grade: "B" },
  { min: 50, grade: "C" },
  { min: 40, grade: "D" },
  { min: 0, grade: "E" },
];

export function gradeFor(percent: number): string {
  return (GRADES.find((g) => percent >= g.min) ?? GRADES[GRADES.length - 1]).grade;
}

/** "A+ is 90% and above, A is 80 to 89%, ...": the scale in words, for the teacher's instructions. */
export function gradeScaleText(): string {
  return GRADES.map((g, i) => (i === 0 ? `${g.grade} is ${g.min}% and above` : `${g.grade} is ${g.min}% up to ${GRADES[i - 1].min - 1}%`)).join(", ");
}

const NUMBER = "(\\d+(?:\\.\\d+)?)";
const TOTAL = new RegExp(`Total:\\**\\s*${NUMBER}\\s*/\\s*${NUMBER}\\s*\\(\\s*${NUMBER}\\s*%\\s*\\)`, "i");
const GRADE = /Grade:\**\s*\**\s*([A-E]\+?)(?![A-Za-z])/i;
const HEADING = new RegExp(`^#{2,3}\\s*Question\\s+(\\S+?)\\s*[—–-]+\\s*${NUMBER}\\s*/\\s*${NUMBER}`, "i");

export interface MarksRow {
  question: string;
  max: number;
  marks: number;
}

/** The rows of the marks table: | Q | Max | Marks | Steps | Answer |. */
export function tableRows(report: string): MarksRow[] {
  const rows: MarksRow[] = [];
  for (const line of report.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.replace(/\*/g, "").trim());
    if (cells.length < 3) continue;
    const max = Number(cells[1]);
    const marks = Number(cells[2]);
    if (cells[1] === "" || cells[2] === "" || Number.isNaN(max) || Number.isNaN(marks)) continue;
    rows.push({ question: cells[0].replace(/^Q\.?\s*/i, ""), max, marks });
  }
  return rows;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Checks a marking report by code: every question's marks are within its maximum, the table adds up to the total
 * shown, the percentage and the grade follow from it, each question's heading agrees with the table, and (when the
 * teacher set marks per question) every question is out of that. Problems are asked to be corrected.
 */
export function checkPaperMarks(report: string, marksPerQuestion: number | null): AnswerCheck[] {
  const rows = tableRows(report);
  if (rows.length === 0) return [{ kind: "marks", ok: false, message: "The report has no marks table (| Q | Max | Marks | Steps | Answer |)" }];
  const checks: AnswerCheck[] = [];

  const over = rows.filter((r) => r.marks > r.max || r.marks < 0);
  if (over.length > 0) checks.push({ kind: "marks", ok: false, message: `Question ${over[0].question}: ${fmt(over[0].marks)} marks is not within 0 to ${fmt(over[0].max)}` });

  if (marksPerQuestion !== null) {
    const off = rows.find((r) => r.max !== marksPerQuestion);
    if (off) checks.push({ kind: "marks", ok: false, message: `Question ${off.question} is out of ${fmt(off.max)}, but every question is out of ${marksPerQuestion}` });
  }

  const marks = rows.reduce((sum, r) => sum + r.marks, 0);
  const max = rows.reduce((sum, r) => sum + r.max, 0);
  const total = TOTAL.exec(report);
  if (!total) {
    checks.push({ kind: "marks", ok: false, message: "The report has no 'Total: 17 / 25 (68%)' line" });
  } else {
    const [shownMarks, shownMax, shownPercent] = [Number(total[1]), Number(total[2]), Number(total[3])];
    if (Math.abs(shownMarks - marks) > 0.001 || Math.abs(shownMax - max) > 0.001) {
      checks.push({ kind: "marks", ok: false, message: `The table adds up to ${fmt(marks)} / ${fmt(max)}, not the ${fmt(shownMarks)} / ${fmt(shownMax)} shown` });
    } else {
      checks.push({ kind: "marks", ok: true, message: `Marks add up to ${fmt(marks)} / ${fmt(max)}` });
    }
    const percent = max === 0 ? 0 : (marks / max) * 100;
    if (Math.abs(shownPercent - percent) > 1) checks.push({ kind: "marks", ok: false, message: `${fmt(marks)} / ${fmt(max)} is ${Math.round(percent)}%, not ${fmt(shownPercent)}%` });
    const grade = GRADE.exec(report);
    const expected = gradeFor(Math.round(percent));
    if (!grade) checks.push({ kind: "marks", ok: false, message: "The report has no 'Grade:' line" });
    else if (grade[1].toUpperCase() !== expected) checks.push({ kind: "marks", ok: false, message: `${Math.round(percent)}% is grade ${expected}, not ${grade[1].toUpperCase()}` });
  }

  for (const line of report.split("\n")) {
    const h = HEADING.exec(line.trim());
    const row = h && rows.find((r) => r.question.toLowerCase() === h[1].toLowerCase());
    if (h && row && (Math.abs(row.marks - Number(h[2])) > 0.001 || Math.abs(row.max - Number(h[3])) > 0.001)) {
      checks.push({ kind: "marks", ok: false, message: `Question ${row.question}: the heading says ${h[2]} / ${h[3]} but the table says ${fmt(row.marks)} / ${fmt(row.max)}` });
    }
  }
  return checks;
}

/** The score line of a marking report ("Total: 12 / 15 (80%) · Grade: A"), or null when the text is not one. */
export function paperSummary(text: string): { marks: number; max: number; percent: number; grade: string } | null {
  if (!/^#\s*Paper check/i.test(text.trim())) return null;
  const total = TOTAL.exec(text);
  const grade = GRADE.exec(text);
  return total ? { marks: Number(total[1]), max: Number(total[2]), percent: Number(total[3]), grade: grade ? grade[1].toUpperCase() : gradeFor(Math.round(Number(total[3]))) } : null;
}

// A step of the student's working the teacher marked right: "- ✓ Rate = 10(1)/(2)% = 10.5%".
const TICKED = /^\s*(?:[-*+•]\s*)?✓/;

/** The report without lines that quote the student's own working (wrong or ticked), so only the teacher's sums are checked. */
export function withoutStudentWork(report: string): string {
  return report
    .split("\n")
    .filter((line) => !TICKED.test(line) && !/student|✗|wrote|writes|their working|\bwrong\b|incorrect/i.test(line))
    .join("\n");
}

/**
 * Recomputes the steps the teacher ticked as right. A ticked step whose sum is wrong ("10½% = 105%": the decimal point
 * left out) was misread or passed over, so it is sent back to be marked wrong, quoted as the student wrote it.
 */
export function checkTickedSteps(report: string): AnswerCheck[] {
  const ticked = report.split("\n").filter((line) => TICKED.test(line));
  const markWrong = `Mark it ✗ as "Student wrote: …" exactly as written, take off marks for it, and correct the table, total and grade.`;
  const sums = checkArithmetic(ticked.map((line) => line.replace(TICKED, "")).join("\n")).map((c) =>
    c.ok ? c : { ...c, message: `A step marked ✓ in the student's working is wrong: ${c.message}. ${markWrong}` }
  );
  // Algebra too ("9x² - 2(9x)(4y) + 4y²" written for (9x - 4y)²): each ticked step must equal the question it works on.
  const algebra = questionSections(report).flatMap(({ label, question, lines }) =>
    lines
      .filter((line) => TICKED.test(line))
      .flatMap((line) => wrongAlgebraSteps(`${question}, ${line.replace(TICKED, "")}`))
      .map(({ step, shouldEqual }): AnswerCheck => ({
        kind: "calculation",
        ok: false,
        message: `Question ${label}: a step marked ✓ in the student's working is wrong: ${step} is not equal to ${shouldEqual}. ${markWrong}`,
      }))
  );
  return [...sums, ...algebra];
}

// A mixed number as questions are copied: 5(1/4), 5(1)/(4), 5 1/4 (a proper fraction after a whole number).
const MIXED = String.raw`(?<![\d./(])(\d+)\s*(?:\(\s*(\d+)\s*\/\s*(\d+)\s*\)|\((\d+)\)\s*\/\s*\((\d+)\)|\s(\d+)\s*\/\s*(\d+))(?![\d/])`;
// What it is said to equal: 21/4, (21)/(4), 5.25, 1.25.
const VALUE = String.raw`\(?(\d+(?:\.\d+)?)\)?(?:\s*\/\s*\(?(\d+)\)?)?`;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
/** The whole number, numerator and denominator of a MIXED match, whichever way it was written. */
const mixedParts = (m: RegExpMatchArray) => ({ whole: Number(m[1]), num: Number(m[2] ?? m[4] ?? m[6]), den: Number(m[3] ?? m[5] ?? m[7]) });

/** The mixed numbers a question has, as "5 1/4". */
function mixedNumbersIn(question: string): Set<string> {
  const found = new Set<string>();
  for (const m of question.matchAll(new RegExp(MIXED, "g"))) {
    const { whole, num, den } = mixedParts(m);
    if (num < den) found.add(`${whole} ${num}/${den}`);
  }
  return found;
}

/**
 * Mixed numbers in a question ("at 5(1/4)% for 3(1/2) years") are a whole number plus a fraction (5.25), never a
 * multiplication (1.25). Where the teacher's own line turns one into the product, it is sent back; so is a student's
 * step marked ✗ that turns it into the right value ("5 1/4 = 21/4").
 */
export function checkMixedNumbers(report: string): AnswerCheck[] {
  return questionSections(report).flatMap(({ label, lines }): AnswerCheck[] => {
    const question = lines.map((l) => QUESTION_LINE.exec(l)?.[1]).find(Boolean) ?? "";
    const inQuestion = mixedNumbersIn(question);
    if (inQuestion.size === 0) return [];
    const found = new Map<string, AnswerCheck>();
    for (const line of lines) {
      if (QUESTION_LINE.test(line)) continue;
      const students = /✗|Student wrote/i.test(line);
      for (const m of line.matchAll(new RegExp(`${MIXED}\\s*%?\\s*=\\s*${VALUE}`, "g"))) {
        const { whole, num, den } = mixedParts(m);
        const name = `${whole} ${num}/${den}`;
        if (!inQuestion.has(name)) continue;
        const value = Number(m[8]) / (m[9] ? Number(m[9]) : 1);
        const [mixed, product] = [whole + num / den, (whole * num) / den];
        const is = `${name} in the question is a mixed number, ${whole} + ${num}/${den} = ${fmt(mixed)}, not ${whole} × ${num}/${den}`;
        if (students && close(value, mixed)) {
          found.set(`s${name}`, { kind: "marks", ok: false, message: `Question ${label}: a step marked ✗ is right: ${is}, as the student wrote. Put it on the ✓ line, give its marks back, mark the rest of the working from there, and correct the table, total and grade.` });
        } else if (!students && close(value, product) && !close(product, mixed)) {
          found.set(`t${name}`, { kind: "calculation", ok: false, message: `Question ${label}: ${is}. Work the question out again with ${fmt(mixed)}, mark the student's working against that, and correct the marks, table, total and grade.` });
        }
      }
    }
    return [...found.values()];
  });
}

// A question's section of the report: its "## Question 3 — 4/5" heading up to the next one.
const SECTION = /^#{2,3}\s*Question\s+(\S+?)\s*[—–-]/;
const QUESTION_LINE = /^\s*\**Question:\**\s*(.+)$/i;
const CORRECT_ANSWER = /^\s*\**Correct answer:\**\s*(.+)$/i;
const CORRECT_STEP = /^\s*(?:[-*+•]\s*)?✔\s*Correct step:\s*(.+)$/i;

/** Each question in a marking report: its label, the question as read, and the lines under it. */
function questionSections(report: string): { label: string; question: string; lines: string[] }[] {
  const sections: { label: string; question: string; lines: string[] }[] = [];
  for (const line of report.split("\n")) {
    const heading = SECTION.exec(line.trim());
    if (heading) sections.push({ label: heading[1], question: "", lines: [] });
    else if (sections.length > 0) {
      const current = sections[sections.length - 1];
      const question = QUESTION_LINE.exec(line);
      // The maths of the question: after its instruction ("Evaluate using the identity ...: (p² + q²)(p² - q²)").
      if (question && !current.question) current.question = question[1].replace(/\s*\(question inferred\)\s*$/i, "").split(/:\s+/).pop()!.trim();
      current.lines.push(line);
    }
  }
  return sections;
}

/**
 * The teacher's own algebra: a question's correct answer, and each correct step given under a wrong one, must equal
 * the question ("(5x - 3/(8y))²" is not "25x² - (15/4)xy + 9/(64y²)"). A wrong one is sent back to be corrected.
 */
export function checkTeacherAlgebra(report: string): AnswerCheck[] {
  return questionSections(report).flatMap(({ label, question, lines }) => {
    const given = lines.flatMap((line) => {
      const answer = CORRECT_ANSWER.exec(line) ?? CORRECT_STEP.exec(line);
      return answer ? [answer[1].replace(/^=\s*/, "").replace(/\*\*/g, "")] : [];
    });
    return given.flatMap((g) => wrongAlgebraSteps(`${question}, = ${g}`)).map(
      ({ step, shouldEqual }): AnswerCheck => ({
        kind: "calculation",
        ok: false,
        message: `Question ${label}: the correct answer or step given, ${step}, is not equal to ${shouldEqual}. Work it out again and correct it, and the marks if they depend on it.`,
      })
    );
  });
}

// A step marked wrong: "✗ Student wrote: = (p²)(p²) - (q²)(q²) (−1 mark for ...)", the step without its comment.
const MARKED_WRONG = /^\s*(?:[-*+•]\s*)?✗\s*Student wrote:\s*(.+?)\s*(?:\((?:−|-)\s*[\d½.]+\s*marks?\b.*\)|→.*)?\s*$/;

/**
 * Steps marked ✗ that are in fact right: the step has the same value as the question ("(50)(50) - (3)(3)" for 53 × 47,
 * a correct extra step, or the right final answer). They are sent back to be marked ✓ with their marks given back.
 */
export function checkWronglyMarked(report: string): AnswerCheck[] {
  return questionSections(report).flatMap(({ label, question, lines }) =>
    lines.flatMap((line): AnswerCheck[] => {
      const quoted = MARKED_WRONG.exec(line)?.[1];
      // The value the step ends with: "Ans = 2491" is 2491, "= p⁴ - q⁴" is p⁴ - q⁴.
      const step = quoted?.split("=").pop()?.trim();
      if (!step || !question || sameValue(step, question) !== true) return [];
      return [
        {
          kind: "marks",
          ok: false,
          message: `Question ${label}: a step marked ✗ is right: ${step} equals ${question}. A correct step, even an extra one, or a right answer loses no marks: put it on the ✓ line, give its marks back, and correct the table, total and grade.`,
        },
      ];
    })
  );
}

const MARKS_LINE = /Answer\s+([\d.]+½?|½)\s*\/\s*([\d.]+)/i;
const mark = (text: string) => (text === "½" ? 0.5 : Number(text.replace("½", "")) + (text.endsWith("½") ? 0.5 : 0));

/** A question whose answer is marked right (✓ in the table) but loses answer marks (other than for a missing unit). */
export function checkRightAnswerMarks(report: string): AnswerCheck[] {
  const answerRight = new Map<string, boolean>();
  for (const line of report.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.replace(/\*/g, "").trim());
    if (cells.length >= 5 && /\d/.test(cells[1])) answerRight.set(cells[0].replace(/^Q\.?\s*/i, ""), cells[4] === "✓");
  }
  return questionSections(report).flatMap(({ label, lines }): AnswerCheck[] => {
    const text = lines.join("\n");
    const marks = MARKS_LINE.exec(text);
    if (!answerRight.get(label) || !marks || /\bunit/i.test(text)) return [];
    const [got, out] = [mark(marks[1]), mark(marks[2])];
    if (!(got < out)) return [];
    return [
      {
        kind: "marks",
        ok: false,
        message: `Question ${label}: the answer is marked right (✓) but gets ${fmt(got)} of its ${fmt(out)} answer marks. A right final answer keeps all its answer marks (only a missing unit costs some): give them back and correct the table, total and grade.`,
      },
    ];
  });
}

const CONFIDENCE = /^\**Confidence in these marks:\**\s*(\d{1,3})\s*%/im;

/** The report with "Confidence in these marks: N%" under its total (replacing one already there). */
export function withConfidenceLine(report: string, percent: number): string {
  const line = `**Confidence in these marks: ${percent}%**`;
  const lines = report.split("\n").filter((l) => !CONFIDENCE.test(l.trim()));
  const at = lines.findIndex((l) => TOTAL.test(l));
  if (at === -1) return report;
  lines.splice(at + 1, 0, "", line);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** How sure the marks are (0 to 100), when the report says. */
export function paperConfidence(report: string): number | null {
  const found = CONFIDENCE.exec(report);
  return found ? Number(found[1]) : null;
}

const sameQuestion = (a: string, b: string) => a.toLowerCase().replace(/[\s.()]/g, "") === b.toLowerCase().replace(/^q\.?/, "").replace(/[\s.()]/g, "");

/** A question's section of the report as written (without its heading); "" when there is none. */
export function sectionText(report: string, question: string): string {
  return (questionSections(report).find((s) => sameQuestion(s.label, question))?.lines ?? []).join("\n").trim();
}

/**
 * Puts settled marks into the report by code, so that whatever the last rewrite did each settled question shows its
 * final mark everywhere: the table row, its heading, its Marks line (with the reason), and the total, percentage and
 * grade. A question that already shows its settled mark is left as it is.
 */
export function applySettledMarks(report: string, settled: { question: string; marks: number; reason: string }[]): string {
  const rows = tableRows(report);
  const changes = settled.filter((s) => rows.some((r) => sameQuestion(r.question, s.question) && Math.abs(r.marks - s.marks) > 0.001));
  if (changes.length === 0) return report;
  const final = (question: string) => changes.find((s) => sameQuestion(question, s.question));
  let section: (typeof changes)[number] | undefined;
  const lines = report.split("\n").map((line) => {
    const heading = HEADING.exec(line.trim());
    if (heading) {
      section = final(heading[1]);
      return section ? line.replace(/[—–-]+\s*[\d.½]+\s*\/\s*([\d.]+)\s*$/, `— ${fmt(section.marks)}/$1`) : line;
    }
    if (/^#{1,3}\s/.test(line.trim())) section = undefined;
    if (line.trim().startsWith("|")) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|");
      const change = cells.length >= 3 && !Number.isNaN(Number(cells[1])) && cells[1].trim() !== "" ? final(cells[0].replace(/\*/g, "").trim().replace(/^Q\.?\s*/i, "")) : undefined;
      if (change) cells[2] = ` ${fmt(change.marks)} `;
      return change ? `|${cells.join("|")}|` : line;
    }
    if (section && /^\s*\**Marks:\**/i.test(line)) {
      const max = rows.find((r) => sameQuestion(r.question, section!.question))?.max;
      return `**Marks:** ${fmt(section.marks)}/${max === undefined ? "?" : fmt(max)}. Settled by the head examiner${section.reason ? `: ${section.reason}` : "."}`;
    }
    return line;
  });
  const now = tableRows(lines.join("\n"));
  const [marks, max] = [now.reduce((sum, r) => sum + r.marks, 0), now.reduce((sum, r) => sum + r.max, 0)];
  const percent = max === 0 ? 0 : Math.round((marks / max) * 100);
  return lines
    .map((line) => (TOTAL.test(line) ? `**Total: ${fmt(marks)} / ${fmt(max)} (${percent}%) · Grade: ${gradeFor(percent)}**` : line))
    .join("\n");
}
