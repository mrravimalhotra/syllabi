import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { solve, workedToMarkdown } from "@/lib/worked/detect";
import type { WorkedProblem } from "@/lib/worked/types";
import { savedLanguage, isNarration } from "@/lib/worked/say";

/** Reads a problem from the request; null unless it is exactly one of the supported shapes. */
function parseProblem(raw: unknown): WorkedProblem | null {
  const problem = parseShape(raw);
  const language = (raw as { language?: unknown } | null)?.language;
  return problem && { ...problem, ...savedLanguage(isNarration(language) ? language : undefined) };
}

// Bounds checked before any work is done, so a request can't carry huge strings or lists.
const MAX_NUMBER_CHARS = 30;
const MAX_LIST = 6;

const isNumberText = (v: unknown) => typeof v === "string" && v.length <= MAX_NUMBER_CHARS && /^\d*\.?\d+$/.test(v);
const isSmallInteger = (n: unknown) => Number.isInteger(n) && Math.abs(n as number) <= 1_000_000_000;

function parseShape(raw: unknown): WorkedProblem | null {
  const p = raw as Partial<Record<string, unknown>> | null;
  if (p?.kind === "division" && isNumberText(p.dividend) && isNumberText(p.divisor)) {
    return { kind: "division", dividend: p.dividend as string, divisor: p.divisor as string, decimals: p.decimals === true };
  }
  if (
    p?.kind === "lcm-hcf" &&
    Array.isArray(p.numbers) &&
    p.numbers.length <= MAX_LIST &&
    p.numbers.every(isSmallInteger) &&
    (p.want === "lcm" || p.want === "hcf" || p.want === "both")
  ) {
    return { kind: "lcm-hcf", numbers: p.numbers as number[], want: p.want };
  }
  if (p?.kind === "column" && (p.op === "add" || p.op === "subtract") && Array.isArray(p.numbers) && p.numbers.length <= MAX_LIST && p.numbers.every(isNumberText)) {
    return { kind: "column", op: p.op, numbers: p.numbers as string[] };
  }
  if (p?.kind === "multiplication" && isNumberText(p.a) && isNumberText(p.b)) {
    return { kind: "multiplication", a: p.a as string, b: p.b as string };
  }
  if (
    p?.kind === "fraction" &&
    (p.op === "simplify" || p.op === "add" || p.op === "subtract") &&
    Array.isArray(p.fractions) &&
    p.fractions.length <= 2 &&
    p.fractions.every((f) => Array.isArray(f) && f.length === 2 && f.every(isSmallInteger))
  ) {
    return { kind: "fraction", op: p.op, fractions: p.fractions as [number, number][] };
  }
  if (p?.kind === "convert" && isNumberText(p.value) && typeof p.from === "string" && p.from.length <= 4 && typeof p.to === "string" && p.to.length <= 4) {
    return { kind: "convert", value: p.value as string, from: p.from, to: p.to };
  }
  return null;
}

/**
 * Saves a worked example to My Documents. The server works the problem out
 * again itself (never trusting steps sent by the browser); no AI, no tokens.
 */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;
  const problem = parseProblem((await request.json().catch(() => null))?.problem);
  if (!problem) return apiError(400, "That isn't a calculation Syllabi can work out. Check the numbers and the method, then try again.");
  const example = solve(problem);
  if (!example) {
    return apiError(422, "These numbers can't be worked out step by step: they may be too long, divide by zero, or mix units that don't match. Use smaller or simpler numbers.");
  }

  const { data, error } = await createAdminClient()
    .from("generated_documents")
    .insert({
      student_id: student.id,
      task_type: "solution",
      title: example.title,
      content: workedToMarkdown(example),
      worked: problem,
      sources: [],
      checks: [{ kind: "calculation", ok: true, message: example.answer }],
    })
    .select("id")
    .single();
  if (error) return errorResponse(error, "worked POST", "Couldn't save this to My Documents. Try again in a moment.");
  return NextResponse.json({ id: data.id, pdfUrl: `/api/documents/${data.id}/pdf` });
}
