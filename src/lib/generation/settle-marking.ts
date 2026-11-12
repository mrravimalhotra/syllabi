// A checked paper is marked twice, independently. Where the two markings give a question different marks, the
// teacher must not be handed both: a head examiner marks that question a third time with both markings, their
// reasons and the exact calculator's findings in front of them, and that mark is final. Each question then has one
// mark, and the report says how sure it is: how many of the markings agreed.

import { applySettledMarks, sectionText, tableRows, withConfidenceLine } from "@/lib/checks/paper";
import { parseMarking, type SecondMark } from "@/lib/generation/second-marking";
import { generateCompletion } from "@/lib/llm";
import type { CompletionImage, CompletionResult } from "@/lib/llm/types";
import type { AnswerCheck } from "@/types/database";

export const MODERATOR_SYSTEM = `You are the head examiner settling a school student's marks. Two examiners marked the same written
work (in the attached photos) independently and gave some questions different marks. For each disputed question you
are given both examiners' marks and reasons, and what an exact calculator found. Either examiner may be right, or
neither: an examiner's own "correct answer" can be wrong, and an examiner can misread the student's writing.

For each disputed question:
1. Read the question from the page. Solve it yourself, completely, and recompute every number (the calculator's
   findings are facts).
2. Read the student's working on the page exactly as written, digit by digit. Do not correct it in your head.
3. Decide the final marks with these rules: start from full marks; −1 for each step that is really wrong or missing;
   −½ for each real notation, unit or copying slip; a wrong final answer loses all the answer marks (about 40% of the
   question), a missing unit half of them; a wrong method gets no method marks. Never take marks off for a correct
   extra step, for work the student crossed out or corrected, or for neatness; a right final answer keeps all its
   answer marks. A whole number with a fraction beside it (5 1/4) is a mixed number. Half marks are allowed; never
   below 0 or above the maximum.
Your mark is final: give one mark per question, not a range.
Reply only with JSON, one entry per disputed question, numbered as given:
{"questions": [{"question": "15", "max": 5, "marks": 5, "correctAnswer": "₹38", "reason": "one or two short sentences: what the student did, and why this mark"}]}`;

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" }, max: { type: "number" }, marks: { type: "number" }, correctAnswer: { type: "string" }, reason: { type: "string" } },
        required: ["question", "marks", "reason"],
      },
    },
  },
  required: ["questions"],
};

/** How a question's final mark was arrived at. */
type Basis = "agreed" | "settled" | "settled alone" | "unsettled" | "single";

export interface Settlement {
  /** The marks the report must show: the second marking's, with each disputed question replaced by the head examiner's (settled: true). */
  marks: SecondMark[];
  basis: Map<string, Basis>;
  /** The head examiner's call, for the usage record (none when no question was disputed or the call failed). */
  result?: CompletionResult;
}

const key = (q: string) => q.toLowerCase().replace(/^q\.?/, "").replace(/[\s.()]/g, "");
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const differ = (a: number, b: number) => Math.abs(a - b) >= 0.5;
/** The most questions one head examiner's call settles. */
const MAX_DISPUTES = 12;

/**
 * Sets the report's marks against the second marking's and has the questions they differ on marked a third time.
 * When that marking can't be made, those questions stay unsettled (the report's mark stands, and is said to be unsure).
 */
export async function settleMarks(input: { report: string; second: SecondMark[]; question: string; photos: CompletionImage[]; findings: string[]; thinking?: number }): Promise<Settlement> {
  const rows = tableRows(input.report);
  const basis = new Map<string, Basis>(rows.map((r) => [key(r.question), "agreed" as Basis]));
  const disputes = rows
    .map((row) => ({ row, other: input.second.find((s) => key(s.question) === key(row.question)) }))
    .filter((d): d is { row: (typeof rows)[number]; other: SecondMark } => d.other !== undefined && differ(d.row.marks, d.other.marks))
    .slice(0, MAX_DISPUTES);
  if (disputes.length === 0) return { marks: input.second, basis };
  for (const d of disputes) basis.set(key(d.row.question), "unsettled");

  const cases = disputes.map(
    ({ row, other }) =>
      `Question ${row.question} (out of ${fmt(row.max)})\nFirst examiner: ${fmt(row.marks)} / ${fmt(row.max)}. Their report on it:\n${sectionText(input.report, row.question) || "(no section written)"}\n` +
      `Second examiner: ${fmt(other.marks)} / ${fmt(row.max)}.${other.reason ? ` Their reason: ${other.reason}` : ""}`
  );
  const facts = input.findings.length ? `\n\nThe exact calculator found, in the first examiner's report:\n${input.findings.map((f) => `- ${f}`).join("\n")}` : "";
  try {
    const result = await generateCompletion({
      taskType: "paper_check",
      systemInstructions: MODERATOR_SYSTEM,
      prompt: `${input.question}\n\nThe disputed questions:\n\n${cases.join("\n\n")}${facts}\n\nSettle each disputed question and give the final marks as JSON.`,
      images: input.photos,
      temperature: 0,
      maxOutputTokens: 4096,
      thinking: input.thinking ?? 8192,
      jsonSchema: SCHEMA,
    });
    const decided = parseMarking(result.text) ?? [];
    const answers = correctAnswers(result.text);
    const marks = input.second.map((s) => {
      const dispute = disputes.find((d) => key(d.row.question) === key(s.question));
      const final = dispute && decided.find((m) => key(m.question) === key(s.question));
      if (!dispute || !final) return s;
      const marksGiven = Math.min(Math.max(final.marks, 0), dispute.row.max);
      const withEither = !differ(marksGiven, dispute.row.marks) || !differ(marksGiven, s.marks);
      basis.set(key(s.question), withEither ? "settled" : "settled alone");
      const answer = answers.get(key(s.question));
      return { ...s, marks: marksGiven, max: dispute.row.max, settled: true, reason: `${final.reason}${answer ? ` Correct answer: ${answer}.` : ""}`.trim() };
    });
    return { marks, basis, result };
  } catch (err) {
    console.error("[settle marking]", err instanceof Error ? err.message : err);
    return { marks: input.second, basis };
  }
}

