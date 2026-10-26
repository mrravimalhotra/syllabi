import { generateCompletion } from "@/lib/llm";
import type { CompletionImage, CompletionResult } from "@/lib/llm/types";
import type { GenerationTaskType } from "@/types/database";
import type { VerifyProblem } from "@/lib/generation/verify";

// Maths answers are worked out twice: a second, independent solution gives only its final answers, and code
// compares them with the answer's. A disagreement goes to the fix step like any other problem, so the AI
// looks again with both results in front of it, and if it still disagrees the parent is told.

export const SECOND_SOLVE_SYSTEM = `You are an expert maths teacher solving questions for an answer key. Solve every question in the request
yourself, from scratch, carefully: do the working, check every calculation a second way, and watch units.
Use the reference material for the method when it shows one. Reply only with JSON: one entry per question
or part, with its label (as printed, e.g. "Q3 (b)") and the final answer only (the value with its unit, e.g.
"₹680" or "x = 6" or "65°"):
{"answers": [{"where": "Q1", "final": "..."}]}`;

const SCHEMA = {
  type: "object",
  properties: {
    answers: { type: "array", items: { type: "object", properties: { where: { type: "string" }, final: { type: "string" } }, required: ["where", "final"] } },
  },
  required: ["answers"],
};

export interface FinalAnswer {
  where: string;
  final: string;
}

/** The numbers in a piece of text as values: "1,200" is 1200, "3/4" is 0.75, "1 1/4" is 1.25, "−8" is -8. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const clean = text.replace(/(\d),(?=\d{2,3}\b)/g, "$1").replace(/[−–]/g, "-");
  const pattern = /(-?\d+(?:\.\d+)?)\s+(\d+)\/(\d+)|(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)|(-?\d+(?:\.\d+)?)([½¼¾])?|([½¼¾])/g;
  const unicode: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
  for (const m of clean.matchAll(pattern)) {
    if (m[1] !== undefined) out.push(Number(m[1]) + Number(m[2]) / Number(m[3]));
    else if (m[4] !== undefined && Number(m[5]) !== 0) out.push(Number(m[4]) / Number(m[5]));
    // "23½": the whole number and the half together.
    else if (m[6] !== undefined) out.push(Number(m[6]) + (m[7] ? unicode[m[7]] : 0));
    else if (m[8] !== undefined) out.push(unicode[m[8]]);
  }
  return out.filter((n) => Number.isFinite(n));
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.01);

/**
 * Where the second solution's final answers are not found in the answer: each final's numbers must all
 * appear in the answer (its "Answer"/"Ans" lines when it has them), allowing for rounding.
 */
export function disagreements(finals: FinalAnswer[], answer: string): VerifyProblem[] {
  const answerLines = answer.split("\n").filter((l) => /\b(ans(wer)?|final|therefore|hence)\b|∴|=/i.test(l));
  const pool = numbersIn((answerLines.length ? answerLines : [answer]).join("\n"));
  const all = numbersIn(answer);
  return finals
    .filter((f) => {
      const wanted = numbersIn(f.final);
      if (wanted.length === 0) return false;
      // Found on an answer line, or (for an answer written in sentences) anywhere in it.
      return !wanted.every((w) => pool.some((n) => close(n, w))) && !wanted.every((w) => all.some((n) => close(n, w)));
    })
    .map((f) => ({
      kind: "wrong" as const,
      fromSecondSolution: true,
      where: f.where || "the answer",
      problem: `An independent second solution got ${f.final}, which differs from this answer's result.`,
      fix: `Work it out again; if ${f.final} is right, use it.`,
    }));
}

/** A second solution's final answers read back; null when the reply can't be read. */
export function parseFinals(text: string): FinalAnswer[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as { answers?: unknown };
    if (!Array.isArray(v.answers)) return null;
    return v.answers
      .map((a) => a as Record<string, unknown>)
      .filter((a) => a && typeof a.final === "string" && a.final.trim())
      .map((a) => ({ where: typeof a.where === "string" ? a.where.trim().slice(0, 40) : "", final: String(a.final).trim().slice(0, 120) }))
      .slice(0, 40);
  } catch {
    return null;
  }
}

/** A second, independent solution's final answers, or null when it could not be made (never holds an answer back). */
export async function solveAgain(input: {
  taskType: GenerationTaskType;
  question: string;
  context: string;
  photos: CompletionImage[];
}): Promise<{ finals: FinalAnswer[]; result: CompletionResult } | null> {
  try {
    const result = await generateCompletion({
      taskType: input.taskType,
      systemInstructions: SECOND_SOLVE_SYSTEM,
      context: input.context || undefined,
      prompt: `${input.question}\n\nGive the final answers as JSON.`,
      images: input.photos,
      temperature: 0.3,
      maxOutputTokens: 4096,
      jsonSchema: SCHEMA,
    });
    const finals = parseFinals(result.text);
    return finals ? { finals, result } : null;
  } catch (err) {
    console.error("[second solve]", err instanceof Error ? err.message : err);
    return null;
  }
}
