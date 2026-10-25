import { NextResponse, after } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueWords } from "@/lib/ingestion/confidence";
import { queuePages, readQueuedPages, rememberAppUrl } from "@/lib/ingestion/jobs";
import { checkPages, isPageNumber } from "@/lib/ingestion/upload-pages";
import { QuotaExceededError, checkQuota } from "@/lib/quota";
import { getSignedUrl, listKeys } from "@/lib/storage";
import { isUuid } from "@/lib/validate";

// The reply to an upload comes in seconds; reading queued pages carries on after it, for up to this long.
export const maxDuration = 300;

const NOT_FOUND = "That book no longer exists. Go back to My books.";
const IMAGE_KEY = /\/page-(\d+)\.[a-z0-9]+$/i;
const PAGE_SIZE = 1000;

/** Every page number of a book that has saved text, read in pages of rows (a big book has thousands of passages). */
async function textPages(documentId: string): Promise<number[]> {
  const admin = createAdminClient();
  const pages = new Set<number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("chunks")
      .select("page_number")
      .eq("document_id", documentId)
      .order("page_number")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const r of (data ?? []) as { page_number: number | null }[]) if (r.page_number !== null) pages.add(r.page_number);
    if ((data ?? []).length < PAGE_SIZE) return [...pages];
  }
}

/**
 * One page of the caller's book as Syllabi saved it: its picture, the text read from it and its scan score,
 * plus every page number (with scores) to move between them. `?page=N` picks the page; the first by default.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, NOT_FOUND);

  try {
    const admin = createAdminClient();
    const { data: book, error } = await admin.from("documents").select("id, title").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (error) throw error;
    if (!book) return apiError(404, NOT_FOUND);

    const [keys, withText, { data: reads, error: readError }] = await Promise.all([
      listKeys(`sources/${id}/`),
      textPages(id),
      admin.from("page_reads").select("page_number, confidence, issues").eq("document_id", id).limit(10_000),
    ]);
    if (readError) throw readError;

    const images = new Map<number, string>();
    for (const key of keys) {
      const match = IMAGE_KEY.exec(key);
      if (match) images.set(Number(match[1]), key);
    }
    const scores = new Map(((reads ?? []) as { page_number: number; confidence: number; issues: string[] }[]).map((r) => [r.page_number, r]));
    const numbers = [...new Set([...images.keys(), ...withText])].sort((a, b) => a - b);
    const pages = numbers.map((number) => ({ number, score: scores.get(number)?.confidence ?? null }));
    if (numbers.length === 0) return NextResponse.json({ title: book.title, pages, page: null });

    const wanted = Number(new URL(request.url).searchParams.get("page"));
    const number = numbers.includes(wanted) ? wanted : numbers[0];
    const { data: chunks, error: chunkError } = await admin
      .from("chunks")
      .select("chunk_index, content")
      .eq("document_id", id)
      .eq("page_number", number)
      .order("chunk_index");
    if (chunkError) throw chunkError;
    const imagePath = images.get(number);
    const read = scores.get(number);
    return NextResponse.json({
      title: book.title,
      pages,
      page: {
        number,
        text: ((chunks ?? []) as { content: string }[]).map((c) => c.content).join("\n\n"),
        imageUrl: imagePath ? await getSignedUrl(imagePath) : null,
        score: read?.confidence ?? null,
        issues: issueWords(read?.issues ?? []),
      },
    });
  } catch (err) {
    return errorResponse(err, "library pages GET", "Couldn't load this page. Check your connection and try again.");
  }
}

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
