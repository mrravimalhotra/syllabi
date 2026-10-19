import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderBookPdf, type BookPdfPage } from "@/lib/pdf/book";
import { MAX_DOWNLOAD_PAGES, arrangeBookPages } from "@/lib/pdf/book-pages";
import { pdfDisposition } from "@/lib/pdf/disposition";
import { downloadFile, listKeys } from "@/lib/storage";
import { isUuid } from "@/lib/validate";

// Putting up to 200 saved page pictures into one PDF takes a while.
export const maxDuration = 120;

const NOT_FOUND = "That book no longer exists. Reload the page.";

/**
 * One of the caller's books as a PDF, made from the pages Syllabi saved (the
 * pictures as sent, after shrinking, and the text of Word pages). The original
 * files themselves are not kept.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, NOT_FOUND);

  try {
    const admin = createAdminClient();
    const { data: book, error } = await admin.from("documents").select("id, title").eq("id", id).eq("owner_id", auth.account.id).maybeSingle();
    if (error) throw error;
    if (!book) return apiError(404, NOT_FOUND);

    const [keys, { data: chunks, error: chunkError }] = await Promise.all([
      listKeys(`sources/${id}/`),
      admin.from("chunks").select("page_number, chunk_index, content").eq("document_id", id),
    ]);
    if (chunkError) throw chunkError;

    const sources = arrangeBookPages(keys, chunks ?? []);
    if (sources.length === 0) return apiError(404, "This book has no saved pages to download yet. Wait until its pages have been read.");
    if (sources.length > MAX_DOWNLOAD_PAGES) {
      return apiError(400, `This book has ${sources.length} pages, more than one download can hold (${MAX_DOWNLOAD_PAGES}).`);
    }

    const pages: BookPdfPage[] = [];
    for (let i = 0; i < sources.length; i += 10) {
      pages.push(
        ...(await Promise.all(
          sources.slice(i, i + 10).map(async (p): Promise<BookPdfPage> => {
            if ("text" in p) return { number: p.number, text: p.text };
            const file = await downloadFile(p.imagePath);
            return { number: p.number, image: { data: file.data, mimeType: file.contentType } };
          })
        ))
      );
    }

    const pdf = await renderBookPdf(book.title, pages);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfDisposition(book.title, "attachment"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "library download", "Couldn't make the download. Please try again in a moment.");
  }
}
