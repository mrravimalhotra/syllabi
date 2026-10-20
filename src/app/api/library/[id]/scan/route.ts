import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_DOWNLOAD_PAGES, arrangeBookPages } from "@/lib/pdf/book-pages";
import { recordPageRead } from "@/lib/ingestion/page-read";
import { downloadFile, listKeys } from "@/lib/storage";
import { isUuid } from "@/lib/validate";

// Looking at up to 200 saved page pictures.
export const maxDuration = 120;

const NOT_FOUND = "That book no longer exists. Reload the page.";

/**
 * Works out the scan-quality score of a book that was read before scores were
 * kept, from its saved page pictures and text (no AI is used, so it costs no
 * allowance). Pages read since then already have theirs.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, NOT_FOUND);

  try {
    const admin = createAdminClient();
    const { data: book, error } = await admin.from("documents").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (error) throw error;
    if (!book) return apiError(404, NOT_FOUND);

    const [keys, { data: chunks, error: chunkError }] = await Promise.all([
      listKeys(`sources/${id}/`),
      admin.from("chunks").select("page_number, chunk_index, content").eq("document_id", id),
    ]);
    if (chunkError) throw chunkError;

    const pages = arrangeBookPages(keys, []);
    const textOf = (n: number) =>
      [...(chunks ?? [])]
        .filter((c) => c.page_number === n)
        .sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0))
        .map((c) => c.content)
        .join("\n\n");
    // Pages that are only text (Word files) have no picture to judge.
    const textOnly = [...new Set((chunks ?? []).map((c) => c.page_number as number | null))].filter((n): n is number => n !== null && !pages.some((p) => p.number === n));
    if (pages.length + textOnly.length === 0) return apiError(404, "This book has no saved pages to check yet.");
    if (pages.length + textOnly.length > MAX_DOWNLOAD_PAGES) return apiError(400, `This book has more than ${MAX_DOWNLOAD_PAGES} pages, more than one check can hold.`);

    const ids = (pageNumber: number) => ({ documentId: id, ownerId: user.id, pageNumber });
    for (let i = 0; i < pages.length; i += 5) {
      await Promise.all(
        pages.slice(i, i + 5).map(async (p) => {
          if (!("imagePath" in p)) return;
          const file = await downloadFile(p.imagePath);
          await recordPageRead(ids(p.number), textOf(p.number), file.data.toString("base64"), null);
        })
      );
    }
    for (const n of textOnly) await recordPageRead(ids(n), textOf(n), undefined, null);
    return NextResponse.json({ ok: true, pages: pages.length + textOnly.length });
  } catch (err) {
    return errorResponse(err, "library scan check", "Couldn't check this book. Please try again in a moment.");
  }
}
