import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchedChunk } from "@/types/database";

/** The most extra passages added for a "whole exercise" or "page 45" request. */
const MAX_EXTRA = 60;
/** The most pages one request can name ("pages 40 to 60" stops here). */
const MAX_NAMED_PAGES = 12;

const NAMES_A_PAGE = /\bpages?\s+(\d{1,4})(?:\s*(-|–|to|and)\s*(\d{1,4}))?/gi;
const WANTS_A_SECTION = /\b(exercises?|practice set|worksheet|revision|all (?:the )?questions|every question|whole (?:exercise|chapter|page))\b/i;

/** Page numbers a request names ("page 45", "pages 12-14", "pages 3 and 5"), at most 12. */
export function namedPages(query: string): number[] {
  const pages = new Set<number>();
  for (const [, first, joiner, last] of query.matchAll(NAMES_A_PAGE)) {
    const from = Number(first);
    const to = last ? Number(last) : from;
    // "pages 3 and 5" is two pages; a dash or "to" is a range.
    const range = joiner && joiner.toLowerCase() !== "and" && to >= from;
    const list = range ? Array.from({ length: Math.min(to - from + 1, MAX_NAMED_PAGES) }, (_, i) => from + i) : [from, to];
    list.forEach((n) => pages.add(n));
  }
  return [...pages].filter((n) => n >= 1).slice(0, MAX_NAMED_PAGES);
}

/** Whether the request is for a whole exercise or section, which often runs over several passages and pages. */
export function wantsWholeSection(query: string): boolean {
  return WANTS_A_SECTION.test(query);
}

/** The most pages of one exercise that are added. */
const MAX_EXERCISE_PAGES = 12;
/** When no pages are marked as exercise, this many pages after the best match are added. */
const PAGES_AFTER_MATCH = 5;

/** The pages of the unbroken stretch of exercise pages that holds `anchor` (or the nearest exercise page to it). */
function exerciseRun(exercisePages: number[], anchor: number): number[] {
  const pages = [...new Set(exercisePages)].sort((x, y) => x - y);
  if (pages.length === 0) return [];
  const nearest = pages.reduce((best, p) => (Math.abs(p - anchor) < Math.abs(best - anchor) ? p : best));
  const run = [nearest];
  for (let p = nearest - 1; pages.includes(p); p--) run.unshift(p);
  for (let p = nearest + 1; pages.includes(p); p++) run.push(p);
  return run.slice(0, MAX_EXERCISE_PAGES);
}

type Row = Omit<MatchedChunk, "similarity">;
const COLUMNS = "id, document_id, content, section_label, page_number, source_type, image_path";

/**
 * An exercise is many questions over several pages, but the search finds only
 * the closest few passages. So when the request names pages, or asks for a whole
 * exercise, every passage of those pages is added, so no question is left out:
 *  - named pages ("page 45"): exactly those;
 *  - "the exercise": the unbroken run of pages marked Exercise (when the book was
 *    uploaded) around the best match, so pages 11 to 16 of a book whose first ten
 *    pages are the textbook come whole; with no pages marked, the best match's
 *    page and the next five.
 */
export async function withWholePages(chunks: MatchedChunk[], query: string, ownerId: string): Promise<MatchedChunk[]> {
  const named = namedPages(query);
  if (chunks.length === 0 || (named.length === 0 && !wantsWholeSection(query))) return chunks;

  // The book is the best match's: page 45 of a different book would be a guess.
  const documentId = chunks[0].document_id;
  const inBook = chunks.filter((c) => c.document_id === documentId && c.page_number !== null);
  const admin = createAdminClient();

  let pages = named;
  if (pages.length === 0) {
    const { data: marked, error } = await admin
      .from("chunks")
      .select("page_number")
      .eq("owner_id", ownerId)
      .eq("document_id", documentId)
      .eq("source_type", "exercise")
      .limit(500);
    if (error) console.error("[retrieve] exercise pages", error);
    const exercisePages = ((marked ?? []) as { page_number: number | null }[]).flatMap((r) => (r.page_number === null ? [] : [r.page_number]));
    const anchorChunk = inBook.find((c) => c.source_type === "exercise") ?? inBook[0];
    if (anchorChunk) pages = exerciseRun(exercisePages, anchorChunk.page_number!);
    if (pages.length === 0) {
      const first = Math.min(...inBook.slice(0, 3).map((c) => c.page_number!));
      pages = Number.isFinite(first) ? Array.from({ length: PAGES_AFTER_MATCH + 1 }, (_, i) => first + i) : [];
    }
  }
  if (pages.length === 0) return chunks;

  const { data, error } = await admin
    .from("chunks")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .eq("document_id", documentId)
    .in("page_number", pages)
    .order("page_number")
    .order("chunk_index")
    .limit(MAX_EXTRA);
  if (error) {
    // The usual search results are still good; carry on with them.
    console.error("[retrieve] whole pages", error);
    return chunks;
  }

  const seen = new Set(chunks.map((c) => c.id));
  const extra = ((data ?? []) as Row[]).filter((c) => !seen.has(c.id)).map((c) => ({ ...c, similarity: 0 }));
  return [...chunks, ...extra];
}
