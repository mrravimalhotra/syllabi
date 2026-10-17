// Worksheets and exercises ask many questions at once, often on different
// topics. One search for the whole text finds material for only a few of them,
// so each question is searched separately. Formats seen in real school material:
//   flat:      "Q.1 Compare ...", "Q.2 Describe ..."   or   "1.What is ...", "2. Mention ..."
//   two-level: "Q1. Fill in the blanks." then "1. Vajji is ...", "2. ... wells ..."
//   bullets:   "* Question: What do you mean by ...?"
// MCQ options (i., ii., a., b.) and sub-parts (a), b)) stay with their question.

/** "Q1.", "Q.1", "Q 1)", "Question 3:" — a top-level question or a section of questions. */
const Q_HEADING = /^\s*Q(?:uestion)?\.?\s*\d{1,2}\s*[.):\-]?\s*\S/i;
/** "1.", "1)", "1.What" — a numbered item. A digit may not follow, so "1.5" isn't one. */
const NUMBERED = /^\s*\d{1,2}[.)](?!\d)\s*\S/;
/** "SECTION B", "Section A: Objective questions", "Part 2", "A. Fill in the blanks" — a section heading. */
const SECTION = /^\s*(?:(?:SECTION|Part)\s+[A-Z0-9]+\b|[A-H]\.\s+[A-Z])/i;
/** "* Question: ...", "- Question: ...", "• Q: ..." — an unnumbered question bullet. */
const BULLET_QUESTION = /^\s*[*\-•]\s*(?:Question|Q)\s*[:.]/i;

const MAX_QUESTIONS = 40;
const MIN_QUESTION_CHARS = 12;

interface Block {
  heading: string;
  items: string[][];
  body: string[];
}

/**
 * Splits text into its separate questions. Returns an empty list when there
 * are fewer than two, meaning "search the text as a whole". The text before
 * the first question (chapter name, instructions) and a section heading such
 * as "Q1. Fill in the blanks." are kept with each question as context. Lines
 * inside ``` code blocks never start a question.
 */
export function splitQuestions(text: string): string[] {
  const preamble: string[] = [];
  const blocks: Block[] = [];
  const bullets: string[][] = [];
  let inCode = false;

  const current = () => blocks[blocks.length - 1];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) inCode = !inCode;
    if (!line) continue;

    if (!inCode && BULLET_QUESTION.test(line)) {
      bullets.push([line.replace(BULLET_QUESTION, "").trim()]);
    } else if (!inCode && (Q_HEADING.test(line) || SECTION.test(line))) {
      blocks.push({ heading: line, items: [], body: [] });
    } else if (!inCode && NUMBERED.test(line)) {
      if (!current()) blocks.push({ heading: "", items: [], body: [] });
      current().items.push([line]);
    } else if (bullets.length > 0) {
      bullets[bullets.length - 1].push(line);
    } else if (current()) {
      const items = current().items;
      if (items.length > 0) items[items.length - 1].push(line);
      else current().body.push(line);
    } else {
      preamble.push(line);
    }
  }

  const context = preamble.join(" ").slice(0, 200);
  const withContext = (parts: string[]) => parts.filter(Boolean).join("\n");

  const questions: string[] = [];
  for (const block of blocks) {
    if (block.items.length === 0) {
      // A bare section heading ("SECTION B") is not a question.
      if (SECTION.test(block.heading) && block.body.length === 0) continue;
      // A section of unnumbered questions ("A. Knowledge & Understanding" then
      // one question per line): split the section on question marks.
      const body = block.body.join(" ");
      if (SECTION.test(block.heading) && (body.match(/\?/g) ?? []).length >= 2) {
        for (const q of body.split(/(?<=\?)\s+/)) questions.push(withContext([context, block.heading, q]));
        continue;
      }
      // A question on its own ("Q.3 Justify ..."), possibly with its sub-parts.
      questions.push(withContext([context, [block.heading, ...block.body].join(" ")]));
    } else {
      // A section heading over numbered items: each item is a question.
      const heading = [block.heading, ...block.body].join(" ").slice(0, 200);
      for (const item of block.items) questions.push(withContext([context, heading, item.join(" ")]));
    }
  }
  for (const bullet of bullets) questions.push(withContext([context, bullet.join(" ")]));

  const real = questions.filter((q) => q.split("\n").pop()!.length >= MIN_QUESTION_CHARS);
  return real.length >= 2 ? real.slice(0, MAX_QUESTIONS) : [];
}
