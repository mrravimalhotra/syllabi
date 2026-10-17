import { getLlmSetting } from "@/lib/llm/config";
import { googleAdapter, googleEmbedMany } from "@/lib/llm/providers/google";
import { anthropicAdapter } from "@/lib/llm/providers/anthropic";
import { openaiAdapter } from "@/lib/llm/providers/openai";
import type { CompletionRequest, CompletionResult, EmbeddingResult, LlmProviderAdapter } from "@/lib/llm/types";
import type { Provider } from "@/types/database";

const ADAPTERS: Record<Provider, LlmProviderAdapter> = {
  google: googleAdapter,
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
};

/**
 * The single entry point the rest of the app calls for any LLM generation.
 * Routes to whichever provider + model is configured (DB-driven, admin-editable)
 * for the given task type, and always returns the same normalized shape —
 * so quota tracking and downstream code never need to know which vendor served it.
 */
export async function generateCompletion(req: CompletionRequest): Promise<CompletionResult> {
  const { provider, model } = await getLlmSetting(req.taskType);
  const adapter = ADAPTERS[provider];
  return adapter.generateCompletion({ ...req, model: req.model ?? model });
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
