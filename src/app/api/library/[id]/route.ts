import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { deletePrefix } from "@/lib/storage";
import { cleanText, isUuid } from "@/lib/validate";

const NOT_FOUND = "That book no longer exists. Reload the page.";

/** Renames one of the caller's books (title, subject, grade). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, NOT_FOUND);
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object") return apiError(400, "Your change couldn't be read. Try again.");

  const updates: { title?: string; subject?: string | null; grade?: string | null } = {};
  if (body?.title !== undefined) {
    const title = cleanText(body.title, 200);
    if (!title) return apiError(400, "Type a title for the book. It can't be empty.");
    updates.title = title;
  }
  if (body?.subject !== undefined) updates.subject = cleanText(body.subject, 100);
  if (body?.grade !== undefined) updates.grade = cleanText(body.grade, 50);
  if (Object.keys(updates).length === 0) return apiError(400, "There was nothing to change.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documents")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, title, subject, grade, source_type, status, created_at")
    .maybeSingle();
  if (error) return errorResponse(error, "library PATCH", "Couldn't save your change. Try again in a moment.");
  if (!data) return apiError(404, NOT_FOUND);
  return NextResponse.json({ document: data });
}

/** Deletes one of the caller's books: its page images, its search index (chunks cascade), and the record. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, NOT_FOUND);
  const admin = createAdminClient();
  const { data: doc, error: lookupError } = await admin
    .from("documents")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (lookupError) return errorResponse(lookupError, "library DELETE lookup", "Couldn't delete this book. Nothing was deleted. Try again in a moment.");
  if (!doc) return apiError(404, NOT_FOUND);

  // The record first (its search index and reading queue go with it), so a
  // storage hiccup can never leave a book that is listed but has lost its pages.
  const { error } = await admin.from("documents").delete().eq("id", id);
  if (error) return errorResponse(error, "library DELETE row", "Couldn't delete this book. Nothing was deleted. Try again in a moment.");

  await deletePrefix(`sources/${id}/`).catch((err) => console.error("[library DELETE] page images left behind", id, err));
  return NextResponse.json({ ok: true });
}
