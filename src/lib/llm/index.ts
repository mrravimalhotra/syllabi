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
  // NVIDIA's free catalogue: a strong open model; reads text only.
  { provider: "nvidia", model: () => process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct", readsImages: false },
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

export type { CompletionRequest, CompletionResult, CompletionImage, NormalizedUsage } from "@/lib/llm/types";
