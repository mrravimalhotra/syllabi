import { generateCompletion } from "@/lib/llm";
import type { CompletionImage, CompletionResult } from "@/lib/llm/types";
import { tableRows } from "@/lib/checks/paper";
import type { VerifyProblem } from "@/lib/generation/verify";

// A checked paper is marked twice: a second examiner marks the same pages independently and gives only each
// question's marks, and code compares them with the report's marks table. A question the two markings disagree
// on goes to the fix step like any other problem, so the teacher looks at it again with both in front of it;
// if they still disagree, the parent is told which question to look at.

export const SECOND_MARKING_SYSTEM = `You are an experienced, fair examiner marking a school student's written work from photos, as a second
marker. Mark every question independently, from scratch: work out the correct answer and method yourself,
then read the student's working and give marks for each correct step and the final answer, as a board
examiner would (method marks for correct working even when the final answer is wrong). Use the maximum marks
printed on the paper, or the marks per question the request gives. Reply only with JSON, one entry per
question as numbered on the paper ("1", "2(a)"):
{"questions": [{"question": "1", "max": 5, "marks": 3, "reason": "one short sentence on where marks were lost"}]}`;

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" }, max: { type: "number" }, marks: { type: "number" }, reason: { type: "string" } },
        required: ["question", "marks"],
      },
    },
  },
  required: ["questions"],
};

export interface SecondMark {
  question: string;
  max: number | null;
  marks: number;
  reason: string;
}

/** The second marking read back; null when the reply can't be read. */
export function parseMarking(text: string): SecondMark[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as { questions?: unknown };
    if (!Array.isArray(v.questions)) return null;
    return v.questions
      .map((q) => q as Record<string, unknown>)
      .filter((q) => q && typeof q.question === "string" && typeof q.marks === "number" && Number.isFinite(q.marks))
      .map((q) => ({
        question: String(q.question).replace(/^Q\.?\s*/i, "").trim().slice(0, 20),
        max: typeof q.max === "number" && Number.isFinite(q.max) ? q.max : null,
        marks: q.marks as number,
        reason: typeof q.reason === "string" ? q.reason.trim().slice(0, 200) : "",
      }))
      .slice(0, 60);
  } catch {
    return null;
  }
}

const key = (q: string) => q.toLowerCase().replace(/[\s.()]/g, "");
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Questions where the report's marks differ from the second marking's by half a mark or more. */
export function markingDisagreements(second: SecondMark[], report: string): VerifyProblem[] {
  const rows = tableRows(report);
  return second.flatMap((s) => {
    const row = rows.find((r) => key(r.question) === key(s.question));
    if (!row || Math.abs(row.marks - s.marks) < 0.5) return [];
    return [
      {
        kind: "wrong" as const,
        fromSecondMarking: true,
        where: `Q${row.question}`,
        problem: `An independent second marking gave ${fmt(s.marks)} / ${fmt(row.max)}${s.reason ? ` (${s.reason})` : ""}, not ${fmt(row.marks)} / ${fmt(row.max)}.`,
        fix: `Look at Q${row.question}'s working again; if ${fmt(s.marks)} is right, use it and correct the total and grade.`,
      },
    ];
  });
}

/** The second, independent marking, or null when it could not be made (never holds the report back). */
export async function markAgain(input: { question: string; photos: CompletionImage[]; thinking?: number }): Promise<{ marks: SecondMark[]; result: CompletionResult } | null> {
  try {
    const result = await generateCompletion({
      taskType: "paper_check",
      systemInstructions: SECOND_MARKING_SYSTEM,
      prompt: `${input.question}\n\nMark each question and give the marks as JSON.`,
      images: input.photos,
      temperature: 0.1,
      maxOutputTokens: 4096,
      thinking: input.thinking ?? 8192,
      jsonSchema: SCHEMA,
    });
    const marks = parseMarking(result.text);
    return marks && marks.length > 0 ? { marks, result } : null;
  } catch (err) {
    console.error("[second marking]", err instanceof Error ? err.message : err);
    return null;
  }
}
