import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { dedupKey, indiaToday, normaliseSubject, parseDiaryDate, type EntryKind } from "@/lib/homework/diary";
import { cleanText } from "@/lib/validate";
import { COLUMNS } from "@/app/api/homework/route";

/**
 * Adds one piece of work typed in by the grown-up: work set out loud in class or on a parents' group, which
 * never reaches the diary. No AI is used.
 */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const subject = cleanText(body?.subject, 80);
  const title = cleanText(body?.title, 500);
  const kind: EntryKind = body?.kind === "classwork" ? "classwork" : "homework";
  if (!subject) return apiError(400, "Type the subject, for example Mathematics.");
  if (!title) return apiError(400, "Type the work, for example “Ex 4B, Q1 to 5”.");
  const given = indiaToday();
  const due = typeof body?.due_date === "string" && body.due_date ? parseDiaryDate(body.due_date, given) : null;
  if (typeof body?.due_date === "string" && body.due_date && !due) return apiError(400, "The submission date couldn't be read. Choose it again.");
  const entry = { kind, subject: normaliseSubject(subject), title, topic: null, sub_topic: null, due_date: due, given_date: given };
  const { data, error } = await createAdminClient()
    .from("homework_entries")
    .insert({ ...entry, owner_id: auth.account.id, source: "typed", dedup_key: dedupKey(entry) })
    .select(COLUMNS)
    .maybeSingle();
  if (error && /duplicate|unique/i.test(error.message)) return apiError(400, "That work is already in today's list.");
  if (error) return errorResponse(error, "homework add", "Couldn't add that. Try again in a moment.");
  return NextResponse.json({ entry: data });
}
