import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { forgetStudent } from "@/lib/supabase/identity";
import { checkQuota } from "@/lib/quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deletePrefix } from "@/lib/storage";
import { userMessage } from "@/lib/errors";
import { parseProfileUpdate } from "@/lib/profile-update";

export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;

  try {
    return NextResponse.json({ student, quota: await checkQuota(student.id) });
  } catch (err) {
    return errorResponse(err, "me GET", "Couldn't load your account details. Reload the page to try again.");
  }
}

/** Updates the caller's own name, or the child's class and board (the profile fields people edit themselves). */
export async function PATCH(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;

  const parsed = parseProfileUpdate(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(400, parsed.message);
  const { updates } = parsed;

  const admin = createAdminClient();
  const { error } = await admin.from("students").update(updates).eq("id", student.id);
  forgetStudent(student.id);
  if (error) return errorResponse(error, "me PATCH", "Couldn't save your change. Try again in a moment.");
  return NextResponse.json({ ok: true, fullName: updates.full_name ?? student.full_name });
}

/**
 * Deletes the caller's account and everything in it: books, their page images,
 * search index, saved answers and usage records. The body must be
 * {"confirm": "DELETE"}. The database refuses to delete the last active admin.
 */
export async function DELETE(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;
  if ((await request.json().catch(() => null))?.confirm !== "DELETE") {
    return apiError(400, "To delete your account, type DELETE in capital letters to confirm.");
  }

  const admin = createAdminClient();
  // Without the list of books their stored pages could never be removed, so stop here if it can't be read.
  const { data: books, error: booksError } = await admin.from("documents").select("id").eq("owner_id", student.id);
  if (booksError) return errorResponse(booksError, "me DELETE books", "Couldn't start deleting your account. Nothing was deleted. Try again in a moment.");

  // The account row first: it cascades to books, index, answers and usage, and
  // it is where the "keep one admin" rule is enforced.
  const { error } = await admin.from("students").delete().eq("id", student.id);
  if (error) return apiError(400, userMessage(error, "me DELETE", "Couldn't delete your account. Nothing was deleted. Try again in a moment."));

  // Stored files next (best effort; logged if anything is left behind).
  for (const book of books ?? []) {
    await deletePrefix(`sources/${book.id}/`).catch((err) => console.error("[me DELETE] book images", book.id, err));
  }
  await deletePrefix(`generated/${student.id}/`).catch((err) => console.error("[me DELETE] old PDFs", err));
  await deletePrefix(`homework/${student.id}/`).catch((err) => console.error("[me DELETE] class diary pages", err));

  // Finally the sign-in itself.
  const { error: authError } = await admin.auth.admin.deleteUser(student.id);
  if (authError) console.error("[me DELETE] auth user", authError);
  forgetStudent(student.id);
  await (await createClient()).auth.signOut().catch((err) => console.error("[me DELETE] sign out", err));

  return NextResponse.json({ ok: true });
}
