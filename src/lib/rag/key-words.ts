import type { MatchedChunk } from "@/types/database";

// Words that say what to do, not what about: matching them would find every passage.
const IGNORED = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my no not of on or our " +
    "she he so than that the their them then there these they this those to us was we were what when where which who whom why will with " +
    "would you your all also any each more most other some such only own same very just about above after again against before below " +
    "between both during further here once out over under until up down off too " +
    "answer answers ask brief briefly chapter class define describe detail details difference differentiate discuss do draw " +
    "example examples explain find give help know list mark marks mention name note notes please point points question questions " +
    "short simple simply solve solution state step steps tell textbook book long word words write " +
    // The same in Hindi: what, how, why, who, which, write, tell, explain, answer, question.
    "क्या कैसे क्यों कौन कौनसा लिखिए लिखो बताइए बताओ समझाइए समझाओ उत्तर प्रश्न"
  ).split(" ")
);

/** The most key words searched for in one question. */
const MAX_KEY_WORDS = 12;

/**
 * The words of a question worth finding exactly in the books: references ("3.2", "q5"), names and terms,
 * lower-case and each once, without everyday words like "the" or "explain".
 */
export function keyWords(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}\p{M}]+(?:[.\-/][\p{N}]+)*/gu) ?? [];
  const kept: string[] = [];
  for (const word of words) {
    const isNumber = /\p{N}/u.test(word);
    if (IGNORED.has(word) || (!isNumber && word.length < 3) || kept.includes(word)) continue;
    kept.push(word);
    if (kept.length === MAX_KEY_WORDS) break;
  }
  return kept;
}

// Reciprocal rank fusion: a passage near the top of either list scores well, and one in both lists best.
const RANK_OFFSET = 60;

/** The meaning-based and exact-word results merged into one list of `count`, best first. */
export function fuse(byMeaning: MatchedChunk[], byWords: MatchedChunk[], count: number): MatchedChunk[] {
  if (byWords.length === 0) return byMeaning.slice(0, count);
  const scores = new Map<string, { chunk: MatchedChunk; score: number }>();
  for (const list of [byMeaning, byWords]) {
    list.forEach((chunk, rank) => {
      const entry = scores.get(chunk.id) ?? { chunk, score: 0 };
      entry.score += 1 / (RANK_OFFSET + rank + 1);
      scores.set(chunk.id, entry);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((e) => e.chunk);
}

/** The closest match in a list, 0 to 1 (0 when empty): a merged list is not sorted by closeness. */
export function bestSimilarity(chunks: MatchedChunk[]): number {
  return chunks.reduce((best, c) => Math.max(best, c.similarity ?? 0), 0);
}
