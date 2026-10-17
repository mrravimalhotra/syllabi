import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import type { CompletionRequest, CompletionResult, EmbeddingResult, LlmProviderAdapter } from "@/lib/llm/types";
import { assertHeaderSafe } from "@/lib/llm/assert-header-safe";
import { withNetworkRetry, fetchOrThrowTransient } from "@/lib/llm/retry";
import { UserError } from "@/lib/errors";

// Long worksheets and 80-mark papers with answer keys need room; Flash models
// allow far more than this.
const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;

/** The Gemini API key, checked to be usable in an HTTP header. */
function googleApiKey(): string {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");
  assertHeaderSafe("GOOGLE_API_KEY", apiKey);
  return apiKey;
}

function client() {
  return new GoogleGenerativeAI(googleApiKey());
}

export const googleAdapter: LlmProviderAdapter = {
  async generateCompletion(req: CompletionRequest & { model: string }): Promise<CompletionResult> {
    const genAI = client();

    const modelWith = (search: boolean) =>
      genAI.getGenerativeModel({
        model: req.model,
        systemInstruction: req.systemInstructions,
        tools: (search ? [{ googleSearch: {} }] : undefined) as never,
      });

    const parts: Part[] = [];
    if (req.context) parts.push({ text: `Reference material (RAG context):\n${req.context}` });
    parts.push({ text: req.prompt });
    for (const img of req.images ?? []) {
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }

    const request = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      },
    };

    // Google Search is a bonus, not a requirement: a key without search quota
    // (the free tier often has none) gets "429 quota exceeded" for searched
    // calls only. Then answer without search rather than fail the request.
    let searchSkipped = false;
    let result;
    if (req.allowSearchGrounding) {
      try {
        result = await modelWith(true).generateContent(request);
      } catch (err) {
        console.warn("[google] search-grounded call failed; answering without search:", err instanceof Error ? err.message : err);
        searchSkipped = true;
      }
    }
    result ??= await withNetworkRetry(() => modelWith(false).generateContent(request));

    const response = result.response;
    const usage = response.usageMetadata;
    const candidate = response.candidates?.[0];
    const grounding = candidate?.groundingMetadata as
      | { webSearchQueries?: string[]; searchEntryPoint?: { renderedContent?: string } }
      | undefined;
    const groundingUsed = Boolean(grounding?.webSearchQueries?.length);

    // A blocked prompt or answer has no text; response.text() would throw a
    // technical error, so say plainly what happened instead.
    let text: string;
    try {
      text = response.text();
    } catch (err) {
      console.error("[google] no text in response", candidate?.finishReason, response.promptFeedback, err);
      throw new UserError(
        "The AI didn't answer this one (its safety filter or an empty reply). Try rephrasing the question or attaching a clearer photo."
      );
    }
    const truncated = String(candidate?.finishReason) === "MAX_TOKENS";
    if (truncated) {
      text += "\n\n---\n*This answer reached the length limit and stops here. Ask for the remaining questions separately.*";
    }

    return {
      text,
      truncated,
      searchSuggestionsHtml: groundingUsed ? grounding?.searchEntryPoint?.renderedContent : undefined,
      provider: "google",
      model: req.model,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      usedSearchGrounding: groundingUsed,
      searchSkipped,
    };
  },

  async embed(text: string, model: string): Promise<EmbeddingResult> {
    const apiKey = googleApiKey();

    // Called directly against the REST API rather than through the SDK: the
    // installed @google/generative-ai SDK's embedContent() type doesn't expose
    // outputDimensionality, but gemini-embedding-001 defaults to 3072 dimensions
    // otherwise — this pins it to 768, matching chunks.embedding's vector(768).
    const response = await withNetworkRetry(() =>
      fetchOrThrowTransient(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
  const apiKey = googleApiKey();

  const results: EmbeddingResult[] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    const response = await withNetworkRetry(() =>
      fetchOrThrowTransient(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
