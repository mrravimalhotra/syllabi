// The most book text passed whole to the AI in one answer: about 100,000 tokens, a tenth of what the AI can read at
// once. Nothing is held back for the person's monthly allowance: the best answer comes first (the allowance is still
// counted as usual, and an answer is refused once it has run out).
const FULL_CONTEXT_CHARS = 400_000;

/** How many characters of book text may be passed whole. */
export function fullContextBudget(): number {
  return FULL_CONTEXT_CHARS;
}
