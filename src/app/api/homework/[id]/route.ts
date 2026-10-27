import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";

const GONE = "That entry no longer exists. Reload the page.";
type Params = { params: Promise<{ id: string }> };

/** Marks one of the caller's entries done or not done (only the person ever marks it: never automatic). */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, GONE);
  const body = (await request.json().catch(() => null)) as { done?: unknown } | null;
  if (typeof body?.done !== "boolean") return apiError(400, "Say whether it is done.");
  const { data, error } = await createAdminClient()
    .from("homework_entries")
    .update({ done: body.done, done_at: body.done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("owner_id", auth.account.id)
    .select("id, done, done_at")
    .maybeSingle();
  if (error) return errorResponse(error, "homework PATCH", "Couldn't save that. Try again in a moment.");
  if (!data) return apiError(404, GONE);
  return NextResponse.json({ entry: data });
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
