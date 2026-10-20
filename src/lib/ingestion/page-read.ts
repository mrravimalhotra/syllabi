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
  legibility: Legibility | null
): Promise<void> {
  try {
    const image = imageBase64 ? await measureImage(Buffer.from(imageBase64, "base64")) : null;
    const { score, issues } = scorePage({ text, image, legibility });
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
