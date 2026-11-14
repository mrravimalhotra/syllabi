// For comparing answer writers: with QUALITY_WRITER set (an NVIDIA model, e.g. nvidia/nemotron-3.5-super-vl-120b-a12b),
// the answer is written by that free model; everything else is unchanged: the checker, a fix asked of Gemini, and
// the grading. The rest of the AI layer is the app's own.
import { generateCompletion as appCompletion } from "../../src/lib/llm/index";
import { openAiCompatibleAdapter } from "../../src/lib/llm/providers/openai";
import type { CompletionRequest, CompletionResult } from "../../src/lib/llm/types";

export { embed, embedMany, generateFreeFirst, BACKUPS } from "../../src/lib/llm/index";
export type { CompletionRequest, CompletionResult } from "../../src/lib/llm/types";

const FIX = "Your draft answer below has these problems";

/** The first draft of an answer (no JSON shape, not a fix): what a free writer would take over. */
const isFirstDraft = (req: CompletionRequest) => !req.jsonSchema && !req.prompt.includes(FIX);

export async function generateCompletion(req: CompletionRequest): Promise<CompletionResult> {
  const writer = process.env.QUALITY_WRITER;
  if (writer && isFirstDraft(req)) return openAiCompatibleAdapter("nvidia").generateCompletion({ ...req, model: writer, onText: undefined, timeoutMs: 180_000 });
  return appCompletion(req);
}
