import { generateCompletion, type CompletionResult } from "@/lib/llm";
import { getLlmSetting } from "@/lib/llm/config";
import { BlockedReplyError, DAILY_LIMIT } from "@/lib/errors";
import { standInFor } from "@/lib/llm/providers/google";

// Partial text worth keeping when every model declines to copy the whole page.
const MIN_PARTIAL_CHARS = 200;

export const EXTRACTION_SYSTEM_PROMPT = `You transcribe scanned or photographed textbook, worksheet and question-paper pages
into clean, well-structured text for a study app's search index. Pages are often phone
photos: tilted, curved near the spine, with parts of the facing page or the table at the
edges. Transcribe only the main page.

- Transcribe faithfully, in reading order. Do not summarize, add commentary or answer
  any questions on the page.
- Keep the page's own language and script: Hindi and Marathi in Devanagari (with every
  matra, anusvara and nukta, and Devanagari digits as printed), French with all its
  accents (é, è, à, ç, ô...), English as is. Never translate or transliterate. A page
  that mixes languages (e.g. an English textbook with a Hindi poem, or a French lesson
  with English meanings) keeps each part in its own language.
- Mark headings with Markdown: "# " for the chapter title, "## " for section headings,
  "### " for sub-headings. Keep question numbers, sub-parts (a, b, c) and marks.
- Exercises and worksheets: keep every question number and section label exactly as
  printed ("Q1.", "Q.I.", "Q.II.", "Section B") on its own line, each numbered question
  as its own paragraph (a blank line between questions), and each answer option on its
  own line with its label as printed (a), a., (i), iv.), never run into the question.
  Numbering often restarts under each heading (1 to 4 under Q1, again under Q2), so the
  heading line matters. Copy "Assertion (A): ... Reason (R): ..." pairs, verbal analogies
  ("Alvars : Vishnu :: Guru Nanak : ____"), ordering tasks with their numbered
  statements, and passages followed by their questions exactly, in that order.
- Questions inside a lesson (Warm-up, Source Analysis, Think and Answer, Check your
  understanding, Activity, "21st Century Skills" research questions, a poem or passage
  followed by questions): put [Questions: <the box title>] on its own line, then the
  passage, poem or picture it is about, then its numbered questions, one per paragraph.
  These count as questions to answer even though they are not in an exercise.
- A page may start in the middle of a question (its options or sub-parts continue from
  the page before): transcribe what is there, starting with those lines, and never
  invent the missing start.
- Ruled or dotted lines left to write answers on: one line per question, "[Answer space:
  N lines]" (N = how many lines), not a row of ____ . Use ____ only for a blank inside
  a sentence. The space is the school's hint of how long the answer should be.
- A worksheet's title strip (name or code, class, unit, date) is kept as one line:
  [Worksheet: RW – 1.1, Grade 7, Unit 1: Bhakti Movement].
- Side boxes and call-outs (e.g. "Fact File", "Let's Know More", "Learning Outcomes")
  go where they appear, as: [Box: <box title>] followed by its text.
- Code, tags and commands (HTML, Python, Scratch, spreadsheet formulas, keyboard
  shortcuts) must be copied exactly, character for character, inside \`\`\` code
  blocks for multi-line code or backticks for inline tags such as \`<title>\`.
- Figures, screenshots, diagrams and maps: one line, [Figure <number if shown>: <caption
  or a short description of what it shows>]. Transcribe any text that is part of the
  figure's meaning (labels, code in a screenshot). A picture a question refers to ("the
  painting in Fig. 1.17", "the image below") is placed just before that question, and
  described well enough (who or what, what they are doing, mood, labels) to answer from.
- Handwriting is not the book: never merge it into the printed text. Wrap anything
  handwritten (filled-in blanks, answers, margin notes, dates, "HW", corrections) as
  [Handwritten: ...] where it appears, e.g. "Vajji is an example of a ____ [Handwritten:
  Gana-Sangha]". Handwritten answers may be wrong; copy them exactly as written.
  A student's handwritten answer written on the lines under a printed question: first the
  printed question alone, exactly as printed, then on its own paragraph [Handwritten
  answer: ...] with the whole answer (bullets and all). The question text must never
  contain any of the handwriting. Words the student crossed out are left out; words
  written above the line to correct or insert are put where they belong.
- Ticks and circles on options: mark the chosen option as [Ticked]. A ticked item in a
  list of topics or tasks shows the one chosen.
- Ignore pen underlines, brackets, stars and highlights around printed text; transcribe
  the printed text once, normally.
- Maps: list the labelled places, e.g. [Map: Fig. 2.4, the sixteen mahajanapadas:
  Kuru, Panchala, ...]. Timelines: one line per entry, "date: event".
- Tables: Markdown tables. Blanks to fill in: keep them as "____".
- Math in plain Unicode (x², √x, ≤, π), not LaTeX.
- Skip page furniture: running headers and footers, publisher or book names, and
  decorative elements. Keep the printed page number as a last line: "Page: <number>".
- A word or phrase you cannot make out (blur, shadow, a finger, a torn or faded edge):
  write [illegible] in its place. Never guess it from context.
- Last of all, after the page number, one line rating how legible the page was:
  [Legibility: clear], [Legibility: fair] (some words uncertain) or [Legibility: poor]
  (much of it hard to read).
- If the page is blank or unreadable, output exactly: [EMPTY PAGE]`;

