// Stands in for the PDF maker: records what it was asked to put in the book.
export const made: { title: string; pages: { number: number; image?: unknown; text?: string }[] }[] = [];
export async function renderBookPdf(title: string, pages: { number: number; image?: unknown; text?: string }[]) {
  made.push({ title, pages });
  return Buffer.from("%PDF-fake");
}
