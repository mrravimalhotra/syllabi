import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import type { CompletionRequest, CompletionResult, EmbeddingResult, LlmProviderAdapter } from "@/lib/llm/types";
import { assertHeaderSafe } from "@/lib/llm/assert-header-safe";
import { withNetworkRetry } from "@/lib/llm/retry";

function client() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");
  assertHeaderSafe("GOOGLE_API_KEY", apiKey);
  return new GoogleGenerativeAI(apiKey);
}

export const googleAdapter: LlmProviderAdapter = {
  async generateCompletion(req: CompletionRequest & { model: string }): Promise<CompletionResult> {
    const genAI = client();

    const tools = req.allowSearchGrounding ? [{ googleSearch: {} }] : undefined;

    const model = genAI.getGenerativeModel({
      model: req.model,
      systemInstruction: req.systemInstructions,
      tools: tools as never,
    });

    const parts: Part[] = [];
    if (req.context) parts.push({ text: `Reference material (RAG context):\n${req.context}` });
    parts.push({ text: req.prompt });
    for (const img of req.images ?? []) {
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }

    const result = await withNetworkRetry(() =>
      model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: req.temperature ?? 0.4 },
      })
    );

    const response = result.response;
    const usage = response.usageMetadata;
    const groundingUsed = Boolean(
      response.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length
    );

    return {
      text: response.text(),
      provider: "google",
      model: req.model,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      usedSearchGrounding: groundingUsed,
    };
  },

  async embed(text: string, model: string): Promise<EmbeddingResult> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");

    // Called directly against the REST API rather than through the SDK: the
    // installed @google/generative-ai SDK's embedContent() type doesn't expose
    // outputDimensionality, but gemini-embedding-001 defaults to 3072 dimensions
    // otherwise — this pins it to 768, matching chunks.embedding's vector(768).
    const response = await withNetworkRetry(() =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        }),
      })
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini embedContent failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as { embedding: { values: number[] } };

    // The embeddings API doesn't return token usage; approximate for quota purposes.
    const approxTokens = Math.ceil(text.length / 4);

    return {
      embedding: data.embedding.values,
      provider: "google",
      model,
      usage: { inputTokens: approxTokens, outputTokens: 0, totalTokens: approxTokens },
    };
  },
};

// Gemini's batch endpoint takes at most 100 texts per request.
const EMBED_BATCH_SIZE = 100;

/**
 * Embeds many texts with as few requests as possible (one per 100 texts), in
 * input order. Used to index a page's chunks and to search for each question
 * of a multi-question worksheet separately.
 */
export async function googleEmbedMany(texts: string[], model: string): Promise<EmbeddingResult[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");

  const results: EmbeddingResult[] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    const response = await withNetworkRetry(() =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            outputDimensionality: 768,
          })),
        }),
      })
    );
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini batchEmbedContents failed (${response.status}): ${errorBody}`);
    }
    const data = (await response.json()) as { embeddings: { values: number[] }[] };
    if (data.embeddings?.length !== batch.length) {
      throw new Error(`Gemini batchEmbedContents returned ${data.embeddings?.length ?? 0} embeddings for ${batch.length} texts`);
    }
    data.embeddings.forEach((e, i) => {
      // The embeddings API doesn't return token usage; approximate for quota purposes.
      const approxTokens = Math.ceil(batch[i].length / 4);
      results.push({
        embedding: e.values,
        provider: "google",
        model,
        usage: { inputTokens: approxTokens, outputTokens: 0, totalTokens: approxTokens },
      });
    });
  }
  return results;
}
