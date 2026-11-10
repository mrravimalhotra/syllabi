import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { solveParts, type PartChunk } from "@/lib/generation/solve-parts";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";

const PAGE_SIZE = 1000;
const MAX_BOOKS = 50;

/**
 * The parts "Solve all exercise questions" is done in for the chosen books: the pages that hold questions, a few at
 * a time, each with the request to send for it. No AI is used.
 */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { documentIds?: unknown } | null;
  const ids = Array.isArray(body?.documentIds) ? body.documentIds.filter((id): id is string => typeof id === "string" && isUuid(id)).slice(0, MAX_BOOKS) : [];
  if (ids.length === 0) return apiError(400, "Choose at least one book first.");
  try {
    const admin = createAdminClient();
    const { data: docs, error } = await admin.from("documents").select("id, title").eq("owner_id", auth.account.id).in("id", ids).order("created_at");
    if (error) throw error;
    const chunks: PartChunk[] = [];
    for (const doc of (docs ?? []) as { id: string; title: string }[]) {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: chunkError } = await admin
          .from("chunks")
          .select("document_id, page_number, content, source_type")
          .eq("owner_id", auth.account.id)
          .eq("document_id", doc.id)
          .order("page_number")
          .order("chunk_index")
          .range(from, from + PAGE_SIZE - 1);
        if (chunkError) throw chunkError;
        chunks.push(...((data ?? []) as PartChunk[]));
        if ((data ?? []).length < PAGE_SIZE) break;
      }
    }
    return NextResponse.json({ parts: solveParts((docs ?? []) as { id: string; title: string }[], chunks) });
  } catch (err) {
    return errorResponse(err, "solution parts", "Couldn't look through your books. Try again in a moment.");
  }
}
