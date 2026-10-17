import { NextResponse, after } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { QuotaExceededError, checkQuota } from "@/lib/quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { readQueuedPages, retryFailedPages } from "@/lib/ingestion/jobs";
import { isUuid } from "@/lib/validate";

export const maxDuration = 300;

/** Queues the pages of one of the caller's books that couldn't be read, to read them again in the background. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "This book no longer exists. Reload the page.");

  let queued: number;
  try {
    const { data: book, error } = await createAdminClient().from("documents").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (error) throw error;
    if (!book) return apiError(404, "This book no longer exists. Reload the page.");
    const quota = await checkQuota(user.id);
    if (quota.overQuota) throw new QuotaExceededError(quota);
    queued = await retryFailedPages(id);
  } catch (err) {
    return errorResponse(err, "library retry", "Couldn't try the pages again. Please try again in a moment.");
  }
  const origin = new URL(request.url).origin;
  after(() => readQueuedPages(origin));
  return NextResponse.json({ queued });
}
