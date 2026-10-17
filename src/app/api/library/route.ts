import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestDocument } from "@/lib/ingestion/ingest";
import { checkQuota } from "@/lib/quota";
import type { DocumentRow } from "@/types/database";

export const maxDuration = 300; // vision extraction + embedding per page can take a while

const SOURCE_TYPES = new Set<DocumentRow["source_type"]>(["textbook", "exercise", "past_paper", "notes"]);
const MAX_PAGES_PER_REQUEST = 30;

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

interface UploadBody {
  title: string;
  subject?: string;
  grade?: string;
  sourceType: DocumentRow["source_type"];
  /** The uploader confirms they own this copy and will use it only for their own child's/students' study. */
  rightsConfirmed: boolean;
  pages: { imageBase64: string; mimeType: string }[];
  /** Present from the 2nd request onward when a large upload is split into batches — appends to that document instead of creating a new one. */
  documentId?: string;
  /** Page numbering offset for this batch within its document. Defaults to 1. */
  startPageNumber?: number;
  /** Whether this batch is the last one for its document (marks it "ready"). Defaults to true. */
  finalize?: boolean;
}

/** Uploads (a batch of) pages of one of the caller's books, then reads and indexes them. */
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
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Could not read the upload — it may be too large. (${message})` }, { status: 400 });
  }

  if (!body?.title?.trim() || !SOURCE_TYPES.has(body.sourceType) || !body.pages?.length) {
    return NextResponse.json({ error: "title, sourceType, and pages are required" }, { status: 400 });
  }
  if (body.rightsConfirmed !== true) {
    return NextResponse.json(
      { error: "Confirm that you own this copy and will use it only for your own child's or students' study" },
      { status: 400 }
    );
  }
  if (body.pages.length > MAX_PAGES_PER_REQUEST) {
    return NextResponse.json({ error: `Upload at most ${MAX_PAGES_PER_REQUEST} pages per request` }, { status: 400 });
  }

  // Reading and indexing pages costs tokens, so it counts against the quota.
  const quota = await checkQuota(user.id);
  if (quota.overQuota) {
    return NextResponse.json({ error: "Monthly token quota exceeded. Contact an admin to raise your limit." }, { status: 429 });
  }

  if (body.documentId) {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("documents")
      .select("id")
      .eq("id", body.documentId)
      .eq("owner_id", user.id)
      .eq("status", "processing")
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    const documentId = await ingestDocument({
      title: body.title.trim(),
      ownerId: user.id,
      subject: body.subject?.trim() || null,
      grade: body.grade?.trim() || null,
      sourceType: body.sourceType,
      documentId: body.documentId,
      finalize: body.finalize,
      pages: body.pages.map((p, i) => ({
        pageNumber: (body.startPageNumber ?? 1) + i,
        imageBase64: p.imageBase64,
        mimeType: p.mimeType,
      })),
    });

    return NextResponse.json({ documentId, status: body.finalize === false ? "processing" : "ready" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
