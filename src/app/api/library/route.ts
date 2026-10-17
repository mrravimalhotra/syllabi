import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { pageProgress } from "@/lib/ingestion/jobs";
import { QuotaExceededError, checkQuota } from "@/lib/quota";
import { SOURCE_TYPES, type SourceType } from "@/types/database";
import { cleanText } from "@/lib/validate";

// Most books one account can hold: far more than a family needs, but stops a
// loop or a mistake from filling the database with empty books.
const MAX_BOOKS = 300;

/** Lists the caller's own books, with how far each has been read. */
export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const { data, error } = await createAdminClient()
    .from("documents")
    .select("id, title, subject, grade, source_type, status, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_BOOKS);
  if (error) return errorResponse(error, "library GET", "Couldn't load your books. Reload the page to try again.");

  try {
    const progress = await pageProgress(user.id);
    return NextResponse.json({ documents: data.map((d) => ({ ...d, pages: progress[d.id] ?? null })) });
  } catch (err) {
    return errorResponse(err, "library GET progress", "Couldn't load your books. Reload the page to try again.");
  }
}

interface CreateBody {
  title?: unknown;
  subject?: unknown;
  grade?: unknown;
  sourceType?: unknown;
  /** The uploader confirms they own this copy and will use it only for their own child's or students' study. */
  rightsConfirmed?: unknown;
}

/**
 * Creates one of the caller's books and returns its id. The browser then sends
 * its pages to POST /api/library/[id]/pages, which are read in the background.
 * Creating the book first means a retried page can never start a second copy.
 */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (body === null) return apiError(400, "The book details couldn't be read. Check your connection and try again.");

  const title = cleanText(body.title, 200);
  if (!title) return apiError(400, "Type a title for the book, then try again.");
  if (typeof body.sourceType !== "string" || !SOURCE_TYPES.includes(body.sourceType as SourceType)) {
    return apiError(400, "Choose what kind of material this is (Textbook, Exercise, Past paper or Notes).");
  }
  if (body.rightsConfirmed !== true) {
    return apiError(400, "Tick the box that says you own this copy and will use it only for your own child's or students' study.");
  }

  try {
    // Reading pages costs tokens, so a book can't be started once the allowance is used up.
    const quota = await checkQuota(user.id);
    if (quota.overQuota) return errorResponse(new QuotaExceededError(quota), "library POST quota");

    const admin = createAdminClient();
    const { count, error: countError } = await admin.from("documents").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_BOOKS) {
      return apiError(400, `You have ${MAX_BOOKS} books, which is the most one account can hold. Delete books you no longer need, then try again.`);
    }

    const { data, error } = await admin
      .from("documents")
      .insert({
        title,
        owner_id: user.id,
        subject: cleanText(body.subject, 100),
        grade: cleanText(body.grade, 50),
        rights_confirmed_at: new Date().toISOString(),
        source_type: body.sourceType,
        status: "processing",
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("The book row was not returned");
    return NextResponse.json({ documentId: data.id });
  } catch (err) {
    return errorResponse(err, "library POST", "Couldn't start the upload. Try again in a moment.");
  }
}
