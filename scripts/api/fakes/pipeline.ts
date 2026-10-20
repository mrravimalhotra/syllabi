// A stand-in for the AI pipeline: it "writes" a fixed answer, streaming it in
// two pieces, and counts how many times it was asked.
export const pipeline = { calls: 0, fail: false };

export async function runGeneration(opts: { onText?: (delta: string) => void; prompt: string }) {
  pipeline.calls++;
  if (pipeline.fail) throw new Error("The AI is down");
  opts.onText?.("Plants make ");
  opts.onText?.("food.");
  return {
    text: "Plants make food.",
    sources: [],
    usedSearchGrounding: false,
    searchSuggestionsHtml: null,
    checks: [],
    confidence: { correct: 91, fromBook: 88, reasons: ["The answer follows the pages of your books, and the automatic checks found nothing wrong."] },
    timings: { totalMs: 1, searchMs: 0 },
  };
}
