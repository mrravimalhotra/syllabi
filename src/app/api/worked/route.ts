import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { solve, workedToMarkdown } from "@/lib/worked/detect";
import { parseProblem } from "@/lib/worked/parse";

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
