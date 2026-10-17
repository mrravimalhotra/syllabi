import { NextResponse, after } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { readQueuedPages, retryFailedPages } from "@/lib/ingestion/jobs";
import { isUuid } from "@/lib/validate";

export const maxDuration = 300;

/** Queues the pages of one of the caller's books that couldn't be read, to read them again in the background. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: book } = await createAdminClient().from("documents").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const queued = await retryFailedPages(id);
  const origin = new URL(request.url).origin;
  after(() => readQueuedPages(origin));
  return NextResponse.json({ queued });
}
