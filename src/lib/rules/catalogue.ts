// The rules and assumptions that drive what Syllabi sends to the AI and what it does with the result, in one place,
// written for a person to read (Admin → Rules). Numbers come from the code's own constants, so they cannot drift; each
// rule that is an instruction to the AI names a phrase that must be in those instructions, and a test checks it is.

import { DEFAULT_MARKS_PER_QUESTION, gradeScaleText } from "@/lib/checks/paper";
import { MAX_REPORTS_PER_DAY } from "@/lib/bug-report";
import {
  MAX_ATTACHED_TEXT_CHARS,
  MAX_DOC_TEXT_CHARS,
  MAX_PHOTOS,
  MAX_PROMPT_CHARS,
  MAX_TOTAL_ATTACHED_TEXT_CHARS,
} from "@/lib/generation/attachments";
import { GROUNDED_SHARE, REVIEW_BELOW, REVIEW_RED_BELOW } from "@/lib/generation/confidence";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import { MAX_CHUNK_CHARS } from "@/lib/ingestion/chunk";
import {
  BLURRY_RATIO,
  DARK_BRIGHTNESS,
  FADED_CONTRAST,
  LOW_SCORE,
  LOW_SHORT_SIDE,
  MEDIUM_SCORE,
  SLIGHTLY_BLURRY_RATIO,
  SMALL_SHORT_SIDE,
  WEAK_SHARE_FOR_LOW,
} from "@/lib/ingestion/confidence";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/ingestion/extract";
import { MAX_ATTEMPTS } from "@/lib/ingestion/jobs";
import { MAX_DOWNLOAD_PAGES } from "@/lib/pdf/book-pages";
import { FULL_CONTEXT_CHARS } from "@/lib/rag/budget";
import {
  COVERAGE_THRESHOLD,
  MATCH_COUNT,
  MAX_SECTION_IMAGES,
  MAX_SOURCE_IMAGES,
  MAX_SUPPORT_CHUNKS,
  MAX_SUPPORT_QUESTIONS,
  SUPPORT_PER_QUESTION,
} from "@/lib/rag/retrieve";
import { MAX_EXERCISE_PAGES, MAX_EXTRA, MAX_LESSON_QUESTION_CHUNKS, MAX_NAMED_PAGES, PAGES_AFTER_MATCH } from "@/lib/rag/whole-pages";
import { QUESTIONS_SYSTEM, WALKTHROUGH_SYSTEM } from "@/lib/study-pack/prompts";
import { COMMANDS } from "@/app/dashboard/_ask/commands";

export type PromptKey = "solution" | "notes" | "sample_paper" | "ad_hoc" | "paper_check" | "reader" | "pack-walkthrough" | "pack-questions";

/** How a rule is applied: told to the AI, checked by code, shown on screen, a limit, or an assumption made when nothing says otherwise. */
export type RuleKind = "ai" | "code" | "screen" | "limit" | "assumption";

interface Rule {
  text: string;
  kind: RuleKind;
  /** Where in the code it lives. */
  where: string;
  /** For an instruction to the AI: a phrase that must appear in these instructions (tested, so this list cannot drift from them). */
  prompt?: { to: PromptKey; contains: string };
}

export interface RuleGroup {
  id: string;
  title: string;
  intro: string;
  rules: Rule[];
}

/** The exact instructions sent to the AI, by purpose. */
export function allPrompts(): { key: PromptKey; title: string; usedFor: string; text: string }[] {
  return [
    { key: "solution", title: "Solve", usedFor: "Step-by-step solutions, worksheets and exercises (Generate → Solve)", text: systemInstructionsFor("solution") },
    { key: "notes", title: "Notes", usedFor: "Revision notes (Generate → Notes)", text: systemInstructionsFor("notes") },
    { key: "sample_paper", title: "Sample paper", usedFor: "Practice tests with an answer key (Generate → Sample paper)", text: systemInstructionsFor("sample_paper") },
    { key: "ad_hoc", title: "Ask", usedFor: "Any study question (Generate → Ask)", text: systemInstructionsFor("ad_hoc") },
    { key: "paper_check", title: "Paper checker", usedFor: "Marking a solved maths paper (Generate → Check paper)", text: systemInstructionsFor("paper_check") },
    { key: "reader", title: "Page reader", usedFor: "Reading each scanned or photographed page when a book is uploaded", text: EXTRACTION_SYSTEM_PROMPT },
    { key: "pack-walkthrough", title: "Study pack: walkthrough", usedFor: "The story or information walkthrough of a chapter", text: WALKTHROUGH_SYSTEM },
    { key: "pack-questions", title: "Study pack: questions", usedFor: "The textbook questions and practice test of a chapter", text: QUESTIONS_SYSTEM },
  ];
}

