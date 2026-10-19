/** One page of a downloaded book: its saved picture, or (for Word files) its text. */
export type BookPageSource = { number: number; imagePath: string } | { number: number; text: string };

/** The most pages one download will hold (a bigger book would not finish in time). */
export const MAX_DOWNLOAD_PAGES = 200;

const IMAGE_KEY = /\/page-(\d+)\.[a-z0-9]+$/i;

/**
 * Puts a book's saved pages in order: a page with a picture shows the picture
 * (its words are already on it); a page without one (Word files) shows its text.
 */
export function arrangeBookPages(imageKeys: string[], chunks: { page_number: number | null; chunk_index?: number | null; content: string }[]): BookPageSource[] {
  const withImage = new Map<number, string>();
  for (const key of imageKeys) {
    const match = IMAGE_KEY.exec(key);
    if (match) withImage.set(Number(match[1]), key);
  }

  const words = new Map<number, string[]>();
  [...chunks]
    .sort((a, b) => (a.page_number ?? 0) - (b.page_number ?? 0) || (a.chunk_index ?? 0) - (b.chunk_index ?? 0))
    .forEach((c) => {
      if (c.page_number === null || withImage.has(c.page_number) || !c.content.trim()) return;
      words.set(c.page_number, [...(words.get(c.page_number) ?? []), c.content.trim()]);
    });

  const pages: BookPageSource[] = [
    ...[...withImage].map(([number, imagePath]) => ({ number, imagePath })),
    ...[...words].map(([number, parts]) => ({ number, text: parts.join("\n\n") })),
  ];
  return pages.sort((a, b) => a.number - b.number);
}
