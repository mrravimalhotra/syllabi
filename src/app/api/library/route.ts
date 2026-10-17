import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IngestError, ingestDocument } from "@/lib/ingestion/ingest";
import { checkQuota } from "@/lib/quota";
import type { DocumentRow } from "@/types/database";
import { userMessage } from "@/lib/errors";
import { cleanText, isUuid } from "@/lib/validate";
import { checkPages, isPageNumber, toIngestPages, type UploadPage } from "@/lib/ingestion/upload-pages";

export const maxDuration = 300; // vision extraction + embedding per page can take a while

const SOURCE_TYPES = new Set<DocumentRow["source_type"]>(["textbook", "exercise", "past_paper", "notes"]);

/** Lists the caller's own books. */
export async function GET() {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documents")
    .select("id, title, subject, grade, source_type, status, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: userMessage(error, "library GET") }, { status: 500 });
  return NextResponse.json({ documents: data });
}

interface UploadBody {
  title: string;
  subject?: string;
  grade?: string;
  sourceType: DocumentRow["source_type"];
  /** The uploader confirms they own this copy and will use it only for their own child's/students' study. */
  rightsConfirmed: boolean;
  /**
   * Without pages, this only creates the book (status "processing") and
   * returns its id; the browser then adds pages to it with
   * POST /api/library/[id]/pages and marks it ready with PATCH. Creating it
   * first means a retried page can never start a second copy of the book.
   */
  pages?: UploadPage[];
  /** Older single-request uploads: append this batch to a book already started. */
  documentId?: string;
  startPageNumber?: number;
  finalize?: boolean;
}

/** Creates one of the caller's books, or (older clients) uploads a batch of its pages and reads them. */
export async function POST(request: Request) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: UploadBody | null;
  try {
    body = (await request.json()) as UploadBody;
  } catch (err) {
    // A parse failure here almost always means the payload was too large or the
    // connection was cut mid-upload — surface that instead of a misleading
    // "missing fields" message that hides the real cause.
    console.error("[library POST parse]", err);
    return NextResponse.json(
      { error: "Couldn't read the upload — it may be too large or the connection dropped. Try fewer pages at once." },
      { status: 400 }
    );
  }

  const title = cleanText(body?.title, 200);
  if (!title || !body || !SOURCE_TYPES.has(body.sourceType)) {
    return NextResponse.json({ error: "A title and a type are required" }, { status: 400 });
  }
  if (body.rightsConfirmed !== true) {
    return NextResponse.json(
      { error: "Confirm that you own this copy and will use it only for your own child's or students' study" },
      { status: 400 }
    );
  }
  // Reading and indexing pages costs tokens, so it counts against the quota.
  const quota = await checkQuota(user.id);
  if (quota.overQuota) {
    return NextResponse.json({ error: "Monthly token quota exceeded. Contact an admin to raise your limit." }, { status: 429 });
  }

  const admin = createAdminClient();
  if (body.pages === undefined) {
    const { data, error } = await admin
      .from("documents")
      .insert({
        title,
        owner_id: user.id,
        subject: cleanText(body.subject, 100),
        grade: cleanText(body.grade, 50),
        rights_confirmed_at: new Date().toISOString(),
        source_type: body.sourceType,
        storage_path: null,
        uploaded_by: user.id,
        status: "processing",
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: userMessage(error, "library POST create", "Couldn't start the upload. Please try again.") }, { status: 500 });
    return NextResponse.json({ documentId: data.id });
  }

  const checked = checkPages(body.pages);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const startPageNumber = body.startPageNumber ?? 1;
  if (!isPageNumber(startPageNumber)) return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  if (body.documentId !== undefined) {
    if (!isUuid(body.documentId)) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const { data: existing } = await admin
      .from("documents")
      .select("id")
      .eq("id", body.documentId)
      .eq("owner_id", user.id)
      // "failed" too: the browser retries a batch that failed part-way.
      .in("status", ["processing", "failed"])
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    const documentId = await ingestDocument({
      title,
      ownerId: user.id,
      subject: cleanText(body.subject, 100),
      grade: cleanText(body.grade, 50),
      sourceType: body.sourceType,
      documentId: body.documentId,
      finalize: body.finalize,
      pages: toIngestPages(checked.pages, startPageNumber),
    });
    return NextResponse.json({ documentId, status: body.finalize === false ? "processing" : "ready" });
  } catch (err) {
    return NextResponse.json(
      {
        error: userMessage(err, "library POST ingest", "Upload failed. Please try again."),
        // Lets the browser retry this batch into the same book, or delete it.
        documentId: err instanceof IngestError ? err.documentId : body.documentId,
        retryable: err instanceof IngestError ? err.retryable : true,
      },
      { status: 500 }
    );
  }
}
