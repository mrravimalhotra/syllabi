import { createAdminClient } from "@/lib/supabase/admin";
import { scorePage, type Legibility } from "@/lib/ingestion/confidence";
import { measureImage } from "@/lib/ingestion/image-quality";

/**
 * Scores a page that has just been read and saves the score, so its book can show how sure we are of the scan.
 * `imageBase64` is given only when the AI read the text from the picture (a page that came with its own text needs no picture check).
 * Never fails the page: a missing score only means the book shows no rating for it.
 */
export async function recordPageRead(
  ids: { documentId: string; ownerId: string; pageNumber: number },
  text: string,
  imageBase64: string | undefined,
  legibility: Legibility | null,
  numbersUnsure = false
): Promise<void> {
  try {
    const image = imageBase64 ? await measureImage(Buffer.from(imageBase64, "base64")) : null;
    const { score, issues } = scorePage({ text, image, legibility, numbersUnsure });
    const { error } = await createAdminClient()
      .from("page_reads")
      .upsert(
        { document_id: ids.documentId, page_number: ids.pageNumber, owner_id: ids.ownerId, confidence: score, issues, read_at: new Date().toISOString() },
        { onConflict: "document_id,page_number" }
      );
    if (error) throw error;
  } catch (err) {
    console.error("[ingest] page score not saved", ids.documentId, ids.pageNumber, err);
  }
}

/** How many of the pages these passages came from were hard to read when scanned (a page score under 60). Never fails: 0 if it can't tell. */
export async function countWeakPages(chunks: { document_id: string; page_number: number | null }[]): Promise<number> {
  const pages = new Set(chunks.filter((c) => c.page_number !== null).map((c) => `${c.document_id}:${c.page_number}`));
  if (pages.size === 0) return 0;
  try {
    const { data, error } = await createAdminClient()
      .from("page_reads")
      .select("document_id, page_number")
      .in("document_id", [...new Set(chunks.map((c) => c.document_id))])
      .lt("confidence", 60);
    if (error) throw error;
    return ((data ?? []) as { document_id: string; page_number: number }[]).filter((r) => pages.has(`${r.document_id}:${r.page_number}`)).length;
  } catch (err) {
    console.error("[generate] weak pages", err);
    return 0;
  }
}
