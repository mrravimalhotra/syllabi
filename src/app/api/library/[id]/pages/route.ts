import { NextResponse, after } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { queuePages, readQueuedPages, rememberAppUrl } from "@/lib/ingestion/jobs";
import { checkPages, isPageNumber } from "@/lib/ingestion/upload-pages";
import { checkQuota } from "@/lib/quota";
import { userMessage } from "@/lib/errors";
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
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Your session has ended. Please sign in again." }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { pages?: unknown; startPageNumber?: unknown } | null;
  if (!body) {
    return NextResponse.json({ error: "Couldn't read the upload — the connection may have dropped." }, { status: 400 });
  }
  const checked = checkPages(body.pages);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (!isPageNumber(body.startPageNumber)) return NextResponse.json({ error: "Invalid page number" }, { status: 400 });

  const quota = await checkQuota(user.id);
  if (quota.overQuota) {
    return NextResponse.json({ error: "Monthly token quota exceeded. Contact an admin to raise your limit.", retryable: false }, { status: 429 });
  }

  const { data: book } = await createAdminClient()
    .from("documents")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!book) return NextResponse.json({ error: "This book was deleted.", retryable: false }, { status: 404 });

  try {
    await queuePages(id, user.id, checked.pages, body.startPageNumber);
  } catch (err) {
    return NextResponse.json({ error: userMessage(err, "library pages", "Saving the pages failed. Please try again.") }, { status: 500 });
  }
  const origin = new URL(request.url).origin;
  after(async () => {
    await rememberAppUrl(origin);
    await readQueuedPages(origin);
  });
  return NextResponse.json({ ok: true });
}
