// The most book text passed whole to the AI in one answer: about 100,000 tokens (a tenth of what the AI can read at
// once), and never more than half of what is left of the person's monthly allowance, so one answer can't use it all up.
const FULL_CONTEXT_CHARS = 400_000;
const CHARS_PER_TOKEN = 4;
const MAX_ALLOWANCE_SHARE = 0.5;

/** How many characters of book text may be passed whole, given the tokens left this month. */
export function fullContextBudget(remainingTokens: number): number {
  return Math.max(0, Math.min(FULL_CONTEXT_CHARS, Math.floor(remainingTokens * CHARS_PER_TOKEN * MAX_ALLOWANCE_SHARE)));
}
