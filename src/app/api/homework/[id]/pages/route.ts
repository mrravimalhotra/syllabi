import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedUrl, listKeys } from "@/lib/storage";
import { isUuid } from "@/lib/validate";

/**
 * A short-lived link to the diary page an entry was read from, so a misread can be checked against the original:
 * only that page when it is known, otherwise every page of the upload.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "That entry no longer exists.");
  try {
    const { data, error } = await createAdminClient().from("homework_entries").select("source_file, source_page").eq("id", id).eq("owner_id", auth.account.id).maybeSingle();
    if (error) throw error;
    if (!data) return apiError(404, "That entry no longer exists.");
    if (!data.source_file) return NextResponse.json({ pages: [] });
    const pageNumber = (k: string) => Number(/page-(\d+)/.exec(k)?.[1] ?? 0);
    const keys = (await listKeys(data.source_file)).sort((a, b) => pageNumber(a) - pageNumber(b));
    const own = keys.filter((k) => pageNumber(k) === data.source_page);
    const shown = own.length > 0 ? own : keys;
    return NextResponse.json({ pages: await Promise.all(shown.map((k) => getSignedUrl(k))), page: own.length > 0 ? data.source_page : null });
  } catch (err) {
    return errorResponse(err, "homework pages", "Couldn't open the diary page. Try again in a moment.");
  }
}