const n = (x: number) => x.toLocaleString("en-IN");
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The rules, in groups. */
export function ruleGroups(): RuleGroup[] {
  return [...generationGroups(), ...checkingGroups()];
}

function generationGroups(): RuleGroup[] {
  return [
    {
      id: "answers",
      title: "How an answer is written",
      intro: "Told to the AI for every answer that has questions in it (an exercise, a worksheet, an answer key).",
      rules: [
        { text: "Every question and every sub-part starts on its own line, in bold, with its number: the question is written before its answer.", kind: "ai", where: "lib/generation/prompts.ts (ANSWER_STYLE)", prompt: { to: "solution", contains: "Every question and every sub-part starts on its own line, in bold with its number" } },
        { text: "The answer starts on the next line with **Ans:** followed by plain text.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "**Ans:**" } },
        { text: "Numbering restarts under every heading (1 to 4 under Q1, again under Q2, then Q.I and Q.II on a worksheet), so every answer carries its section and number: Q3.2, Q.II.4 (b).", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "always give the heading with the" } },
        { text: "Answer every question of every section, in order, up to the last one on the last page: never stop early, skip a section, or merge questions. If the material shows N questions, write N answers.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "If the material shows N questions, write N answers" } },
        { text: "Questions inside a lesson (Warm-up, Source Analysis, Think and Answer, 21st Century Skills boxes) are answered too, labelled with their box (Warm-up Q1), in the book's page order, before the exercise at the end.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "Questions inside a lesson count too" } },
        { text: "Fill in the blanks: the missing word or phrase in bold. True or false: True or False, then a one-line reason (the corrected statement when false). Multiple choice: the option letter and its text.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "Fill in the blanks: the missing word or phrase in bold" } },
        { text: "Assertion and Reason: the option letter and text, then one line why. Verbal analogy: the missing word and the relationship. Arrange in order: the option letter and the events written out in order. Passage questions: answered from the passage. Picture questions: say what the picture shows, then answer.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "Assertion (A) and Reason (R): the option letter and its text" } },
        { text: "Length follows the question's own words: one word or name is a word or a line; \"in brief\" or \"in short\" is one or two sentences; \"in detail\", \"justify\", \"explain\", \"describe\", \"do you think\" is a short paragraph of 4 to 6 sentences with the reason and an example from the book. The ruled lines left on the school's page ([Answer space: N lines]) show how much room was left.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "\"In brief\" or \"in short\"" } },
        { text: "Match the following: the pairs, one per line. Research or \"find out\" questions: a short answer from general knowledge, marked as not from the book.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "Match the following: the pairs, one per line" } },
        { text: "One numbering style for the whole answer: every question is written as Q<number> with its sub-part in brackets, never a bare \"2.\" in one place and \"Q2 (i)\" in another.", kind: "ai", where: "lib/generation/prompts.ts (ANSWER_STYLE)", prompt: { to: "solution", contains: "Use one numbering" } },
        { text: "A statement that is not in the reference material ends with \"(general knowledge)\"; everything unmarked must be from the pages, and no unsupported fact is added to lengthen an answer.", kind: "ai", where: "lib/generation/prompts.ts (ANSWER_STYLE)", prompt: { to: "solution", contains: "(general knowledge)" } },
        { text: "A word limit (\"60-80 words\") is a hard limit: the AI counts and stays inside it.", kind: "ai", where: "lib/generation/prompts.ts (ANSWER_STYLE)", prompt: { to: "solution", contains: "is a hard limit" } },
        { text: "\"Draw and label\" questions: a list of labels in the book's own terms and only the parts the book names; a text sketch only when it adds nothing the list does not say.", kind: "ai", where: "lib/generation/prompts.ts (ANSWER_STYLE)", prompt: { to: "solution", contains: "\"draw and label\" questions" } },
        { text: "\"Name one\" style questions: one answer, then at most one alternative in brackets.", kind: "ai", where: "lib/generation/prompts.ts (ANSWER_STYLE)", prompt: { to: "solution", contains: "at most one" } },
        { text: "Ask answers say where the reference material is from, for example \"(page 6)\".", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "ad_hoc", contains: "say where it is from" } },
        { text: "Earn full marks with the fewest words: lead with the textbook's key terms, no filler, don't copy the whole question back.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "Earn full marks with the fewest words" } },
        { text: "\"Distinguish between\" and \"compare\": a short table, one precise point per cell. Analytical questions: a one-line opening, a bold label for each part asked about, then 2 or 3 key factors.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "\"Distinguish between\" or \"compare\": a short table" } },
        { text: "Write maths in plain Unicode (x², √x, ≤, ×, ÷), never LaTeX, and keep lines and tables narrow enough for a phone.", kind: "ai", where: "lib/generation/prompts.ts (RAG_POLICY)", prompt: { to: "solution", contains: "Write math in plain Unicode, not LaTeX" } },
        { text: "Scanned pages may have reading slips: read through obvious garbling from the context, without comment.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "Scanned pages may have OCR slips" } },
        { text: "Where a whole exercise is asked for, each answer is written from the book in the AI's own words, and as long as the question asks for (the Quick command's request).", kind: "ai", where: "app/dashboard/_ask/commands.ts", prompt: undefined },
      ],
    },
    {
      id: "grounding",
      title: "Grounding: where answers come from",
      intro: "Answers must come from the person's own books, not from the AI's general knowledge.",
      rules: [
        { text: "Ground every answer in the reference material (the books) first; it takes priority over the AI's general knowledge. Outside knowledge or a web search only when the material is missing or insufficient, or when asked.", kind: "ai", where: "lib/generation/prompts.ts (RAG_POLICY)", prompt: { to: "solution", contains: "must take priority over your general knowledge" } },
        { text: "Never invent a source or citation.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "Never fabricate a source or citation" } },
        { text: "Every answer ends its instructions with a checklist in order of importance: correct (recompute, re-read the question), from the books (general knowledge marked), complete (every part), honest (say what is missing instead of guessing), then layout.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "in this order of importance" } },
        { text: "When the reference material holds whole books, each passage is labelled with its book and page: find the lesson that answers each question, and use the exercise pages for the questions themselves.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "each passage is labelled with its book and page" } },
        { text: "A student's handwriting on a page is reference only. The question is the printed text alone; each answer is written fresh from the book's printed content. If the handwriting agrees with the book it is rewritten more clearly; if it is wrong or incomplete it is left out or corrected, without copying it or remarking on it. The exception is when the user asks to check or mark the written answers.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "solution", contains: "treat the questions and the handwriting separately" } },
        { text: "Handwriting is never part of a search, never counted as a question, and is given to the AI apart, labelled \"Student's handwritten attempt, for reference only. It may be wrong. Never copy it.\"", kind: "code", where: "lib/rag/handwriting.ts, lib/rag/retrieve.ts" },
        { text: "Checking work: when asked to check or mark answers, go question by question: ✓ or ✗, the correct answer with a one-line reason, spelling mistakes, a score and one or two encouraging tips.", kind: "ai", where: "lib/generation/prompts.ts (REQUEST_KINDS)", prompt: { to: "solution", contains: "Checking work" } },
        { text: "Answer in the book's language by default (or the language chosen); Hindi and Marathi stay in Devanagari, French keeps its accents.", kind: "ai", where: "lib/generation/language.ts", prompt: undefined },
      ],
    },
    {
      id: "context",
      title: "What the AI is given from the books",
      intro: "Everything ticked under \"Search these books\" is meant to reach the AI.",
      rules: [
        { text: `If the selected books hold at most ${n(FULL_CONTEXT_CHARS)} characters of text (about ${n(FULL_CONTEXT_CHARS / 4)} tokens) every page of every selected book is passed, book by book in page order, each passage labelled with its book and page. Nothing is held back for the monthly allowance: the best answer comes first.`, kind: "limit", where: "lib/rag/budget.ts, lib/rag/retrieve.ts" },
        { text: `Over that, the closest passages are used: ${MATCH_COUNT} for a single question, more per question for a worksheet.`, kind: "limit", where: "lib/rag/retrieve.ts" },
        { text: `A whole-exercise request (words like exercise, worksheet, all questions, warm-up) adds every passage of the exercise pages (at most ${n(MAX_EXTRA)} passages, ${MAX_EXERCISE_PAGES} pages) around the best match, and every question box inside the lessons (at most ${MAX_LESSON_QUESTION_CHUNKS} passages). Pages marked Exercise when uploaded define where an exercise is; with none marked, the best match's page and the next ${PAGES_AFTER_MATCH}.`, kind: "limit", where: "lib/rag/whole-pages.ts" },
        { text: `Named pages (\"page 45\", \"pages 12 to 14\") bring exactly those pages (at most ${MAX_NAMED_PAGES}), from the best-matching book only.`, kind: "limit", where: "lib/rag/whole-pages.ts" },
        { text: `For a whole exercise, each of its questions (up to ${MAX_SUPPORT_QUESTIONS}) is searched for in the lessons and the best ${SUPPORT_PER_QUESTION} passages each are added (${MAX_SUPPORT_CHUNKS} in all), so the answers come from the lessons.`, kind: "limit", where: "lib/rag/retrieve.ts" },
        { text: `Page pictures sent: ${MAX_SOURCE_IMAGES} for an ordinary answer, up to ${MAX_SECTION_IMAGES} for a whole exercise or whole books, exercise pages first (questions refer to figures).`, kind: "limit", where: "lib/rag/retrieve.ts" },
        { text: `The books are judged to cover a question when the best matching passage scores at least ${COVERAGE_THRESHOLD} similarity; otherwise the request is marked weakly covered (this lowers the confidence).`, kind: "assumption", where: "lib/rag/retrieve.ts" },
        { text: "Paper checking uses no book.", kind: "code", where: "lib/generation/pipeline.ts" },
      ],
    },
    {
      id: "reader",
      title: "Reading uploaded pages",
      intro: "Told to the AI when each scanned or photographed page is read. The exact text is below.",
      rules: [
        { text: "Transcribe faithfully, in reading order; never summarize, answer questions on the page, translate or transliterate. Keep Hindi, Marathi, French and English each in its own script.", kind: "ai", where: "lib/ingestion/extract.ts", prompt: { to: "reader", contains: "Do not summarize" } },
        { text: "Keep every question number and section label as printed (Q1., Q.I., Section B) on its own line, each question as its own paragraph, each answer option on its own line.", kind: "ai", where: "lib/ingestion/extract.ts", prompt: { to: "reader", contains: "Exercises and worksheets: keep every question number" } },
        { text: "Question boxes inside a lesson are written [Questions: <box title>] with their passage and numbered questions.", kind: "ai", where: "lib/ingestion/extract.ts", prompt: { to: "reader", contains: "[Questions: <the box title>]" } },
        { text: "Ruled answer lines are recorded as [Answer space: N lines]: the school's hint of how long the answer should be.", kind: "ai", where: "lib/ingestion/extract.ts", prompt: { to: "reader", contains: "[Answer space:" } },
        { text: "A figure a question refers to is described and placed just before that question.", kind: "ai", where: "lib/ingestion/extract.ts", prompt: { to: "reader", contains: "is placed just before that question" } },
        { text: "A student's handwritten answer is written after the printed question as [Handwritten answer: ...]; crossed-out words are left out and inserted words put in place; the question text never contains handwriting.", kind: "ai", where: "lib/ingestion/extract.ts", prompt: { to: "reader", contains: "[Handwritten" } },
        { text: "Words that cannot be made out are written [illegible], never guessed; the last line rates the page [Legibility: clear / fair / poor].", kind: "ai", where: "lib/ingestion/extract.ts", prompt: { to: "reader", contains: "[illegible]" } },
        { text: `Pages are split into passages of at most ${n(MAX_CHUNK_CHARS)} characters, by headings and paragraphs; a question box or a Q heading starts a new passage.`, kind: "code", where: "lib/ingestion/chunk.ts" },
        { text: `A page that fails is tried up to ${MAX_ATTEMPTS} times with growing waits; the AI's daily free allowance pauses reading until it resets.`, kind: "limit", where: "lib/ingestion/jobs.ts" },
        { text: "Pages marked Exercise (a kind chosen per page when uploading) tell the app where an exercise is.", kind: "screen", where: "app/dashboard/library" },
      ],
    },
    {
      id: "scan",
      title: "Scan quality score (per book)",
      intro: "Shown as a badge on each book. Worked out by code from each page's picture, its text and the reader's own rating.",
      rules: [
        { text: `Picture: blurry when edge sharpness is under ${BLURRY_RATIO} of the page's contrast (slightly blurry under ${SLIGHTLY_BLURRY_RATIO}), too dark when brightness is under ${DARK_BRIGHTNESS} (of 255), faded when contrast is under ${FADED_CONTRAST}, low resolution when the short side is under ${LOW_SHORT_SIDE} pixels (small under ${SMALL_SHORT_SIDE}). Measured on real scans and on blurred, dark and faded copies of them.`, kind: "code", where: "lib/ingestion/confidence.ts, image-quality.ts" },
        { text: "Text: garbled characters, [illegible] words and almost no text lose points; the reader's rating poor caps a page at 45, fair at 82. Text that came with the file (Word, a digital PDF) is not judged on a picture.", kind: "code", where: "lib/ingestion/confidence.ts" },
        { text: `A book is Low under ${LOW_SCORE}, or when ${pct(WEAK_SHARE_FOR_LOW)} of its pages are weak (under 60); Medium under ${MEDIUM_SCORE} or with any weak page; otherwise High. Pages that could not be read count as 0. Low asks for a re-scan.`, kind: "code", where: "lib/ingestion/confidence.ts" },
      ],
    },
    {
      id: "confidence",
      title: "Answer confidence (\"95 : 89\")",
      intro: "Two numbers under every answer, worked out by code, not asked of the AI. Green is 80 or more, amber 60 to 79, red below 60.",
      rules: [
        { text: `Second number, from your books: each statement of the answer counts as from the book when at least ${pct(GROUNDED_SHARE)} of its meaningful words are found in the book passages it was written from; the rest is from outside. A statement that says it is general knowledge never counts. Handwriting is not the book.`, kind: "code", where: "lib/generation/confidence.ts" },
        { text: "First number, correct and grounded: starts from the book share; a failed automatic check takes off 20 each; checked calculations add 5; a weak match takes off 10; a web search takes off 8; each hard-to-read scanned page used takes off 5 (to 15); an answer under 40% from the books is held to 65 at most. Never 100, never under 5.", kind: "code", where: "lib/generation/confidence.ts" },
        { text: `Answers to check: in an exercise answered question by question, an answer with under ${REVIEW_BELOW}% of its words in the books is highlighted (red under ${REVIEW_RED_BELOW}%, amber from ${REVIEW_RED_BELOW}%), with the reason; a short answer (True, a word) is judged by its question.`, kind: "screen", where: "lib/generation/confidence.ts, components/AnswerText.tsx" },
        { text: "The details (statements judged, passages and pages used, how they were found, the statements furthest from the books) are saved with the answer to find why a score is low.", kind: "screen", where: "components/ConfidenceBadge.tsx" },
        { text: "These are estimates, not guarantees: a good paraphrase can look less grounded than it is, and a wrong passage copied from the book looks fully grounded.", kind: "assumption", where: "docs/EXERCISES.md" },
      ],
    },
  ];
}

function checkingGroups(): RuleGroup[] {
  return [
    {
      id: "checks",
      title: "Checks made by code on every answer",
      intro: "The AI is asked once to correct an answer that fails a check, and the checks are shown under it.",
      rules: [
        { text: `Every plain calculation in an answer is recomputed by an exact calculator; a wrong one is reported.`, kind: "code", where: "lib/checks/arithmetic.ts" },
        { text: "A sample paper's marks add up to the total asked for, and every question has an answer in the key.", kind: "code", where: "lib/checks/rules.ts" },
        { text: "A worksheet or exercise: the number of answers is at least the number of questions in the request.", kind: "code", where: "lib/checks/rules.ts" },
        { text: "Questions are found in requests by their numbering: Q1., Q.1, 1., Q.I., Section headings, [Questions: ...] boxes, a. b. c. options stay with their question, handwriting is ignored.", kind: "code", where: "lib/rag/split-questions.ts" },
        { text: "A simple calculation (\"Divide 5255 by 5\", \"LCM of 12, 18 and 30\") is answered by code, exactly and instantly, with no AI.", kind: "code", where: "lib/worked/*" },
      ],
    },
    {
      id: "paper",
      title: "Paper checker (marking a solved maths paper)",
      intro: "A teacher-style marking; the exact instructions are below.",
      rules: [
        { text: "The AI solves each sum itself first, then reads the student's working step by step and judges each step; never judges by the final answer alone.", kind: "ai", where: "lib/generation/prompts.ts (PAPER_CHECK)", prompt: { to: "paper_check", contains: "Solve it yourself first" } },
        { text: `Marks: the marks printed beside a question are used; if none are printed or given, every question is out of ${DEFAULT_MARKS_PER_QUESTION} marks; "Marks per question (set): N" makes every question out of N.`, kind: "assumption", where: "lib/checks/paper.ts, lib/generation/prompts.ts", prompt: { to: "paper_check", contains: `out of ${DEFAULT_MARKS_PER_QUESTION} marks` } },
        { text: "Marks split into method (about 60%) and answer (about 40%). A correct method with a slip keeps the method marks; a wrong value carried forward and used correctly earns the later method marks (follow-through); a correct answer with no working gets only the answer marks (\"show your steps\"); no full marks for a wrong answer; half marks allowed.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "paper_check", contains: "follow-through" } },
        { text: "A notation or wording slip with the right numbers and method (a formula written the wrong way round) costs at most half a mark; more is lost only for a wrong method, wrong numbers or a wrong answer.", kind: "ai", where: "lib/generation/prompts.ts (PAPER_CHECK)", prompt: { to: "paper_check", contains: "lose at most 0.5 of a mark" } },
        { text: "The report stays short (correct steps together on one line, each wrong step on its own line) and uses plain Unicode maths, not LaTeX or dollar signs.", kind: "ai", where: "lib/generation/prompts.ts (PAPER_CHECK)", prompt: { to: "paper_check", contains: "plain unicode, not latex or dollar signs" } },
        { text: `Grade from the percentage: ${gradeScaleText()}.`, kind: "code", where: "lib/checks/paper.ts", prompt: { to: "paper_check", contains: gradeScaleText() } },
        { text: "The report has a fixed layout (score line, marks table, a section per question, overall feedback with Well done, Work on and Next steps) so code can check that the marks are within their maximum, the table adds up to the total, the percentage and the grade follow, and each heading agrees with its row.", kind: "code", where: "lib/checks/paper.ts", prompt: { to: "paper_check", contains: "EXACTLY this layout" } },
        { text: "The teacher's own sums are recomputed; lines quoting the student's wrong working are left out of that check.", kind: "code", where: "lib/checks/paper.ts" },
        { text: "Every question gets \"To do better\" (one or two specific tips), and the paper gets patterns of mistakes and three things to practise this week.", kind: "ai", where: "lib/generation/prompts.ts", prompt: { to: "paper_check", contains: "**To do better:**" } },
        { text: "Marking uses a low temperature (0.1) so it is exact and repeatable.", kind: "assumption", where: "lib/generation/pipeline.ts" },
      ],
    },
    {
      id: "uploads",
      title: "Attachments, uploads and limits",
      intro: "What a person can send, and the limits that keep requests safe.",
      rules: [
        { text: `A question takes up to ${MAX_PHOTOS} photos or pages; a PDF with more asks which pages (for example 11 to 16). Nothing is cut off quietly.`, kind: "limit", where: "lib/generation/attachments.ts, app/dashboard/_ask" },
        { text: `The typed question may be up to ${n(MAX_PROMPT_CHARS)} characters, an attached Word file's text ${n(MAX_DOC_TEXT_CHARS)}, one PDF page's text ${n(MAX_ATTACHED_TEXT_CHARS)}, all PDF page text together ${n(MAX_TOTAL_ATTACHED_TEXT_CHARS)}; over is refused with a reason.`, kind: "limit", where: "lib/generation/attachments.ts" },
        { text: "Photos are shrunk in the browser to fit the request size; pictures that are not JPEG, PNG or WebP are refused.", kind: "limit", where: "lib/downscale-image.ts" },
        { text: `A book can be downloaded as a PDF of its saved pages (pictures, and text for Word pages), up to ${MAX_DOWNLOAD_PAGES} pages; the original files are not kept.`, kind: "limit", where: "app/api/library/[id]/download" },
        { text: `A person can raise ${MAX_REPORTS_PER_DAY} problem reports a day.`, kind: "limit", where: "lib/bug-report.ts" },
        { text: "Every AI answer counts tokens against the person's monthly allowance; an answer is refused once it has run out.", kind: "limit", where: "lib/quota.ts" },
      ],
    },
    {
      id: "export",
      title: "Export, print and what is shown",
      intro: "What leaves the app.",
      rules: [
        { text: "A PDF or a print holds only the generated answer: no \"Sources\" list and no reference-book pictures. A one-line note stays when a web search was used.", kind: "code", where: "lib/pdf/render.tsx, components/AnswerView.tsx" },
        { text: "The confidence numbers, highlights, checks and sources are on screen only, never in a print or PDF.", kind: "screen", where: "components/AnswerView.tsx" },
        { text: "The PDF's fonts have no cross: ✗ prints as ×; ✓ stays.", kind: "code", where: "lib/pdf/render.tsx" },
        { text: "A \"questions only\" PDF leaves out the answer key.", kind: "code", where: "app/api/documents/[id]/pdf" },
        { text: "The same answer is not made twice: asking the same question again returns the saved answer, unless a fresh one is asked for.", kind: "assumption", where: "lib/generation/reuse.ts" },
      ],
    },
    {
      id: "commands",
      title: "Quick commands",
      intro: "Ready-made requests on the Generate page.",
      rules: COMMANDS.solution.map((c) => ({
        text: `${c.label}${c.books ? ` (searches ${c.books.join(" and ")} books)` : ""}: ${c.prompt}`,
        kind: "ai" as const,
        where: "app/dashboard/_ask/commands.ts",
      })),
    },
    {
      id: "assumptions",
      title: "Assumptions and defaults",
      intro: "What the app assumes when nothing says otherwise.",
      rules: [
        { text: `A question without marks is out of ${DEFAULT_MARKS_PER_QUESTION} in the paper checker; a sample paper defaults to 80 marks.`, kind: "assumption", where: "lib/checks/paper.ts, app/dashboard/page.tsx" },
        { text: "About 4 characters make a token when estimating how much text fits.", kind: "assumption", where: "lib/rag/budget.ts" },
        { text: "The AI answers in the book's language unless another is chosen; the class and board from the person's profile shape the level of the answer.", kind: "assumption", where: "lib/generation/level.ts, language.ts" },
        { text: "Exam conventions of Indian schools (CBSE/ICSE/state boards, Grades 5 to 10) are followed unless the school's own material shows a different pattern, in which case the school's is followed.", kind: "ai", where: "lib/generation/prompts.ts (EXAM_CONVENTIONS)", prompt: { to: "solution", contains: "Indian school exam conventions" } },
        { text: "A sample paper copies the school's own paper layout when one is attached: header, instructions, section names, numbering and how marks are shown.", kind: "ai", where: "lib/generation/prompts.ts (SCHOOL_PAPER_STYLE)", prompt: { to: "sample_paper", contains: "copy its" } },
      ],
    },
  ];
}
