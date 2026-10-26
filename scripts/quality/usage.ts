// The quality test set records no usage (there is no database); it only counts the tokens.
export const used = { tokens: 0 };
export async function recordTokenUsage(row: { usage: { totalTokens: number } }) {
  used.tokens += row.usage.totalTokens;
}
