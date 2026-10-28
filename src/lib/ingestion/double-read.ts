import type { CompletionResult } from "@/lib/llm/types";
import { scorePage, takeLegibility, type Legibility } from "@/lib/ingestion/confidence";
import type { ImageStats } from "@/lib/ingestion/image-quality";

// An unclear page (a blurry, dark or faded photo, or one the reader itself found hard) is read a second time,
// and the numbers in the two readings compared: one misread digit makes every answer from that page wrong.
// If they differ, a third reading settles it (the reading two of the three agree on); if all three differ, the
// first is kept and the page is marked for a look, so the book asks for it to be scanned again.

/** Pages scoring under this on the first reading are read again. */
const SECOND_READ_BELOW = 75;

/** The numbers in a reading, in order of size (where they sit on the page doesn't matter, only that they match). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*(?:\s*\/\s*\d+)?/g) ?? []).map((n) => n.replace(/\s+/g, "")).sort();
}

const sameNumbers = (a: string, b: string) => numbersIn(a).join("|") === numbersIn(b).join("|");

/** Whether a first reading is unclear enough to read again: it has numbers to get wrong, and a low score. */
export function worthReadingAgain(text: string, image: ImageStats | null, legibility: Legibility | null): boolean {
  return numbersIn(text).length > 0 && scorePage({ text, image, legibility }).score < SECOND_READ_BELOW;
}

export interface Settled {
  /** The reading kept (with its legibility line). */
  raw: string;
  /** All three readings disagreed on the numbers. */
  unsure: boolean;
  /** The extra readings made, for counting their tokens. */
  extra: CompletionResult[];
}

/** Reads the page again (and a third time if needed) and keeps the reading the numbers agree on. */
export async function settleReading(first: string, readAgain: () => Promise<CompletionResult>): Promise<Settled> {
  const plain = (raw: string) => takeLegibility(raw).text;
  const second = await readAgain();
  if (sameNumbers(plain(first), plain(second.text))) return { raw: first, unsure: false, extra: [second] };
  const third = await readAgain();
  if (sameNumbers(plain(third.text), plain(first))) return { raw: first, unsure: false, extra: [second, third] };
  if (sameNumbers(plain(third.text), plain(second.text))) return { raw: second.text, unsure: false, extra: [second, third] };
  return { raw: first, unsure: true, extra: [second, third] };
}
