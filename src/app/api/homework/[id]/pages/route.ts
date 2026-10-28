import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedUrl, listKeys } from "@/lib/storage";
import { isUuid } from "@/lib/validate";

/** Short-lived links to the diary pages an entry was read from, so a misread can be checked against the original. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "That entry no longer exists.");
  try {
    const { data, error } = await createAdminClient().from("homework_entries").select("source_file").eq("id", id).eq("owner_id", auth.account.id).maybeSingle();
    if (error) throw error;
    if (!data) return apiError(404, "That entry no longer exists.");
    if (!data.source_file) return NextResponse.json({ pages: [] });
    const pageNumber = (k: string) => Number(/page-(\d+)/.exec(k)?.[1] ?? 0);
    const keys = (await listKeys(data.source_file)).sort((a, b) => pageNumber(a) - pageNumber(b));
    return NextResponse.json({ pages: await Promise.all(keys.map((k) => getSignedUrl(k))) });
  } catch (err) {
    return errorResponse(err, "homework pages", "Couldn't open the diary page. Try again in a moment.");
  }
}
