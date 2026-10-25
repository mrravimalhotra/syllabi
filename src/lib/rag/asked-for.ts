// Pasted or attached text this short (an instruction like "Do all of Exercise 4.2") can ask for pages; a longer
// paste is material to work on, and its headings ("Exercise 3", "Page 12") must not switch on whole pages.
const SHORT_PASTE_LINES = 2;
const SHORT_PASTE_CHARS = 200;

const isShort = (text: string) => text.length <= SHORT_PASTE_CHARS && text.split(/\n/).filter((l) => l.trim()).length <= SHORT_PASTE_LINES;

/**
 * The part of a request that can ask for a whole exercise or named pages: what was typed, plus attached
 * text only when it is short. A long paste in the question box counts only by its first line (the instruction
 * typed above it, like "Answer these:").
 */
export function askedFor(typed: string, attached: string): string {
  const ask = isShort(typed) ? typed : (typed.split(/\n/).find((l) => l.trim()) ?? "").slice(0, SHORT_PASTE_CHARS);
  return [ask, attached && isShort(attached.trim()) ? attached.trim() : ""].filter(Boolean).join("\n");
}
