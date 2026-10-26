import { keyWords } from "@/lib/rag/key-words";
import { withoutHandwriting } from "@/lib/rag/handwriting";
import type { AnswerCheck, GenerationTaskType, MatchedChunk } from "@/types/database";

// Answers say which book passage each answer came from ("[S2]"), code checks that the passage really holds
// it, and the marks are then turned into page references the parent can follow ("(p. 12)").

/** Tasks whose answers cite their sources (a sample paper is printed for the student, so it has none). */
export const CITING_TASKS: GenerationTaskType[] = ["solution", "notes", "ad_hoc"];

export const CITATION_RULE = `Sources: the reference material is numbered [Source 1], [Source 2], ... End each answer (each question's
answer, or each section of notes) with the number of every source it was taken from, written as [S2] or
[S1, S3]. Cite only a source that really contains what that answer says; give no source for general
knowledge (mark that "(general knowledge)" instead). Never cite a number that is not in the material.`;

const CITE = /\[S\s*(\d+(?:\s*,\s*S?\s*\d+)*)\]/g;
const numbersOf = (inside: string) => inside.split(",").map((n) => Number(n.replace(/\D/g, "")));

/** Share of a piece's key words found in the text it cites (1 when it has too few words to judge). */
function support(piece: string, cited: string): number {
  const words = keyWords(piece.replace(CITE, " "));
  if (words.length < 3) return 1;
  const haystack = cited.toLowerCase();
  return words.filter((w) => haystack.includes(w)).length / words.length;
}

/** Below this share of its key words found in the cited passages, a citation is doubted. */
const MIN_SUPPORT = 0.3;

/** Checks every citation: the source exists, and holds enough of what the cited part says. */
export function checkCitations(text: string, chunks: MatchedChunk[]): AnswerCheck[] {
  if (chunks.length === 0) return [];
  const problems: string[] = [];
  let checked = 0;
  let from = 0;
  for (const m of text.matchAll(CITE)) {
    // The part a citation covers: from the previous citation (or the start of its answer) up to it.
    const before = text.slice(from, m.index);
    const piece = before.split(/\n(?=\*\*Q|#|\*\*[A-Z])/).pop() ?? before;
    from = m.index! + m[0].length;
    const nums = numbersOf(m[1]);
    const missing = nums.filter((n) => !chunks[n - 1]);
    if (missing.length) {
      problems.push(`${label(before)} cites source ${missing.join(", ")}, which is not in the material: cite the right source, or mark it "(general knowledge)".`);
      continue;
    }
    checked++;
    const cited = nums.map((n) => withoutHandwriting(chunks[n - 1].content) + " " + (chunks[n - 1].section_label ?? "")).join(" ");
    if (support(piece, cited) < MIN_SUPPORT) {
      problems.push(`${label(before)} cites ${nums.map((n) => pageOf(chunks[n - 1])).join(", ")}, but that page does not seem to contain what it says: cite the right source, or mark it "(general knowledge)".`);
    }
  }
  if (problems.length) return problems.slice(0, 8).map((message) => ({ kind: "citation", ok: false, message }));
  return checked > 0 ? [{ kind: "citation", ok: true, message: `All ${checked} page reference${checked === 1 ? "" : "s"} checked against the pages they point to` }] : [];
}

/** The question it answers ("Q3 (b)", the last one named before the citation), else its first few words. */
function label(segment: string): string {
  const named = [...segment.matchAll(/\*\*\s*(Q[\w.() ]{0,14}?)[.:*]/g)].pop();
  if (named) return named[1].trim();
  const words = segment.replace(/[*#>`]/g, " ").trim().split(/\s+/).slice(0, 6).join(" ");
  return words ? `"${words}…"` : "An answer";
}

function pageOf(c: MatchedChunk): string {
  return c.page_number ? `p. ${c.page_number}` : c.section_label || "a passage";
}

/** The "[S2]" marks as page references: "(p. 12)", with the book's name when several books were used. */
export function withPageReferences(text: string, chunks: MatchedChunk[]): string {
  if (chunks.length === 0) return text.replace(CITE, "").replace(/[ \t]+$/gm, "");
  const books = new Set(chunks.map((c) => c.book ?? c.document_id));
  return text.replace(CITE, (whole, inside: string) => {
    const refs = [...new Set(numbersOf(inside).map((n) => chunks[n - 1]).filter(Boolean).map((c) => (books.size > 1 && c.book ? `${c.book}, ${pageOf(c)}` : pageOf(c))))];
    return refs.length ? `(${refs.join("; ")})` : "";
  });
}
