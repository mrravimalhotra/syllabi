export interface TextChunk {
  content: string;
  sectionLabel: string | null;
}

const MAX_CHUNK_CHARS = 1500;
// Also Hindi/Marathi (पाठ, अध्याय, प्रश्न, स्वाध्याय, अभ्यास; Devanagari digits) and French
// (Chapitre, Leçon, Exercice) chapter, lesson and question headings.
const HEADING_RE =
  /^(#{1,3}\s+.+|(?:Chapter|Section|Question|Exercise|Q\.?|Chapitre|Leçon|Exercice|पाठ|अध्याय|प्रश्न|स्वाध्याय|अभ्यास)\s*[0-9०-९]+.*)$/i;

/**
 * Splits page text into chunks by section/question/paragraph boundaries, capping
 * chunk size so each stays a coherent retrieval unit. A running heading (chapter/
 * question label) is carried forward as the chunk's section_label metadata.
 */
export function chunkPageText(pageText: string, pageNumber: number): TextChunk[] {
  if (!pageText || pageText === "[EMPTY PAGE]") return [];

  const paragraphs = pageText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let currentHeading: string | null = null;
  let buffer = "";

  const flush = () => {
    const content = buffer.trim();
    if (content) chunks.push({ content, sectionLabel: currentHeading ?? `Page ${pageNumber}` });
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    const firstLine = paragraph.split("\n")[0].trim();
    if (HEADING_RE.test(firstLine)) {
      flush();
      currentHeading = firstLine.replace(/^#{1,3}\s+/, "");
    }

    if ((buffer + "\n\n" + paragraph).length > MAX_CHUNK_CHARS) {
      flush();
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }
  flush();

  return chunks;
}
