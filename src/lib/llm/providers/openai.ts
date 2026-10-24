import OpenAI from "openai";
import type { CompletionRequest, CompletionResult, EmbeddingResult, LlmProviderAdapter } from "@/lib/llm/types";
import type { Provider } from "@/types/database";
import { assertHeaderSafe } from "@/lib/llm/assert-header-safe";

/** Services that speak OpenAI's chat API: where they are and which key they use. */
export const OPENAI_COMPATIBLE = {
  openai: { baseURL: undefined, keyName: "OPENAI_API_KEY" },
  groq: { baseURL: "https://api.groq.com/openai/v1", keyName: "GROQ_API_KEY" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", keyName: "OPENROUTER_API_KEY" },
  mistral: { baseURL: "https://api.mistral.ai/v1", keyName: "MISTRAL_API_KEY" },
  nvidia: { baseURL: "https://integrate.api.nvidia.com/v1", keyName: "NVIDIA_API_KEY" },
} as const;

export type OpenAiCompatible = keyof typeof OPENAI_COMPATIBLE;

/** True when this service's key is set (in Vercel's environment variables). */
export function hasKey(provider: OpenAiCompatible): boolean {
  return Boolean(process.env[OPENAI_COMPATIBLE[provider].keyName]);
}

function client(provider: OpenAiCompatible) {
  const { baseURL, keyName } = OPENAI_COMPATIBLE[provider];
  const apiKey = process.env[keyName];
  if (!apiKey) throw new Error(`${keyName} is not configured`);
  assertHeaderSafe(keyName, apiKey);
  return new OpenAI({
    apiKey,
    baseURL,
    // A hung call must end well inside the 300 s function limit.
    timeout: 90_000,
    // OpenRouter asks apps to name themselves; harmless elsewhere.
    defaultHeaders: provider === "openrouter" ? { "X-Title": "Syllabi" } : undefined,
  });
}

/** The user's message: the question (with any reference material before it) and any pictures. */
function userContent(req: CompletionRequest): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const text = req.context ? `Reference material (RAG context):\n${req.context}\n\n${req.prompt}` : req.prompt;
  return [
    { type: "text", text },
    ...(req.images ?? []).map((img) => ({ type: "image_url" as const, image_url: { url: `data:${img.mimeType};base64,${img.data}` } })),
  ];
}

/** An adapter for one OpenAI-compatible service. */
export function openAiCompatibleAdapter(provider: OpenAiCompatible): LlmProviderAdapter {
  return {
    async generateCompletion(req: CompletionRequest & { model: string }): Promise<CompletionResult> {
      const openai = client(provider);

      const completion = await openai.chat.completions.create({
        model: req.model,
        temperature: req.temperature ?? 0.4,
        messages: [
          { role: "system", content: req.systemInstructions },
          { role: "user", content: userContent(req) },
        ],
      });

      const usage = completion.usage;

      return {
        text: completion.choices[0]?.message?.content ?? "",
        truncated: completion.choices[0]?.finish_reason === "length",
        provider: provider as Provider,
        // OpenRouter's free router says which model actually answered.
        model: completion.model || req.model,
        usage: {
          inputTokens: usage?.prompt_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0,
        },
        usedSearchGrounding: false,
      };
    },

    async embed(text: string, model: string): Promise<EmbeddingResult> {
      const openai = client(provider);
      const result = await openai.embeddings.create({ model, input: text });

      return {
        embedding: result.data[0].embedding,
        provider: provider as Provider,
        model,
        usage: {
          inputTokens: result.usage.prompt_tokens,
          outputTokens: 0,
          totalTokens: result.usage.total_tokens,
        },
      };
    },
  };
}
