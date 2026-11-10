import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";
import { removeUnusedDiaryPages } from "@/lib/homework/pages";

const GONE = "That entry no longer exists. Reload the page.";
type Params = { params: Promise<{ id: string }> };

/**
 * Marks one of the caller's entries done or not done, or ({ checked: true }) as checked against the diary page, or
 * settles a possible duplicate ({ duplicate: "merge" | "keep" }).
 * Done or not done (only a person ever marks it: never automatic). The first
 * time a homework is marked done, `star` is true: the child earns one star for it, once, however often it is
 * ticked and unticked afterwards.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, GONE);
  const body = (await request.json().catch(() => null)) as { done?: unknown; checked?: unknown; duplicate?: unknown } | null;
  const admin = createAdminClient();
  if (body?.duplicate === "merge" || body?.duplicate === "keep") return settleDuplicate(id, auth.account.id, body.duplicate);
  // "Looks right": the grown-up checked an entry the two diary readings disagreed on.
  if (body?.checked === true) {
    const { data, error } = await admin.from("homework_entries").update({ needs_check: false }).eq("id", id).eq("owner_id", auth.account.id).select("id").maybeSingle();
    if (error) return errorResponse(error, "homework PATCH", "Couldn't save that. Try again in a moment.");
    return data ? NextResponse.json({ entry: data }) : apiError(404, GONE);
  }
  if (typeof body?.done !== "boolean") return apiError(400, "Say whether it is done.");
  const { data: entry, error: readError } = await admin.from("homework_entries").select("kind, star_given").eq("id", id).eq("owner_id", auth.account.id).maybeSingle();
  if (readError) return errorResponse(readError, "homework PATCH", "Couldn't save that. Try again in a moment.");
  if (!entry) return apiError(404, GONE);
  const star = body.done && entry.kind === "homework" && !entry.star_given;
  const { data, error } = await admin
    .from("homework_entries")
    .update({ done: body.done, done_at: body.done ? new Date().toISOString() : null, ...(star ? { star_given: true } : {}) })
    .eq("id", id)
    .eq("owner_id", auth.account.id)
    .select("id, done, done_at")
    .maybeSingle();
  if (error) return errorResponse(error, "homework PATCH", "Couldn't save that. Try again in a moment.");
  if (!data) return apiError(404, GONE);
  return NextResponse.json({ entry: data, star });
}

/**
 * A possible duplicate is settled. "keep": it is a different piece of work after all. "merge": it goes, and the
 * entry it repeats stays (ticked, with its star counted, if the duplicate was).
 */
async function settleDuplicate(id: string, ownerId: string, how: "merge" | "keep") {
  const admin = createAdminClient();
  const SAVE_FAILED = "Couldn't save that. Try again in a moment.";
  const { data: entry, error } = await admin.from("homework_entries").select("duplicate_of, done, done_at, star_given").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (error) return errorResponse(error, "homework duplicate", SAVE_FAILED);
  if (!entry) return apiError(404, GONE);
  if (how === "keep" || !entry.duplicate_of) {
    const { error: keepError } = await admin.from("homework_entries").update({ duplicate_of: null }).eq("id", id).eq("owner_id", ownerId);
    if (keepError) return errorResponse(keepError, "homework duplicate", SAVE_FAILED);
    return NextResponse.json({ kept: id });
  }
  if (entry.done) {
    const carry = { done: true, done_at: entry.done_at, ...(entry.star_given ? { star_given: true } : {}) };
    const { error: carryError } = await admin.from("homework_entries").update(carry).eq("id", entry.duplicate_of).eq("owner_id", ownerId).eq("done", false);
    if (carryError) return errorResponse(carryError, "homework duplicate", SAVE_FAILED);
  }
  const { error: removeError } = await admin.from("homework_entries").delete().eq("id", id).eq("owner_id", ownerId);
  if (removeError) return errorResponse(removeError, "homework duplicate", SAVE_FAILED);
  await removeUnusedDiaryPages(ownerId);
  return NextResponse.json({ merged: id, into: entry.duplicate_of, done: entry.done });
}

/** Removes one of the caller's entries (one the diary reading got wrong). */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, GONE);
  const { data, error } = await createAdminClient().from("homework_entries").delete().eq("id", id).eq("owner_id", auth.account.id).select("id");
  if (error) return errorResponse(error, "homework DELETE", "Couldn't remove that. Try again in a moment.");
  if (!data?.length) return apiError(404, GONE);
  // The last entry of a diary upload gone: its stored pages go too.
  await removeUnusedDiaryPages(auth.account.id);
  return NextResponse.json({ ok: true });
}
