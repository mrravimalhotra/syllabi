import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, EmbeddingResult, LlmProviderAdapter } from "@/lib/llm/types";
import { assertHeaderSafe } from "@/lib/llm/assert-header-safe";

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  assertHeaderSafe("ANTHROPIC_API_KEY", apiKey);
  // A hung call must end well inside the 300 s function limit.
  return new Anthropic({ apiKey, timeout: 90_000 });
}

export const anthropicAdapter: LlmProviderAdapter = {
  async generateCompletion(req: CompletionRequest & { model: string }): Promise<CompletionResult> {
    const anthropic = client();

    const userText = req.context
      ? `Reference material (RAG context):\n${req.context}\n\n${req.prompt}`
      : req.prompt;

    const content: Anthropic.MessageParam["content"] = [{ type: "text", text: userText }];
    for (const img of req.images ?? []) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType as "image/png" | "image/jpeg", data: img.data },
      });
    }

    const message = await anthropic.messages.create({
      model: req.model,
      max_tokens: 4096,
      temperature: req.temperature ?? 0.4,
      system: req.systemInstructions,
      messages: [{ role: "user", content }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return {
      text,
      provider: "anthropic",
      model: req.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      },
      usedSearchGrounding: false,
    };
  },

  async embed(): Promise<EmbeddingResult> {
    // Anthropic has no first-party embeddings API; embeddings always route through
    // the Google adapter (see lib/llm/index.ts) regardless of the completion provider.
    throw new Error("Anthropic does not provide an embeddings API");
  },
};
