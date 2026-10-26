import { createAdminClient } from "@/lib/supabase/admin";
import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import type { MatchedChunk } from "@/types/database";

// Finding the right pages more reliably, before the answer is written:
//  1. the question is also searched as up to two fuller queries (key terms and synonyms spelled out),
//  2. the candidates are re-ranked by the AI for whether they help answer the question, not just how
//     close their meaning is, and
//  3. the passages next to the best ones are added, so an answer running over a page break is whole.
// Each step falls back to the plain search when it fails: it can only add, never lose, the closest passages.

/** Questions longer than this (a pasted worksheet) are searched question by question instead. */
const MAX_REWRITE_CHARS = 600;

export const REWRITE_SYSTEM = `You turn a school student's question into search queries for finding the right passage in their own
textbook. Write up to 2 short queries (each under 20 words) that spell out what the question is about:
the topic, the key subject terms, and common synonyms a textbook would use. Keep names, numbers and
references (like "Ex 3.2") exactly. Do not answer the question. Reply only with JSON: {"queries": ["...", "..."]}`;

export const RERANK_SYSTEM = `You pick which textbook passages help answer a student's question. You get the question and numbered
passages. Choose the passages that contain what is needed to answer it (the facts, definitions, method
or the question itself), most useful first. Leave out passages that are only on a related topic.
Reply only with JSON: {"best": [passage numbers, most useful first]}`;

function json(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function ask(ownerId: string, systemInstructions: string, prompt: string, schema: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const result = await generateCompletion({ taskType: "ad_hoc", systemInstructions, prompt, temperature: 0, maxOutputTokens: 512, jsonSchema: schema });
    await recordTokenUsage({ studentId: ownerId, taskType: "ad_hoc", provider: result.provider, model: result.model, usage: result.usage });
    return json(result.text);
  } catch (err) {
    console.error("[refine]", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Up to two fuller search queries for a question (none when it can't be done). */
export async function searchQueries(question: string, ownerId: string): Promise<string[]> {
  if (!question.trim() || question.length > MAX_REWRITE_CHARS) return [];
  const reply = await ask(ownerId, REWRITE_SYSTEM, question, {
    type: "object",
    properties: { queries: { type: "array", items: { type: "string" } } },
    required: ["queries"],
  });
  const queries = Array.isArray(reply?.queries) ? reply.queries : [];
  return queries
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim().slice(0, 200))
    .filter((q) => q.toLowerCase() !== question.trim().toLowerCase())
    .slice(0, 2);
}

/** How much of each passage the re-ranker reads. */
const RERANK_CHARS = 700;

/**
 * The `keep` passages that best help answer the question, chosen by the AI from the candidates. Any
 * candidate it leaves out is only dropped when it chose enough others; on failure the order is unchanged.
 */
export async function rerank(question: string, candidates: MatchedChunk[], keep: number, ownerId: string): Promise<MatchedChunk[]> {
  if (candidates.length <= keep) return candidates;
  const listed = candidates.map((c, i) => `[${i + 1}]${c.page_number ? ` (p.${c.page_number})` : ""} ${c.content.replace(/\s+/g, " ").slice(0, RERANK_CHARS)}`).join("\n\n");
  const reply = await ask(ownerId, RERANK_SYSTEM, `Question:\n${question.slice(0, 2000)}\n\nPassages:\n${listed}`, {
    type: "object",
    properties: { best: { type: "array", items: { type: "integer" } } },
    required: ["best"],
  });
  const picked = Array.isArray(reply?.best) ? reply.best : [];
  const chosen: MatchedChunk[] = [];
  for (const n of picked) {
    const c = typeof n === "number" ? candidates[n - 1] : undefined;
    if (c && !chosen.includes(c)) chosen.push(c);
  }
  if (chosen.length === 0) return candidates.slice(0, keep);
  // Too few chosen: fill up with the closest of the rest, so there is always enough to go on.
  for (const c of candidates) if (chosen.length < keep && !chosen.includes(c)) chosen.push(c);
  return chosen.slice(0, keep);
}

/** The most passages added as neighbours of the best ones. */
const MAX_NEIGHBOURS = 6;
/** Neighbours are fetched for this many of the best passages. */
const NEIGHBOURS_OF = 3;

/**
 * The best passages with the rest of their page and the first passage of the next page added (right after
 * each), so an answer that runs over a page break or a long passage is whole. Never fails: on a database
 * problem the passages are returned as they were.
 */
export async function withNeighbours(chunks: MatchedChunk[], ownerId: string): Promise<MatchedChunk[]> {
  const anchors = chunks.slice(0, NEIGHBOURS_OF).filter((c) => c.page_number !== null);
  if (anchors.length === 0) return chunks;
  try {
    const have = new Set(chunks.map((c) => c.id));
    const added = new Map<string, MatchedChunk[]>();
    let count = 0;
    for (const anchor of anchors) {
      const pages = [anchor.page_number!, anchor.page_number! + 1];
      const { data, error } = await createAdminClient()
        .from("chunks")
        .select("id, document_id, content, section_label, page_number, source_type, image_path, chunk_index")
        .eq("owner_id", ownerId)
        .eq("document_id", anchor.document_id)
        .in("page_number", pages)
        .order("page_number")
        .order("chunk_index")
        .limit(40);
      if (error) throw error;
      const rows = (data ?? []) as (MatchedChunk & { chunk_index: number | null })[];
      // The rest of its own page, then the start of the next page.
      const nextPageFirst = rows.find((r) => r.page_number === anchor.page_number! + 1);
      const near = [...rows.filter((r) => r.page_number === anchor.page_number), ...(nextPageFirst ? [nextPageFirst] : [])];
      const fresh: MatchedChunk[] = [];
      for (const r of near) {
        if (have.has(r.id) || count >= MAX_NEIGHBOURS) continue;
        have.add(r.id);
        count++;
        const { chunk_index: _index, ...rest } = r;
        void _index;
        // A neighbour is as close as the passage it came with, a little less: never 0, which marks a page added whole.
        fresh.push({ ...rest, book: anchor.book, similarity: Math.max(0.01, (anchor.similarity ?? 0) * 0.9) });
      }
      added.set(anchor.id, fresh);
    }
    return chunks.flatMap((c) => [c, ...(added.get(c.id) ?? [])]);
  } catch (err) {
    console.error("[refine] neighbours", err instanceof Error ? err.message : err);
    return chunks;
  }
}
