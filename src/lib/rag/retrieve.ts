import { createAdminClient } from "@/lib/supabase/admin";
import { embed, embedMany } from "@/lib/llm";
import { splitQuestions } from "@/lib/rag/split-questions";
import { withWholePages } from "@/lib/rag/whole-pages";
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
// Worksheets: matches per question, and the most passages sent in total.
const MATCHES_PER_QUESTION = 4;
const MAX_TOTAL_MATCHES = 48;
const COVERAGE_THRESHOLD = 0.55;
// Caps how many source page images get sent to the model per request — request
// size/cost scale with image count, and a handful of the top matches is enough.
const MAX_SOURCE_IMAGES = 4;
// A whole exercise: its questions often point at a figure, so each of its pages (up to this many) is sent.
const MAX_SECTION_IMAGES = 10;

/**
 * The reusable RAG retrieval core: embed the query, then run a vector search
 * over the owner's private library in pgvector via the `match_owner_chunks`
 * RPC. A worksheet with several questions gets one search per question (one
 * batched embedding call), so every question finds its own material.
 */
export async function retrieveContext(query: string, scope: RetrievalScope): Promise<RetrievalResult> {
  const questions = splitQuestions(query);
  if (questions.length === 0) {
    const { embedding } = await embed(query);
    const found = await search(embedding, scope, MATCH_COUNT);
    const topSimilarity = found[0]?.similarity ?? 0;
    return {
      chunks: await withWholePages(found, query, scope.ownerId),
      coverageLow: found.length === 0 || topSimilarity < COVERAGE_THRESHOLD,
    };
  }

  const embeddings = await embedMany(questions);
  const perQuestion = await Promise.all(embeddings.map((e) => search(e.embedding, scope, MATCHES_PER_QUESTION)));

  // Interleave (each question's best match first, then second best, ...) so
  // the total cap never starves later questions; drop duplicates.
  const seen = new Set<string>();
  const chunks: MatchedChunk[] = [];
  for (let rank = 0; rank < MATCHES_PER_QUESTION; rank++) {
    for (const matches of perQuestion) {
      const chunk = matches[rank];
      if (chunk && !seen.has(chunk.id) && chunks.length < MAX_TOTAL_MATCHES) {
        seen.add(chunk.id);
        chunks.push(chunk);
      }
    }
  }

  // Coverage is low when at least half the questions found nothing close.
  const weak = perQuestion.filter((m) => (m[0]?.similarity ?? 0) < COVERAGE_THRESHOLD).length;
  return {
    chunks: await withWholePages(chunks, query, scope.ownerId),
    coverageLow: chunks.length === 0 || weak * 2 >= perQuestion.length,
  };
}

async function search(embedding: number[], scope: RetrievalScope, count: number): Promise<MatchedChunk[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_owner_chunks", {
    query_embedding: embedding,
    match_owner_id: scope.ownerId,
    match_document_ids: scope.documentIds?.length ? scope.documentIds : null,
    match_count: count,
  });
  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return (data ?? []) as MatchedChunk[];
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
  // Pages added for a whole exercise (similarity 0) come first and get more room: its questions refer to their figures.
  const wholeSection = chunks.some((c) => c.similarity === 0);
  const ordered = wholeSection ? [...chunks.filter((c) => c.similarity === 0), ...chunks.filter((c) => c.similarity !== 0)] : chunks;
  const uniquePaths = [...new Set(ordered.map((c) => c.image_path).filter((p): p is string => Boolean(p)))].slice(
    0,
    wholeSection ? MAX_SECTION_IMAGES : MAX_SOURCE_IMAGES
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
  if (chunks.length === 0) return "(No matching material found in the books.)";

  return chunks
    .map((c, i) => {
      const loc = [c.section_label, c.page_number ? `p.${c.page_number}` : null].filter(Boolean).join(", ");
      const imageNote = c.image_path ? " — the original scanned page image is attached below" : "";
      return `[Source ${i + 1}${loc ? ` — ${loc}` : ""} — ${c.source_type}${imageNote}]\n${c.content}`;
    })
    .join("\n\n");
}