/**
 * Extracts clean text from one scanned/photographed page using the LLM's native
 * vision input — no dedicated OCR vendor needed.
 * When the configured model has used up its free daily allowance, or declines
 * the page (published text it won't copy word for word), a second model reads
 * it; if that declines too, partial text is kept when there is enough of it.
 */
export async function extractPageText(imageBase64: string, mimeType: string, hint?: string, again = false): Promise<CompletionResult> {
  // A second look at an unclear page reads it afresh, number by number.
  const carefully = again ? "\nRead it carefully: check every number digit by digit, and every decimal point, fraction and sign." : "";
  const read = async (model?: string, temperature = again ? 0.2 : 0) => {
    const result = await generateCompletion({
      taskType: "ocr_extraction",
      systemInstructions: EXTRACTION_SYSTEM_PROMPT,
      // Pictures from Word files are not whole pages: say where they came from,
      // so the transcription starts with that context (e.g. which question).
      prompt: hint
        ? `This is a picture from a Word document, not a whole page. ${hint}\nStart your transcription with that context in one line, then transcribe the picture.`
        : `Transcribe this page.${carefully}`,
      images: [{ data: imageBase64, mimeType }],
      temperature,
      ...(model ? { model } : {}),
    });
    return { ...result, text: result.text.trim() };
  };

  try {
    return await read();
  } catch (first) {
    const blocked = first instanceof BlockedReplyError;
    const dailyLimit = DAILY_LIMIT.test(first instanceof Error ? first.message : String(first));
    const { provider, model } = await getLlmSetting("ocr_extraction");
    // The Gemini adapter already switches models when one is out of requests;
    // here a page one model declined is offered to the other.
    const second = provider === "google" ? standInFor(model) : null;
    if (!(blocked || dailyLimit) || !second) {
      if (blocked && first.partialText.trim().length >= MIN_PARTIAL_CHARS) return partialResult(first, model);
      throw first;
    }
    console.warn(`[extract] ${model} ${dailyLimit ? "is out of free daily requests" : "declined the page"}; reading it with ${second}`);
    try {
      return await read(second, blocked ? 0.3 : 0);
    } catch (second) {
      // Keep whichever partial text is longer; otherwise report the first problem.
      const partials = [first, second].filter((e): e is BlockedReplyError => e instanceof BlockedReplyError);
      const best = partials.sort((a, b) => b.partialText.length - a.partialText.length)[0];
      if (best && best.partialText.trim().length >= MIN_PARTIAL_CHARS) return partialResult(best, model);
      throw dailyLimit ? first : second;
    }
  }
}

/** A declined page's partial text, used as the page's text when it is long enough. */
function partialResult(err: BlockedReplyError, model: string): CompletionResult {
  return {
    text: `${err.partialText.trim()}\n\n[The rest of this page couldn't be read.]`,
    truncated: true,
    provider: "google",
    model,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    usedSearchGrounding: false,
  };
}
