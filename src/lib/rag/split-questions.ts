// Worksheets and exercises ask many questions at once, often on different
// topics. One search for the whole text finds material for only a few of them,
// so each question is searched separately. Formats seen in real school material:
//   flat:      "Q.1 Compare ...", "Q.2 Describe ..."   or   "1.What is ...", "2. Mention ..."
//   two-level: "Q1. Fill in the blanks." then "1. Vajji is ...", "2. ... wells ..."
//   bullets:   "* Question: What do you mean by ...?"
// MCQ options (i., ii., a., b.) and sub-parts (a), b)) stay with their question.

// Hindi and Marathi papers use Devanagari digits (१, २...), "प्रश्न"/"प्र." for
// "Question", "।" as a full stop, and "विभाग"/"खंड"/"भाग" for "Section";
// French papers use "Exercice" and "Partie".
const DIGIT = "[0-9०-९]";

/** "Q1.", "Q.1", "Q 1)", "Question 3:", "प्रश्न १.", "प्र. 2", "Exercice 4", "Q.I.", "Q.II)" — a top-level question or a section of questions. */
const Q_HEADING = new RegExp(
  `^\\s*(?:Q(?:uestion)?|Exercice|प्रश्न|प्र)\\.?\\s*(?:${DIGIT}{1,2}\\s*[.):\\-।]?|[IVX]{1,5}\\s*[.):\\-])\\s*\\S`,
  "i"
);
/** "1.", "1)", "1.What", "१." — a numbered item. A digit may not follow, so "1.5" isn't one. */
const NUMBERED = new RegExp(`^\\s*${DIGIT}{1,2}[.)।](?!${DIGIT})\\s*\\S`);
/** "[Questions: Warm-up]" (a box of questions inside a lesson), "SECTION B", "Section A: Objective questions", "Part 2", "A. Fill in the blanks", "विभाग अ", "Partie B" — a section heading. */
const SECTION = /^\s*(?:\[Questions?:|(?:SECTION|Part|Partie)\s+[A-Z0-9]+\b|[A-H]\.\s+[A-Z]|(?:विभाग|खंड|भाग)\s+\S)/i;
/** "a.", "B)", "(c)" at the start of a line: an answer option, when it carries on from the one before. */
const LETTER_OPTION = /^\s*\(?([a-h])[.)]\s*\S/i;
/** "* Question: ...", "- Question: ...", "• Q: ..." — an unnumbered question bullet. */
const BULLET_QUESTION = /^\s*[*\-•]\s*(?:Question|Q)\s*[:.]/i;

const MAX_QUESTIONS = 40;
const MIN_QUESTION_CHARS = 12;

interface Block {
  heading: string;
  items: string[][];
  body: string[];
}

/** A numbered question, a question heading or a section heading. */
const startsNewQuestion = (line: string) => NUMBERED.test(line) || Q_HEADING.test(line) || SECTION.test(line);

/** The letter of the answer option on this line when it carries on from the last one (a, then b...), else null. */
function nextOption(line: string, last: string | null): string | null {
  const letter = LETTER_OPTION.exec(line)?.[1].toLowerCase();
  const expected = last === null ? "a" : String.fromCharCode(last.charCodeAt(0) + 1);
  return letter === expected ? letter : null;
}

/** The text sorted into what comes before the first question, section/question blocks with their numbered items, and bullet questions. */
function sortLines(text: string): { preamble: string[]; blocks: Block[]; bullets: string[][] } {
  const preamble: string[] = [];
  const blocks: Block[] = [];
  const bullets: string[][] = [];
  let inCode = false;

  // The letter of the last answer option (a, b, c...) seen under the current numbered item.
  let lastOption: string | null = null;

  const current = () => blocks[blocks.length - 1];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) inCode = !inCode;
    if (!line) continue;

    // "a. i-iii-ii-iv" or "B. Society became more just" under a numbered question are its options, not a new section.
    const option: string | null = !inCode && current()?.items.length ? nextOption(line, lastOption) : null;
    if (option !== null) {
      lastOption = option;
      const items = current().items;
      items[items.length - 1].push(line);
      continue;
    }
    if (!inCode && startsNewQuestion(line)) lastOption = null;

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
  return { preamble, blocks, bullets };
}

/** The questions in one block, each with the context lines before it. */
function questionsInBlock(block: Block, context: string): string[] {
  const withContext = (parts: string[]) => parts.filter(Boolean).join("\n");
  if (block.items.length > 0) {
    // A section heading over numbered items: each item is a question.
    const heading = [block.heading, ...block.body].join(" ").slice(0, 200);
    return block.items.map((item) => withContext([context, heading, item.join(" ")]));
  }
  // A bare section heading ("SECTION B") is not a question.
  if (SECTION.test(block.heading) && block.body.length === 0) return [];
  // A section of unnumbered questions ("A. Knowledge & Understanding" then
  // one question per line): split the section on question marks.
  const body = block.body.join(" ");
  if (SECTION.test(block.heading) && (body.match(/\?/g) ?? []).length >= 2) {
    return body.split(/(?<=\?)\s+/).map((q) => withContext([context, block.heading, q]));
  }
  // A question on its own ("Q.3 Justify ..."), possibly with its sub-parts.
  return [withContext([context, [block.heading, ...block.body].join(" ")])];
}

/**
 * Splits text into its separate questions. Returns an empty list when there
 * are fewer than two, meaning "search the text as a whole". The text before
 * the first question (chapter name, instructions) and a section heading such
 * as "Q1. Fill in the blanks." are kept with each question as context. Lines
 * inside ``` code blocks never start a question.
 */
export function splitQuestions(text: string): string[] {
  const { preamble, blocks, bullets } = sortLines(text);
  const context = preamble.join(" ").slice(0, 200);
  const questions = [
    ...blocks.flatMap((block) => questionsInBlock(block, context)),
    ...bullets.map((bullet) => [context, bullet.join(" ")].filter(Boolean).join("\n")),
  ];
  const real = questions.filter((q) => q.split("\n").pop()!.length >= MIN_QUESTION_CHARS);
  return real.length >= 2 ? real.slice(0, MAX_QUESTIONS) : [];
}
