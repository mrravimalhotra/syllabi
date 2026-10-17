import { generateCompletion, type CompletionResult } from "@/lib/llm";
import { getLlmSetting } from "@/lib/llm/config";
import { BlockedReplyError, DAILY_LIMIT } from "@/lib/errors";
import { standInFor } from "@/lib/llm/providers/google";

// Partial text worth keeping when every model declines to copy the whole page.
const MIN_PARTIAL_CHARS = 200;

const EXTRACTION_SYSTEM_PROMPT = `You transcribe scanned or photographed textbook, worksheet and question-paper pages
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
- Side boxes and call-outs (e.g. "Fact File", "Let's Know More", "Learning Outcomes")
  go where they appear, as: [Box: <box title>] followed by its text.
- Code, tags and commands (HTML, Python, Scratch, spreadsheet formulas, keyboard
  shortcuts) must be copied exactly, character for character, inside \`\`\` code
  blocks for multi-line code or backticks for inline tags such as \`<title>\`.
- Figures, screenshots, diagrams and maps: one line, [Figure <number if shown>: <caption
  or a short description of what it shows>]. Transcribe any text that is part of the
  figure's meaning (labels, code in a screenshot).
- Handwriting is not the book: never merge it into the printed text. Wrap anything
  handwritten (filled-in blanks, answers, margin notes, dates, "HW", corrections) as
  [Handwritten: ...] where it appears, e.g. "Vajji is an example of a ____ [Handwritten:
  Gana-Sangha]". Handwritten answers may be wrong; copy them exactly as written.
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
- If the page is blank or unreadable, output exactly: [EMPTY PAGE]`;

/**
 * Extracts clean text from one scanned/photographed page using the LLM's native
 * vision input — no dedicated OCR vendor needed.
 * When the configured model has used up its free daily allowance, or declines
 * the page (published text it won't copy word for word), a second model reads
 * it; if that declines too, partial text is kept when there is enough of it.
 */
export async function extractPageText(imageBase64: string, mimeType: string, hint?: string): Promise<CompletionResult> {
  const read = async (model?: string, temperature = 0) => {
    const result = await generateCompletion({
      taskType: "ocr_extraction",
      systemInstructions: EXTRACTION_SYSTEM_PROMPT,
      // Pictures from Word files are not whole pages: say where they came from,
      // so the transcription starts with that context (e.g. which question).
      prompt: hint
        ? `This is a picture from a Word document, not a whole page. ${hint}\nStart your transcription with that context in one line, then transcribe the picture.`
        : "Transcribe this page.",
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
