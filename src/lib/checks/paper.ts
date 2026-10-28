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

/** The report without lines that quote the student's own (possibly wrong) working, so only the teacher's sums are checked. */
export function withoutStudentWork(report: string): string {
  return report
    .split("\n")
    .filter((line) => !/student|✗|wrote|writes|their working|\bwrong\b|incorrect/i.test(line))
    .join("\n");
}
