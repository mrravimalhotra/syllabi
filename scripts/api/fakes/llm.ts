// A stand-in for the AI layer: replies are chosen by the test, and every call is counted.
export const llm: { calls: number; reply: (req: { systemInstructions: string; taskType: string }) => { text: string; truncated?: boolean } } = {
  calls: 0,
  reply: () => ({ text: "{}" }),
};

export const BACKUPS: never[] = [];

export async function generateCompletion(req: { systemInstructions: string; taskType: string }) {
  llm.calls++;
  const { text, truncated } = llm.reply(req);
  return { text, truncated: truncated ?? false, provider: "google", model: "test", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, usedSearchGrounding: false };
}

export async function embed() {
  return { embedding: [], provider: "google", model: "test", usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 } };
}
export async function embedMany(texts: string[]) {
  return texts.map(() => ({ embedding: [], provider: "google", model: "test", usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 } }));
}
