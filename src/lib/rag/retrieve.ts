import { createAdminClient } from "@/lib/supabase/admin";
import { embed, embedMany } from "@/lib/llm";
import { handwritingIn, withoutHandwriting } from "@/lib/rag/handwriting";
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

/** How the passages were found, for finding out why an answer scored low. */
export interface RetrievalStats {
  /** "exercise": whole exercise pages were fetched and lessons searched for each question; "search": the closest passages only. */
  mode: "search" | "exercise";
  /** Exercise (or named-page) passages added whole. */
  sectionChunks: number;
  /** Questions of the exercise that were searched for in the books. */
  questions: number;
  /** Lesson passages added to support them. */
  supportChunks: number;
  /** Closest match of the first search, 0 to 1. */
  topSimilarity: number | null;
}

export interface RetrievalResult {
  stats: RetrievalStats;
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
export async function retrieveContext(typed: string, scope: RetrievalScope): Promise<RetrievalResult> {
  // A student's handwritten answers on the page are not part of the question: search on the printed text only.
  const query = withoutHandwriting(typed);
  const questions = splitQuestions(query);
  if (questions.length === 0) {
    const { embedding } = await embed(query);
    const found = await search(embedding, scope, MATCH_COUNT);
    const topSimilarity = found[0]?.similarity ?? 0;
    return withSupport(await withWholePages(found, query, scope.ownerId), found.length === 0 || topSimilarity < COVERAGE_THRESHOLD, scope, found[0]?.similarity ?? null);
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
  return withSupport(await withWholePages(chunks, query, scope.ownerId), chunks.length === 0 || weak * 2 >= perQuestion.length, scope, chunks[0]?.similarity ?? null);
}

// Whole-exercise requests: how many of the exercise's questions are searched for support, how many passages each
// search looks at, how many it keeps, and the most supporting passages added in all.
const MAX_SUPPORT_QUESTIONS = 40;
const SUPPORT_SEARCH = 8;
const SUPPORT_PER_QUESTION = 3;
const MAX_SUPPORT_CHUNKS = 36;

/**
 * A whole-exercise request ("solve all exercise questions") has the exercise pages themselves, but the answers
 * come from the lessons: the request is generic, so its own search finds nothing for them. So each question of
 * the exercise is searched for in the books, and the best lesson passages are added (the exercise pages are
 * already there). Without this the AI answers from its own knowledge. Other requests pass through unchanged.
 * Whether the books cover the exercise is then judged by how well those passages match its questions.
 */
async function withSupport(chunks: MatchedChunk[], coverageLow: boolean, scope: RetrievalScope, topSimilarity: number | null): Promise<RetrievalResult> {
  // Passages added whole mark a whole-exercise request; then every exercise passage counts, including one the search found itself.
  const whole = chunks.some((c) => c.similarity === 0);
  const section = whole ? chunks.filter((c) => c.similarity === 0 || c.source_type === "exercise") : [];
  const questions = splitQuestions(section.map((c) => withoutHandwriting(c.content)).join("\n\n")).slice(0, MAX_SUPPORT_QUESTIONS);
  const stats: RetrievalStats = { mode: "search", sectionChunks: section.length, questions: 0, supportChunks: 0, topSimilarity };
  if (questions.length === 0) return { chunks, coverageLow, stats };

  const embeddings = await embedMany(questions);
  const have = new Set(chunks.map((c) => c.id));
  // Exercise passages are already there whole: only lessons and notes can support an answer.
  const perQuestion = (await Promise.all(embeddings.map((e) => search(e.embedding, scope, SUPPORT_SEARCH)))).map((found) =>
    found.filter((c) => c.source_type !== "exercise" && !have.has(c.id)).slice(0, SUPPORT_PER_QUESTION)
  );

  const added: MatchedChunk[] = [];
  for (let rank = 0; rank < SUPPORT_PER_QUESTION; rank++) {
    for (const matches of perQuestion) {
      const chunk = matches[rank];
      if (chunk && !have.has(chunk.id) && added.length < MAX_SUPPORT_CHUNKS) {
        have.add(chunk.id);
        added.push(chunk);
      }
    }
  }
  // The books cover the exercise when most of its questions found a close lesson passage.
  const weak = perQuestion.filter((m) => (m[0]?.similarity ?? 0) < COVERAGE_THRESHOLD).length;
  return {
    chunks: [...chunks, ...added],
    coverageLow: weak * 2 >= perQuestion.length,
    stats: { ...stats, mode: "exercise", questions: questions.length, supportChunks: added.length },
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
      // The printed text and the student's handwriting on it are kept apart, so an answer is never copied from the handwriting.
      const attempt = handwritingIn(c.content);
      const attemptNote = attempt.length > 0 ? `\n[Student's handwritten attempt, for reference only. It may be wrong. Never copy it: ${attempt.join(" / ")}]` : "";
      return `[Source ${i + 1}${loc ? ` — ${loc}` : ""} — ${c.source_type}${imageNote}]\n${withoutHandwriting(c.content)}${attemptNote}`;
    })
    .join("\n\n");
}
