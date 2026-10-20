/** One answer of an exercise: its bold question line and what follows it (or any text before the first one). */
export interface AnswerBlock {
  /** "Q3.2", "Warm-up Q1": the number the question was given; null for text that is not a question. */
  label: string | null;
  text: string;
}

// A bold line that begins a question: **Q1 (i). ...**, **Q3.2 ...**, **Warm-up Q1 ...**, **Source Analysis Q2**.
const QUESTION_LINE = /^\*\*\s*((?:[A-Za-z0-9-]+\s+){0,4}?Q\.?\s*[0-9IVX]+[0-9a-zA-Z.()]*(?:\s*\([a-z0-9]+\))?)/;
// What ends a question's block when no further question comes: a rule or a heading.
const BREAK = /^(?:-{3,}|#{1,6}\s)/;

/** Splits a generated answer into one block per question, so each can be judged (and highlighted) on its own. */
export function splitAnswerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let current: { label: string | null; lines: string[] } = { label: null, lines: [] };
  const flush = () => {
    const body = current.lines.join("\n").trim();
    if (body) blocks.push({ label: current.label, text: body });
  };
  for (const line of text.split("\n")) {
    const question = QUESTION_LINE.exec(line.trim());
    if (question) {
      flush();
      current = { label: question[1].replace(/\s+/g, " ").trim(), lines: [line] };
    } else if (BREAK.test(line.trim()) && current.label !== null) {
      flush();
      current = { label: null, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  return blocks;
}
