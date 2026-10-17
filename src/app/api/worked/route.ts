import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { userMessage } from "@/lib/errors";
import { solve, workedToMarkdown } from "@/lib/worked/detect";
import type { WorkedProblem } from "@/lib/worked/types";

/** Reads a problem from the request; null unless it is exactly one of the supported shapes. */
function parseProblem(raw: unknown): WorkedProblem | null {
  const p = raw as Partial<Record<string, unknown>> | null;
  if (p?.kind === "division" && typeof p.dividend === "string" && typeof p.divisor === "string") {
    return { kind: "division", dividend: p.dividend, divisor: p.divisor, decimals: p.decimals === true };
  }
  if (
    p?.kind === "lcm-hcf" &&
    Array.isArray(p.numbers) &&
    p.numbers.every((n) => Number.isInteger(n)) &&
    (p.want === "lcm" || p.want === "hcf" || p.want === "both")
  ) {
    return { kind: "lcm-hcf", numbers: p.numbers as number[], want: p.want };
  }
  const isNumberText = (v: unknown) => typeof v === "string" && /^\d*\.?\d+$/.test(v);
  if (p?.kind === "column" && (p.op === "add" || p.op === "subtract") && Array.isArray(p.numbers) && p.numbers.every(isNumberText)) {
    return { kind: "column", op: p.op, numbers: p.numbers as string[] };
  }
  if (p?.kind === "multiplication" && isNumberText(p.a) && isNumberText(p.b)) {
    return { kind: "multiplication", a: p.a as string, b: p.b as string };
  }
  if (
    p?.kind === "fraction" &&
    (p.op === "simplify" || p.op === "add" || p.op === "subtract") &&
    Array.isArray(p.fractions) &&
    p.fractions.every((f) => Array.isArray(f) && f.length === 2 && f.every((n) => Number.isInteger(n)))
  ) {
    return { kind: "fraction", op: p.op, fractions: p.fractions as [number, number][] };
  }
  if (p?.kind === "convert" && isNumberText(p.value) && typeof p.from === "string" && typeof p.to === "string") {
    return { kind: "convert", value: p.value as string, from: p.from, to: p.to };
  }
  return null;
}

/**
 * Saves a worked example to My Documents. The server works the problem out
 * again itself (never trusting steps sent by the browser); no AI, no tokens.
 */
export async function POST(request: Request) {
  const student = await getCurrentStudent();
  if (!student || !student.active) {
    return NextResponse.json({ error: "Your session has ended. Please sign in again." }, { status: 401 });
  }
  const problem = parseProblem((await request.json().catch(() => null))?.problem);
  const example = problem ? solve(problem) : null;
  if (!problem || !example) return NextResponse.json({ error: "That calculation can't be worked out here." }, { status: 400 });

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
  if (error) return NextResponse.json({ error: userMessage(error, "worked POST") }, { status: 500 });
  return NextResponse.json({ id: data.id, pdfUrl: `/api/documents/${data.id}/pdf` });
}
