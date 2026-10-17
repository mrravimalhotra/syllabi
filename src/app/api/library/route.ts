import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IngestError, ingestDocument } from "@/lib/ingestion/ingest";
import { checkQuota } from "@/lib/quota";
import type { DocumentRow } from "@/types/database";
import { userMessage } from "@/lib/errors";
import { cleanText, isUuid } from "@/lib/validate";

export const maxDuration = 300; // vision extraction + embedding per page can take a while

const SOURCE_TYPES = new Set<DocumentRow["source_type"]>(["textbook", "exercise", "past_paper", "notes"]);
const MAX_PAGES_PER_REQUEST = 30;
const PAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// One page image, base64. The browser downscales pages to ~1800 px JPEGs, far below this.
const MAX_PAGE_BASE64_CHARS = 3 * 1024 * 1024;
// One text page from a Word file; the browser splits documents into ~3,000-character pages.
const MAX_PAGE_TEXT_CHARS = 20_000;

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
  /** Page images (scans, photos, PDF pages), or text extracted in the browser from Word files. */
  pages: ({ imageBase64: string; mimeType: string; hint?: string } | { text: string; imageBase64?: string; mimeType?: string })[];
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
    console.error("[library POST parse]", err);
    return NextResponse.json(
      { error: "Couldn't read the upload — it may be too large or the connection dropped. Try fewer pages at once." },
      { status: 400 }
    );
  }

  const title = cleanText(body?.title, 200);
  if (!title || !body || !SOURCE_TYPES.has(body.sourceType) || !Array.isArray(body.pages) || body.pages.length === 0) {
    return NextResponse.json({ error: "A title, a type and at least one page are required" }, { status: 400 });
  }
  const startPageNumber = body.startPageNumber ?? 1;
  if (!Number.isInteger(startPageNumber) || startPageNumber < 1 || startPageNumber > 10_000) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }
  if (body.documentId !== undefined && !isUuid(body.documentId)) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
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
  // Pages arrive as images (PDFs are turned into page images in the browser)
  // or as text (Word files are read in the browser).
  const isValidPage = (p: unknown): boolean => {
    const page = p as { imageBase64?: unknown; mimeType?: unknown; text?: unknown; hint?: unknown } | null;
    if (typeof page?.text === "string") {
      const textOk = page.text.trim().length > 0 && page.text.length <= MAX_PAGE_TEXT_CHARS;
      // A digital PDF page may carry its image too.
      if (page.imageBase64 === undefined) return textOk;
      return (
        textOk &&
        typeof page.imageBase64 === "string" &&
        page.imageBase64.length > 0 &&
        page.imageBase64.length <= MAX_PAGE_BASE64_CHARS &&
        typeof page.mimeType === "string" &&
        PAGE_MIME_TYPES.has(page.mimeType)
      );
    }
    return (
      typeof page?.imageBase64 === "string" &&
      page.imageBase64.length > 0 &&
      page.imageBase64.length <= MAX_PAGE_BASE64_CHARS &&
      typeof page.mimeType === "string" &&
      PAGE_MIME_TYPES.has(page.mimeType) &&
      (page.hint === undefined || (typeof page.hint === "string" && page.hint.length <= 500))
    );
  };
  const badPage = body.pages.findIndex((p) => !isValidPage(p));
  if (badPage !== -1) {
    return NextResponse.json(
      { error: `Page ${badPage + 1} isn't a JPEG, PNG or WebP image or Word text, or is too large.` },
      { status: 400 }
    );
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
      pages: body.pages.map((p, i) => {
        const pageNumber = startPageNumber + i;
        if ("text" in p) {
          const withImage = p as { text: string; imageBase64?: string; mimeType?: string };
          return withImage.imageBase64 && withImage.mimeType
            ? { pageNumber, text: p.text, imageBase64: withImage.imageBase64, mimeType: withImage.mimeType }
            : { pageNumber, text: p.text };
        }
        return { pageNumber, imageBase64: p.imageBase64, mimeType: p.mimeType, hint: p.hint };
      }),
    });

    return NextResponse.json({ documentId, status: body.finalize === false ? "processing" : "ready" });
  } catch (err) {
    return NextResponse.json(
      {
        error: userMessage(err, "library POST ingest", "Upload failed. Please try again."),
        // Lets the browser retry this batch into the same book, or delete it.
        documentId: err instanceof IngestError ? err.documentId : body.documentId,
      },
      { status: 500 }
    );
  }
}
