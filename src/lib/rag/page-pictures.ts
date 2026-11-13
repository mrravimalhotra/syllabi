import type { MatchedChunk } from "@/types/database";

// What in a page's stored text means its picture shows something the text can't: a figure, diagram, map, graph or
// table; text the page reader couldn't make out; or a question pointing at a visual.
const VISUAL_MARK = /\[(?:Figure|Diagram|Map|Picture|Image|Graph|Chart|Photo|Table|Illustration)\b/i;
const VISUAL_WORDS = /\b(?:figure|fig\.|diagram|map|graph|pie chart|bar chart|picture|illustration|shown (?:below|above|alongside|here)|given (?:below|alongside)|look at the)\b/i;
const UNREADABLE = /\b(?:unclear|illegible|unreadable|smudged)\b|\?\?/i;
const TABLE_ROW = /^\s*\|.*\|\s*$/m;
// A page with this little text is mostly picture (or was read poorly).
const MIN_PLAIN_TEXT = 300;

/**
 * Whether the AI needs a page's picture as well as its text. The pages being solved always keep it, as their layout
 * (tables, columns, boxes) matters: the pages the request names, an exercise added whole, and (when the request
 * names no pages) any exercise page. Any other page whose text says everything is sent as text only, which costs
 * far less (owner, 13 Nov); one with a figure, table, unclear text or little text keeps its picture.
 */
export function pageNeedsPicture(pageChunks: MatchedChunk[], named: boolean, requestNamesPages = false): boolean {
  if (named || pageChunks.some((c) => c.similarity === 0 || (!requestNamesPages && c.source_type === "exercise"))) return true;
  const text = pageChunks.map((c) => c.content).join("\n");
  if (text.replace(/\s+/g, " ").trim().length < MIN_PLAIN_TEXT) return true;
  return VISUAL_MARK.test(text) || VISUAL_WORDS.test(text) || UNREADABLE.test(text) || TABLE_ROW.test(text);
}
