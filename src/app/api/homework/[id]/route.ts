import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";

const GONE = "That entry no longer exists. Reload the page.";
type Params = { params: Promise<{ id: string }> };

/**
 * Marks one of the caller's entries done or not done (only a person ever marks it: never automatic). The first
 * time a homework is marked done, `star` is true: the child earns one star for it, once, however often it is
 * ticked and unticked afterwards.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, GONE);
  const body = (await request.json().catch(() => null)) as { done?: unknown } | null;
  if (typeof body?.done !== "boolean") return apiError(400, "Say whether it is done.");
  const admin = createAdminClient();
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

/** Removes one of the caller's entries (one the diary reading got wrong). */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, GONE);
  const { data, error } = await createAdminClient().from("homework_entries").delete().eq("id", id).eq("owner_id", auth.account.id).select("id");
  if (error) return errorResponse(error, "homework DELETE", "Couldn't remove that. Try again in a moment.");
  if (!data?.length) return apiError(404, GONE);
  return NextResponse.json({ ok: true });
}
