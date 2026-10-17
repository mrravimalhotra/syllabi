import { generateCompletion, type CompletionResult } from "@/lib/llm";

const EXTRACTION_SYSTEM_PROMPT = `You transcribe scanned or photographed textbook, worksheet and question-paper pages
into clean, well-structured text for a study app's search index. Pages are often phone
photos: tilted, curved near the spine, with parts of the facing page or the table at the
edges. Transcribe only the main page.

- Transcribe faithfully, in reading order. Do not summarize, add commentary or answer
  any questions on the page.
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
- Tables: Markdown tables. Blanks to fill in: keep them as "____".
- Math in plain Unicode (x², √x, ≤, π), not LaTeX.
- Skip page furniture: running headers and footers, publisher or book names, and
  decorative elements. Keep the printed page number as a last line: "Page: <number>".
- If the page is blank or unreadable, output exactly: [EMPTY PAGE]`;

/**
 * Extracts clean text from one scanned/photographed page using the LLM's native
 * vision input — no dedicated OCR vendor needed (Requirement: no OCR bill).
 */
export async function extractPageText(imageBase64: string, mimeType: string): Promise<CompletionResult> {
  const result = await generateCompletion({
    taskType: "ocr_extraction",
    systemInstructions: EXTRACTION_SYSTEM_PROMPT,
    prompt: "Transcribe this page.",
    images: [{ data: imageBase64, mimeType }],
    temperature: 0,
  });

  return { ...result, text: result.text.trim() };
}
