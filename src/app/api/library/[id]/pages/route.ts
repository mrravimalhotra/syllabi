import { NextResponse, after } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { queuePages, readQueuedPages, rememberAppUrl } from "@/lib/ingestion/jobs";
import { checkPages, isPageNumber } from "@/lib/ingestion/upload-pages";
import { QuotaExceededError, checkQuota } from "@/lib/quota";
import { isUuid } from "@/lib/validate";

// The reply comes in seconds; reading queued pages carries on after it, for up to this long.
export const maxDuration = 300;

/**
 * Adds pages to one of the caller's books: stores them and queues them for
 * reading, then answers. The pages are read in the background (see
 * lib/ingestion/jobs.ts), so the upload finishes even if the app is closed.
 * A page sent again replaces itself.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "This book no longer exists.", { retryable: false });
  const body = (await request.json().catch(() => null)) as { pages?: unknown; startPageNumber?: unknown } | null;
  if (!body) return apiError(400, "The upload couldn't be read. The connection may have dropped; try again.");
  const checked = checkPages(body.pages);
  if ("error" in checked) return apiError(400, checked.error);
  if (!isPageNumber(body.startPageNumber)) return apiError(400, "The page numbers in this upload are not valid. Start the upload again.");

  try {
    const quota = await checkQuota(user.id);
    if (quota.overQuota) throw new QuotaExceededError(quota);

    const { data: book, error: bookError } = await createAdminClient()
      .from("documents")
      .select("id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (bookError) throw bookError;
    if (!book) return apiError(404, "This book was deleted while you were uploading.", { retryable: false });

    await queuePages(id, user.id, checked.pages, body.startPageNumber);
  } catch (err) {
    return errorResponse(err, "library pages", "Saving the pages failed. Please try again.", {
      retryable: !(err instanceof QuotaExceededError),
    });
  }
  const origin = new URL(request.url).origin;
  after(async () => {
    await rememberAppUrl(origin);
    await readQueuedPages(origin);
  });
  return NextResponse.json({ ok: true });
}