/** The head examiner's own answer to each question, by question, from its reply. */
function correctAnswers(reply: string): Map<string, string> {
  try {
    const v = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1)) as { questions?: { question?: unknown; correctAnswer?: unknown }[] };
    return new Map((v.questions ?? []).filter((q) => typeof q.question === "string" && typeof q.correctAnswer === "string" && q.correctAnswer).map((q) => [key(String(q.question)), String(q.correctAnswer).slice(0, 120)]));
  } catch {
    return new Map();
  }
}

/** How sure a question's mark is, by how it was arrived at. */
const SURE: Record<Basis, number> = { agreed: 95, settled: 85, "settled alone": 65, unsettled: 50, single: 70 };
/** Each sum the exact calculator still finds wrong in the report takes this off, up to the cap. */
const PER_FINDING = 5;
const FINDINGS_CAP = 15;

const list = (questions: string[]) => (questions.length <= 1 ? `Q${questions[0]}` : `${questions.slice(0, -1).map((q) => `Q${q}`).join(", ")} and Q${questions[questions.length - 1]}`);

/**
 * The marking finished: the head examiner's marks are in the report whatever the last rewrite did (put in by code,
 * with the total and grade), each question has one mark, and the report says how sure it is. `settlement` is null
 * when the paper could only be marked once. `codeChecks` recomputes the report's sums and marks.
 */
export function finishMarking(report: string, settlement: Settlement | null, codeChecks: (text: string) => AnswerCheck[]): { text: string; checks: AnswerCheck[] } {
  const settled = settlement?.marks.filter((m) => m.settled) ?? [];
  const text = applySettledMarks(report, settled);
  const code = codeChecks(text);
  const rows = tableRows(text);
  const basisOf = (question: string): Basis => {
    if (!settlement) return "single";
    const b = settlement.basis.get(key(question)) ?? "single";
    // Agreed at first, but a later rewrite moved the mark away from the second marking's: no longer agreed.
    const second = settlement.marks.find((m) => key(m.question) === key(question));
    const row = rows.find((r) => key(r.question) === key(question));
    return b === "agreed" && second && row && differ(row.marks, second.marks) ? "unsettled" : b;
  };
  const each = rows.map((r) => ({ question: r.question, basis: basisOf(r.question) }));
  const wrongSums = code.filter((c) => !c.ok && c.kind === "calculation").length;
  const mean = each.length ? each.reduce((sum, q) => sum + SURE[q.basis], 0) / each.length : SURE.single;
  const percent = Math.max(30, Math.round(mean - Math.min(wrongSums * PER_FINDING, FINDINGS_CAP)));

  const of = (b: Basis) => each.filter((q) => q.basis === b).map((q) => q.question);
  const third = [...of("settled"), ...of("settled alone")];
  const alone = of("settled alone");
  const open = of("unsettled");
  const twice = "Every question was marked twice, independently";
  const how = !settlement
    ? "The paper could only be marked once this time (the second, independent marking could not run), so check the marks carefully."
    : third.length > 0
      ? `${twice}. The markings differed on ${list(third)}, so a head examiner marked ${third.length === 1 ? "it" : "them"} a third time with both markings in hand, and that mark is final.`
      : open.length > 0
        ? `${twice}.`
        : `${twice}, and the two markings agreed.`;
  const checks: AnswerCheck[] = [{ kind: "review", ok: Boolean(settlement), message: `Confidence in these marks: ${percent}%. ${how}` }];
  if (alone.length) checks.push({ kind: "review", ok: false, message: `Least sure: ${list(alone)}. All three markings differed there, and the head examiner's mark is used. Worth a look by hand.` });
  if (open.length) checks.push({ kind: "review", ok: false, message: `Least sure: ${list(open)}. The two markings differed and a third could not be made this time. Check ${open.length === 1 ? "it" : "them"} by hand, or check the paper again.` });
  return { text: withConfidenceLine(text, percent), checks: [...code, ...checks] };
}
