import { getLlmSetting } from "@/lib/llm/config";
import { googleAdapter, googleEmbedMany } from "@/lib/llm/providers/google";
import { anthropicAdapter } from "@/lib/llm/providers/anthropic";
import { hasKey, openAiCompatibleAdapter, type OpenAiCompatible } from "@/lib/llm/providers/openai";
import { BlockedReplyError, DAILY_LIMIT } from "@/lib/errors";
import type { CompletionRequest, CompletionResult, EmbeddingResult, LlmProviderAdapter } from "@/lib/llm/types";
import type { Provider } from "@/types/database";

const ADAPTERS: Record<Provider, LlmProviderAdapter> = {
  google: googleAdapter,
  anthropic: anthropicAdapter,
  openai: openAiCompatibleAdapter("openai"),
  groq: openAiCompatibleAdapter("groq"),
  openrouter: openAiCompatibleAdapter("openrouter"),
  mistral: openAiCompatibleAdapter("mistral"),
  nvidia: openAiCompatibleAdapter("nvidia"),
};

/**
 * Free services that stand in, in this order, when the configured provider
 * can't answer (out of its free allowance, overloaded, or declining the
 * request). Each is used only when its key is set in Vercel; the model can be
 * changed with GROQ_MODEL, NVIDIA_MODEL, OPENROUTER_MODEL or MISTRAL_MODEL.
 */
export const BACKUPS: { provider: OpenAiCompatible; model: () => string; readsImages: boolean }[] = [
  { provider: "groq", model: () => process.env.GROQ_MODEL || "openai/gpt-oss-120b", readsImages: false },
  // NVIDIA's free catalogue: Nemotron 3.5 Super VL reads pictures too, and was the fastest free backup tested
  // (13 Nov 2026: a photo of a sum read and checked in 2 s). Llama 3.3 70B, the earlier default, was retired in Aug 2026.
  { provider: "nvidia", model: () => process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b", readsImages: true },
  // OpenRouter's free router picks a free model that can handle the request (images included).
  { provider: "openrouter", model: () => process.env.OPENROUTER_MODEL || "openrouter/free", readsImages: true },
  { provider: "mistral", model: () => process.env.MISTRAL_MODEL || "mistral-small-latest", readsImages: true },
];

const CANT_ANSWER_NOW = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|overloaded|UNAVAILABLE|fetch failed|ECONNRESET|ETIMEDOUT/i;

function worthABackup(err: unknown): boolean {
  if (err instanceof BlockedReplyError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return DAILY_LIMIT.test(message) || CANT_ANSWER_NOW.test(message);
}

/**
 * The single entry point the rest of the app calls for any LLM generation.
 * Routes to whichever provider + model is configured (DB-driven, admin-editable)
 * for the given task type, and always returns the same normalized shape —
 * so quota tracking and downstream code never need to know which vendor served it.
 */
export async function generateCompletion(req: CompletionRequest): Promise<CompletionResult> {
  const { provider, model } = await getLlmSetting(req.taskType);
  const adapter = ADAPTERS[provider];
  try {
    return await adapter.generateCompletion({ ...req, model: req.model ?? model });
  } catch (err) {
    // Structured (JSON) replies are only asked of Gemini; other services may not keep to the format.
    if (!worthABackup(err) || req.jsonSchema) throw err;
    for (const backup of BACKUPS) {
      if (backup.provider === provider || !hasKey(backup.provider) || (req.images?.length && !backup.readsImages)) continue;
      try {
        req.onRestart?.();
        const result = await ADAPTERS[backup.provider].generateCompletion({ ...req, model: backup.model(), onText: undefined });
        console.warn(`[llm] ${provider} couldn't answer ${req.taskType}; ${backup.provider} (${result.model}) did`);
        return result;
      } catch (backupErr) {
        console.error(`[llm] backup ${backup.provider} failed too`, backupErr);
      }
    }
    throw err;
  }
}

// A free first try that fails with a rate limit is not tried again for a while (free models allow about 50
// requests a day without credit, and are often busy).
const FREE_FIRST_REST_MS = { busy: 60_000, dailyLimit: 60 * 60_000 };
let freeFirstRestingUntil = 0;

/**
 * A small, simple job (search words for a question) tried first with OpenRouter's free models, which cost
 * nothing; the configured model answers as usual when the free one is not set up, busy, slow, says nothing, or
 * gives a reply `usable` rejects. Never for marking, maths or anything with pictures: those stay on the main model.
 */
export async function generateFreeFirst(req: CompletionRequest, usable: (text: string) => boolean, timeoutMs = 8000): Promise<CompletionResult> {
  if (hasKey("openrouter") && !req.images?.length && Date.now() >= freeFirstRestingUntil) {
    const model = process.env.OPENROUTER_FREE_FIRST_MODEL || process.env.OPENROUTER_MODEL || "openrouter/free";
    try {
      const result = await ADAPTERS.openrouter.generateCompletion({ ...req, model, timeoutMs, onText: undefined });
      if (usable(result.text)) return result;
      console.warn(`[llm] free first try (${result.model}) gave an unusable reply for ${req.taskType}; using the main model`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/\b429\b/.test(message)) freeFirstRestingUntil = Date.now() + (/per[- ]day|daily/i.test(message) ? FREE_FIRST_REST_MS.dailyLimit : FREE_FIRST_REST_MS.busy);
      console.warn(`[llm] free first try failed for ${req.taskType}; using the main model:`, message.slice(0, 160));
    }
  }
  return generateCompletion(req);
}

/**
 * Embeddings always go through Google regardless of the completion provider
 * configured for other task types, since Anthropic has no embeddings API and
 * the pgvector column is fixed at the embedding model's dimensionality.
 */
export async function embed(text: string): Promise<EmbeddingResult> {
  const { model } = await getLlmSetting("embedding");
  return googleAdapter.embed(text, model);
}

/** Embeds many texts in as few requests as possible; results are in input order. */
export async function embedMany(texts: string[]): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return [];
  const { model } = await getLlmSetting("embedding");
  return googleEmbedMany(texts, model);
}

export type { CompletionRequest, CompletionResult } from "@/lib/llm/types";
