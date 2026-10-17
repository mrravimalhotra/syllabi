import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/llm";
import { downloadFile } from "@/lib/storage";
import type { CompletionImage } from "@/lib/llm/types";
import type { MatchedChunk } from "@/types/database";

export interface RetrievalScope {
  /** Only this account's own books are searched. */
  ownerId: string;
  /** Optionally narrow the search to these of the owner's books. */
  documentIds?: string[];
}

export interface RetrievalResult {
  chunks: MatchedChunk[];
  /** True when the top match's similarity is below the confidence threshold — a signal to allow search grounding. */
  coverageLow: boolean;
}

const MATCH_COUNT = 8;
const COVERAGE_THRESHOLD = 0.55;
// Caps how many source page images get sent to the model per request — request
// size/cost scale with image count, and a handful of the top matches is enough.
const MAX_SOURCE_IMAGES = 4;

/**
 * The reusable RAG retrieval core: embed the query, then run a vector search
 * over the owner's private library in pgvector via the `match_owner_chunks` RPC. Every generation route
 * (solutions, notes, sample papers, ad-hoc) calls this same function.
 */
export async function retrieveContext(query: string, scope: RetrievalScope): Promise<RetrievalResult> {
  const { embedding } = await embed(query);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_owner_chunks", {
    query_embedding: embedding,
    match_owner_id: scope.ownerId,
    match_document_ids: scope.documentIds?.length ? scope.documentIds : null,
    match_count: MATCH_COUNT,
  });

  if (error) throw new Error(`Vector search failed: ${error.message}`);

  const chunks = (data ?? []) as MatchedChunk[];
  const topSimilarity = chunks[0]?.similarity ?? 0;

  return { chunks, coverageLow: chunks.length === 0 || topSimilarity < COVERAGE_THRESHOLD };
}

/**
 * Loads the original scanned page images for the top-matched chunks, so the model
 * sees diagrams/maps/figures directly instead of relying on their OCR'd text —
 * capped and deduplicated since several chunks often share one page's image.
 * Returns both the flat list (for the LLM call) and a path → image lookup (so
 * the PDF renderer can attach the right image to the right cited source).
 */
export async function loadSourceImages(
  chunks: MatchedChunk[]
): Promise<{ images: CompletionImage[]; byPath: Map<string, CompletionImage> }> {
  const uniquePaths = [...new Set(chunks.map((c) => c.image_path).filter((p): p is string => Boolean(p)))].slice(
    0,
    MAX_SOURCE_IMAGES
  );

  const byPath = new Map<string, CompletionImage>();
  await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, contentType } = await downloadFile(path);
      byPath.set(path, { data: data.toString("base64"), mimeType: contentType });
    })
  );

  return { images: [...byPath.values()], byPath };
}

/** Formats retrieved chunks into a single context block for the completion prompt. */
export function formatContext(chunks: MatchedChunk[]): string {
  if (chunks.length === 0) return "(No matching material found in the knowledge base.)";

  return chunks
    .map((c, i) => {
      const loc = [c.section_label, c.page_number ? `p.${c.page_number}` : null].filter(Boolean).join(", ");
      const imageNote = c.image_path ? " — the original scanned page image is attached below" : "";
      return `[Source ${i + 1}${loc ? ` — ${loc}` : ""} — ${c.source_type}${imageNote}]\n${c.content}`;
    })
    .join("\n\n");
}
