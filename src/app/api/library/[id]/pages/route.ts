import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IngestError, ingestDocument } from "@/lib/ingestion/ingest";
import { checkPages, isPageNumber, toIngestPages } from "@/lib/ingestion/upload-pages";
import { checkQuota } from "@/lib/quota";
import { userMessage } from "@/lib/errors";
import { isUuid } from "@/lib/validate";

export const maxDuration = 300; // reading a page can take a while, with retries

/**
 * Adds pages to one of the caller's books and reads them. The browser sends
 * one scanned page per request (several at once), so a slow or failed page
 * never holds up or sinks the others. A page sent again replaces itself.
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
    .select("id, title, subject, grade, source_type")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!book) return NextResponse.json({ error: "This book was deleted.", retryable: false }, { status: 404 });

  try {
    await ingestDocument({
      title: book.title,
      ownerId: user.id,
      subject: book.subject,
      grade: book.grade,
      sourceType: book.source_type,
      documentId: id,
      finalize: false,
      pages: toIngestPages(checked.pages, body.startPageNumber),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: userMessage(err, "library pages", "Saving the pages failed. Please try again."),
        retryable: err instanceof IngestError ? err.retryable : true,
      },
      { status: 500 }
    );
  }
}
