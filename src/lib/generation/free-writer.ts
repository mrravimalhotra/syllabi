// The free writer (owner, 14 Nov: "use free writer", after NVIDIA's Nemotron scored 100 on all 12 quality questions,
// the same as Gemini). For a question with no photos attached, the first draft is written by NVIDIA's free model;
// the answer is then checked by Gemini (Flash-Lite, never by the model that wrote it), and any problem the check or
// the code checks find is fixed by Gemini Flash, as before. When the free model is not set up, fails, is busy or
// says nothing, Gemini writes the draft. Photos (paper checks, photographed worksheets) always go to Gemini.

import { hasKey, openAiCompatibleAdapter } from "@/lib/llm/providers/openai";
import type { CompletionRequest, CompletionResult } from "@/lib/llm/types";
import type { CompletionImage } from "@/lib/llm/types";
import type { GenerationTaskType } from "@/types/database";

const TASKS = new Set<GenerationTaskType>(["solution", "notes", "ad_hoc", "sample_paper"]);
const MODEL = () => process.env.FREE_WRITER_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b";
const TIMEOUT_MS = 120_000;
// After a refusal (a rate limit, the service down), the free writer rests a while so answers aren't kept waiting.
const REST_MS = 5 * 60_000;
let restingUntil = 0;

/** Whether this answer's first draft may be written by the free model. */
export function freeWriterFor(taskType: GenerationTaskType, photos: CompletionImage[]): boolean {
  return process.env.FREE_WRITER !== "off" && hasKey("nvidia") && TASKS.has(taskType) && photos.length === 0 && Date.now() >= restingUntil;
}

/** The free model's draft, or null when Gemini should write it instead. */
export async function writeFree(request: CompletionRequest): Promise<CompletionResult | null> {
  try {
    return await openAiCompatibleAdapter("nvidia").generateCompletion({ ...request, model: MODEL(), onText: undefined, timeoutMs: TIMEOUT_MS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/\b(429|5\d\d)\b|timed? ?out|ETIMEDOUT|ECONNRESET/i.test(message)) restingUntil = Date.now() + REST_MS;
    console.warn("[free writer] Gemini writes this answer instead:", message.slice(0, 200));
    return null;
  }
}

/** A draft the free model wrote (checked by Gemini, never trusted unchecked). */
export const writtenFree = (result: CompletionResult) => result.provider === "nvidia";
