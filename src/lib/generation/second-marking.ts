import { generateCompletion } from "@/lib/llm";
import type { CompletionImage, CompletionResult } from "@/lib/llm/types";
import { tableRows } from "@/lib/checks/paper";
import type { VerifyProblem } from "@/lib/generation/verify";
import { getLlmSetting } from "@/lib/llm/config";
import { BlockedReplyError } from "@/lib/errors";

// A checked paper is marked twice: a second examiner marks the same pages independently and gives only each
// question's marks, and code compares them with the report's marks table. A question the two markings disagree
// on goes to the fix step like any other problem, so the teacher looks at it again with both in front of it;
// if they still disagree, the parent is told which question to look at.

export const SECOND_MARKING_SYSTEM = `You are an experienced, strict board examiner marking a school student's written work from photos, as a
second marker. Mark every question independently, from scratch: work out the correct answer and method yourself,
then read the student's working. Read every number exactly as the student wrote it, with its decimal point (105
written for 10.5 is a slip, even if later lines use 10.5): never correct the student's working in your head.
Start from full marks and take off: 1 mark for each wrong or missing step; ½ mark for each notation, unit or
copying slip (every one counts); all the answer marks for a wrong final answer, ½ of them for a missing unit; no
method marks for a wrong method; only the answer marks for an answer with no working. A wrong value carried into
the very next step keeps that one step's mark, no more. Full marks only for a complete, fully correct solution
with every step shown. Never take off for a correct extra step (writing (p²)(p²) before p⁴), for work the
student crossed out or corrected, or for neatness; a right final answer keeps all its answer marks. A whole number
with a fraction beside it (5 1/4 %, 3½ years) is a mixed number, 5.25, never 5 × 1/4. Never below 0.
Use the maximum marks
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
  /** Set when the two markings differed and a head examiner settled the question: this mark is final (lib/generation/settle-marking.ts). */
  settled?: boolean;
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
    if (s.settled) {
      return [
        {
          kind: "wrong" as const,
          fromSecondMarking: true,
          settledMark: true,
          where: `Q${row.question}`,
          problem: `The two markings differed, so the head examiner marked it a third time and settled it at ${fmt(s.marks)} / ${fmt(row.max)}${s.reason ? `: ${s.reason}` : "."} The report says ${fmt(row.marks)} / ${fmt(row.max)}.`,
          fix: `Give Q${row.question} exactly ${fmt(s.marks)} / ${fmt(row.max)}: rewrite its section (correct answer, the ✓ and ✗ lines, the Marks line) to agree with the head examiner, and correct the table, total and grade.`,
        },
      ];
    }
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

/** The model for the second marking when papers are marked with Gemini (SECOND_MARKING_MODEL changes it). */
// Gemini 2.5 Flash-Lite was retired for new keys (404, 2026-11-13); the -latest name follows Google's current Flash-Lite.
const SECOND_MARKING_MODEL = "gemini-flash-lite-latest";

/** The second, independent marking, or null when it could not be made (never holds the report back). */
export async function markAgain(input: { question: string; photos: CompletionImage[]; thinking?: number }): Promise<{ marks: SecondMark[]; result: CompletionResult } | null> {
  try {
    // A cheaper model than the main marking's, which also makes the second marking more independent of it. If that
    // model can't be used (retired, renamed), the paper-checking model marks it instead, so the second marking still happens.
    const { provider } = await getLlmSetting("paper_check");
    const request = {
      taskType: "paper_check" as const,
      systemInstructions: SECOND_MARKING_SYSTEM,
      prompt: `${input.question}\n\nMark each question and give the marks as JSON.`,
      images: input.photos,
      temperature: 0.1,
      maxOutputTokens: 4096,
      thinking: input.thinking ?? 8192,
      jsonSchema: SCHEMA,
    };
    const cheaper = provider === "google" ? process.env.SECOND_MARKING_MODEL || SECOND_MARKING_MODEL : null;
    const result = cheaper
      ? await generateCompletion({ ...request, model: cheaper }).catch((err: unknown) => {
          if (err instanceof BlockedReplyError) throw err;
          console.warn(`[second marking] ${cheaper} failed; using the paper-checking model`, err instanceof Error ? err.message : err);
          return generateCompletion(request);
        })
      : await generateCompletion(request);
    const marks = parseMarking(result.text);
    return marks && marks.length > 0 ? { marks, result } : null;
  } catch (err) {
    console.error("[second marking]", err instanceof Error ? err.message : err);
    return null;
  }
}
