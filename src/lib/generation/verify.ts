import { generateCompletion } from "@/lib/llm";
import type { CompletionImage, CompletionResult } from "@/lib/llm/types";
import type { AnswerCheck, GenerationTaskType } from "@/types/database";

// A second, independent reading of every answer by the AI, as an examiner would mark it: is each answer
// right, supported by the books, and complete? Code already checks the arithmetic and the marks; this
// catches what code can't: a wrong fact, a misread question, a part left out, a claim the books don't make.

export const VERIFY_SYSTEM = `You are a strict, careful examiner checking an answer written for a school student, before a parent
or tutor uses it. You are given the reference material (pages of the student's own books), the
question(s), and the answer. Be strict: a parent will trust this answer, so let no mistake through.

How to check:
1. For each question or part, work out the correct answer yourself first, from the reference material
   (and, for maths and science, by doing the working yourself). Only then read the answer.
2. Go through the answer line by line. Recompute every number, sum, conversion and unit in it, and check
   every name, date, term and option against the reference material. Report a problem when you are sure of
   it or it is likely (say "likely" in the problem when you are not certain):
   - "wrong": a fact, name, date, number, step, option or conclusion is incorrect, or the answer
     answers a different question from the one asked.
   - "missed": a question, a part of a question, or something the question explicitly asks for
     (a reason, an example, "any two") is not answered. In maths and science also: a step of the working a
     student would need is skipped, a final answer is not clearly stated, or its unit is missing.
   - "unsupported": a specific claim that the reference material does not support and that is not
     marked "(general knowledge)", where it matters for the marks or may well be untrue.
3. Literature and reading comprehension (a story, poem, play or passage): many answers are
   interpretations (a character's nature, a theme, the meaning of a line, what an event shows). An
   interpretation the text supports is correct and from the book, even if the book never says it in
   those words and even if you would have put it differently: do not report it as "unsupported" or
   "wrong". Report "wrong" only when it misreads or contradicts the text, names the wrong speaker or
   situation, or brings in events that are not in the text; report "missed" when the evidence a
   question asks for ("support your answer", "quote") is not given. In reading comprehension the
   passage printed with the questions is the source: a fact taken from outside it (even a true one)
   is "unsupported", a reasoned inference from it is not, and an answer saying the passage does not
   give something it clearly implies is "missed".
4. Do not report style, wording, length, layout, or an acceptable answer phrased differently from
   yours. Do not report a common fact that is true. If the reference material is empty, judge
   correctness from your own knowledge and do not report "unsupported".

For each problem give where it is (the question label, e.g. "Q3 (b)", or "the answer"), what is wrong
in one sentence, and the correct version in one sentence. If there are no problems, return an empty
list. Reply only with JSON.`;

const SCHEMA = {
  type: "object",
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["wrong", "missed", "unsupported"] },
          where: { type: "string" },
          problem: { type: "string" },
          fix: { type: "string" },
        },
        required: ["kind", "where", "problem", "fix"],
      },
    },
  },
  required: ["problems"],
};

export interface VerifyProblem {
  kind: "wrong" | "missed" | "unsupported";
  /** Found by solving the question a second time, not by the examiner. */
  fromSecondSolution?: boolean;
  /** Found by marking the paper a second time, independently (the paper checker). */
  fromSecondMarking?: boolean;
  /** Only a mark the head examiner settled, which code puts into the report itself: no rewrite is needed for it. */
  settledMark?: boolean;
  where: string;
  problem: string;
  fix: string;
}

/** The most problems kept from one check: more than this means the answer needs redoing anyway. */
const MAX_PROBLEMS = 12;
const KINDS = new Set(["wrong", "missed", "unsupported"]);

/** The problems in a checker's reply; anything malformed is left out. A reply that can't be read is null. */
export function parseProblems(text: string): VerifyProblem[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { problems?: unknown };
    if (!Array.isArray(parsed.problems)) return null;
    const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 400) : "");
    return parsed.problems
      .map((p) => p as Record<string, unknown>)
      .filter((p) => p && KINDS.has(String(p.kind)) && str(p.problem))
      .map((p) => ({
        kind: p.kind as VerifyProblem["kind"],
        where: str(p.where) || "the answer",
        problem: str(p.problem),
        fix: str(p.fix),
      }))
      .slice(0, MAX_PROBLEMS);
  } catch {
    return null;
  }
}

const LABEL: Record<VerifyProblem["kind"], string> = { wrong: "May be wrong", missed: "Not answered", unsupported: "Not in your books" };

/** The checker's findings as checks shown with the answer: one per problem, or one passed check. */
export function reviewChecks(problems: VerifyProblem[]): AnswerCheck[] {
  if (problems.length === 0)
    return [{ kind: "review", ok: true, message: "An independent AI check of the answer against your books found no mistakes" }];
  return problems.map((p) => ({
    kind: "review",
    ok: false,
    message: `${LABEL[p.kind]}: ${p.where}: ${p.problem}${p.fix ? ` Correct: ${p.fix}` : ""}`,
  }));
}

/** How a problem is put to the writer when it is asked to fix the answer. */
export function problemForRepair(p: VerifyProblem): string {
  return `${p.where} (${p.kind}): ${p.problem}${p.fix ? ` Should be: ${p.fix}` : ""}`;
}

/**
 * Checks an answer with a second, independent AI reading. Returns the problems found (an empty list when it
 * is fine) and the call's result for usage, or null when the check itself failed: an answer is never held
 * back because its check could not run.
 */
export async function verifyAnswer(input: {
  taskType: GenerationTaskType;
  question: string;
  answer: string;
  context: string;
  photos: CompletionImage[];
  /** How much the examiner may think first (it works each answer out itself). */
  thinking?: number;
}): Promise<{ problems: VerifyProblem[]; result: CompletionResult } | null> {
  try {
    const result = await generateCompletion({
      taskType: input.taskType,
      systemInstructions: VERIFY_SYSTEM,
      context: input.context || undefined,
      prompt: `Question(s):\n"""\n${input.question}\n"""\n\nAnswer to check:\n"""\n${input.answer}\n"""\n\nList the problems as JSON.`,
      images: input.photos,
      temperature: 0,
      maxOutputTokens: 4096,
      thinking: input.thinking ?? 8192,
      jsonSchema: SCHEMA,
    });
    const problems = parseProblems(result.text);
    if (!problems) {
      console.error("[verify] unreadable reply", result.text.slice(0, 200));
      return null;
    }
    return { problems, result };
  } catch (err) {
    console.error("[verify] check failed", err);
    return null;
  }
}
