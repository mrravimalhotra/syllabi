import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchedChunk } from "@/types/database";

/** The most extra passages added for a "whole exercise" or "page 45" request. */
const MAX_EXTRA = 40;
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

/**
 * An exercise is many questions on one or two pages, but the search finds only
 * the closest few passages. So when the request names pages, or asks for a whole
 * exercise, every passage of those pages (and of the page after the best match,
 * where an exercise often carries on) is added, so no question is left out.
 */
export async function withWholePages(chunks: MatchedChunk[], query: string, ownerId: string): Promise<MatchedChunk[]> {
  const named = namedPages(query);
  if (chunks.length === 0 || (named.length === 0 && !wantsWholeSection(query))) return chunks;

  // The book is the best match's: page 45 of a different book would be a guess.
  const documentId = chunks[0].document_id;
  const best = chunks.filter((c) => c.document_id === documentId && c.page_number !== null).slice(0, 3);
  const pages = named.length > 0 ? named : [...new Set(best.flatMap((c) => [c.page_number!, c.page_number! + 1]))];
  if (pages.length === 0) return chunks;

  const { data, error } = await createAdminClient()
    .from("chunks")
    .select("id, document_id, content, section_label, page_number, source_type, image_path")
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
  const extra = ((data ?? []) as Omit<MatchedChunk, "similarity">[]).filter((c) => !seen.has(c.id)).map((c) => ({ ...c, similarity: 0 }));
  return [...chunks, ...extra];
}
