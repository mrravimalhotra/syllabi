import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { checkQuota } from "@/lib/quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deletePrefix } from "@/lib/storage";
import { userMessage } from "@/lib/errors";
import { cleanText } from "@/lib/validate";
import { BOARDS, CLASS_LEVELS } from "@/lib/generation/level";
import { isAnswerLanguage } from "@/lib/generation/language";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quota = await checkQuota(student.id);
  return NextResponse.json({ student, quota });
}

/** Updates the caller's own name, or the child's class and board (the profile fields people edit themselves). */
export async function PATCH(request: Request) {
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const updates: Record<string, string | null> = {};
  if (body && "fullName" in body) {
    const fullName = cleanText(body.fullName, 120);
    if (!fullName) return NextResponse.json({ error: "A name is required" }, { status: 400 });
    updates.full_name = fullName;
  }
  // "" clears the setting; anything else must be one of the listed options.
  if (body && "classLevel" in body) {
    if (body.classLevel !== "" && !CLASS_LEVELS.includes(body.classLevel)) {
      return NextResponse.json({ error: "Choose a class from the list" }, { status: 400 });
    }
    updates.class_level = body.classLevel || null;
  }
  if (body && "board" in body) {
    if (body.board !== "" && !BOARDS.includes(body.board)) {
      return NextResponse.json({ error: "Choose a board from the list" }, { status: 400 });
    }
    updates.board = body.board || null;
  }
  if (body && "answerLanguage" in body) {
    if (body.answerLanguage !== "auto" && !isAnswerLanguage(body.answerLanguage)) {
      return NextResponse.json({ error: "Choose a language from the list" }, { status: 400 });
    }
    updates.answer_language = body.answerLanguage === "auto" ? null : body.answerLanguage;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("students").update(updates).eq("id", student.id);
  if (error) return NextResponse.json({ error: userMessage(error, "me PATCH") }, { status: 500 });
  return NextResponse.json({ ok: true, fullName: updates.full_name ?? student.full_name });
}

/**
 * Deletes the caller's account and everything in it: books, their page images,
 * search index, saved answers and usage records. The body must be
 * {"confirm": "DELETE"}. The database refuses to delete the last active admin.
 */
export async function DELETE(request: Request) {
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await request.json().catch(() => null))?.confirm !== "DELETE") {
    return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: books } = await admin.from("documents").select("id").eq("owner_id", student.id);

  // The account row first: it cascades to books, index, answers and usage, and
  // it is where the "keep one admin" rule is enforced.
  const { error } = await admin.from("students").delete().eq("id", student.id);
  if (error) return NextResponse.json({ error: userMessage(error, "me DELETE") }, { status: 400 });

  // Stored files next (best effort; logged if anything is left behind).
  for (const book of books ?? []) {
    await deletePrefix(`sources/${book.id}/`).catch((err) => console.error("[me DELETE] book images", book.id, err));
  }
  await deletePrefix(`generated/${student.id}/`).catch((err) => console.error("[me DELETE] old PDFs", err));

  // Finally the sign-in itself.
  const { error: authError } = await admin.auth.admin.deleteUser(student.id);
  if (authError) console.error("[me DELETE] auth user", authError);
  await (await createClient()).auth.signOut().catch(() => undefined);

  return NextResponse.json({ ok: true });
}
