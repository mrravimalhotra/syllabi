import { generateCompletion, type CompletionResult } from "@/lib/llm";

const EXTRACTION_SYSTEM_PROMPT = `You transcribe scanned or photographed textbook/exercise/past-paper pages into
clean, well-structured plain text. Preserve headings, question numbers, and paragraph
breaks. Render mathematical expressions in plain readable notation (e.g. "x^2 + 3x = 5").
Do not add commentary, do not summarize — transcribe faithfully. If the page is blank
or unreadable, output exactly: [EMPTY PAGE]`;

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
