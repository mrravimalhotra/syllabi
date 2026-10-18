import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import type { CompletionRequest, CompletionResult, EmbeddingResult, LlmProviderAdapter } from "@/lib/llm/types";
import { assertHeaderSafe } from "@/lib/llm/assert-header-safe";
import { withNetworkRetry, fetchOrThrowTransient } from "@/lib/llm/retry";
import { BlockedReplyError, DAILY_LIMIT } from "@/lib/errors";

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

// Google's free tier gives each model its own allowance, so when one model is
// out of requests for the day, or stays overloaded after retries, the other
// Flash model can still answer.
const FLASH = "gemini-flash-latest";
const FLASH_LITE = "gemini-flash-lite-latest";
const OUT_OF_CAPACITY = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|overloaded|UNAVAILABLE/i;

/** The other free model to try, if this one can't serve the request. */
export function standInFor(model: string): string | null {
  if (model === FLASH_LITE) return FLASH;
  return model.startsWith("gemini-") ? FLASH_LITE : null;
}

// A model that just said "busy" or "daily limit used up" is skipped for a
// while, so people aren't made to wait for it again on every question. Kept
// per server instance; it only ever moves a request to the stand-in sooner.
const BUSY_PAUSE_MS = 60_000;
const DAILY_LIMIT_PAUSE_MS = 30 * 60_000;
const pausedUntil = new Map<string, number>();

function pauseModel(model: string, message: string) {
  pausedUntil.set(model, Date.now() + (DAILY_LIMIT.test(message) ? DAILY_LIMIT_PAUSE_MS : BUSY_PAUSE_MS));
}

const isPaused = (model: string) => (pausedUntil.get(model) ?? 0) > Date.now();

type GeminiModel = ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
type Grounding = { webSearchQueries?: string[]; searchEntryPoint?: { renderedContent?: string } };

/** The message parts: reference material first, then the question, then any pictures. */
function requestParts(req: CompletionRequest): Part[] {
  const parts: Part[] = [];
  if (req.context) parts.push({ text: `Reference material (RAG context):\n${req.context}` });
  parts.push({ text: req.prompt });
  for (const img of req.images ?? []) parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
  return parts;
}

function requestBody(req: CompletionRequest) {
  return {
    contents: [{ role: "user" as const, parts: requestParts(req) }],
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      ...(req.jsonSchema ? { responseMimeType: "application/json", responseSchema: req.jsonSchema as never } : {}),
    },
  };
}

type Body = ReturnType<typeof requestBody>;

/**
 * One call to a model. With `req.onText` set, the answer is streamed: each
 * piece is passed on as it arrives, and the complete response is returned at
 * the end as usual. A second try after pieces were shown first says so
 * (`onRestart`), so the screen can start the draft over.
 */
function caller(req: CompletionRequest, body: Body) {
  let emitted = false;
  return async (model: GeminiModel) => {
    if (!req.onText) return model.generateContent(body);
    if (emitted) {
      req.onRestart?.();
      emitted = false;
    }
    const streamed = await model.generateContentStream(body);
    for await (const chunk of streamed.stream) {
      let piece = "";
      try {
        piece = chunk.text();
      } catch {
        // A blocked or empty piece has no text; the final response explains why.
      }
      if (piece) {
        emitted = true;
        req.onText(piece);
      }
    }
    return { response: await streamed.response };
  };
}

/** Busy or out of allowance, as opposed to a dropped connection or a bad request. */
const isCapacityProblem = (message: string) => DAILY_LIMIT.test(message) || OUT_OF_CAPACITY.test(message);

/** The call without search. A patient call waits and retries; otherwise a busy or limited reply fails at once so the caller can switch models. */
async function generatePlain(call: () => Promise<GenerateResult>, patient: boolean): Promise<GenerateResult> {
  if (patient) return withNetworkRetry(call);
  try {
    return await call();
  } catch (err) {
    // Anything but busy (a dropped connection) is retried as usual.
    if (isCapacityProblem(err instanceof Error ? err.message : String(err))) throw err;
    return withNetworkRetry(call);
  }
}

type GenerateResult = Awaited<ReturnType<ReturnType<typeof caller>>>;

/** The answer's text; a blocked prompt or answer has none, so say plainly what happened instead of a technical error. */
function textOf(response: GenerateResult["response"]): string {
  try {
    return response.text();
  } catch (err) {
    const candidate = response.candidates?.[0];
    const reason = String(candidate?.finishReason ?? response.promptFeedback?.blockReason ?? "EMPTY");
    console.error("[google] no text in response", reason, response.promptFeedback, err);
    const partial = (candidate?.content?.parts ?? []).map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("");
    throw new BlockedReplyError(
      reason === "RECITATION"
        ? "The AI declined to copy this text word for word (it looks like published text)."
        : "The AI didn't answer this one (its safety filter or an empty reply). Try rephrasing the question or attaching a clearer photo.",
      reason,
      partial
    );
  }
}

/** What a finished call gives back: the text, the tokens used, and whether search was used or skipped. */
function toResult(model: string, response: GenerateResult["response"], searchSkipped: boolean): CompletionResult {
  const usage = response.usageMetadata;
  const candidate = response.candidates?.[0];
  const grounding = candidate?.groundingMetadata as Grounding | undefined;
  const groundingUsed = Boolean(grounding?.webSearchQueries?.length);
  let text = textOf(response);
  const truncated = String(candidate?.finishReason) === "MAX_TOKENS";
  if (truncated) text += "\n\n---\n*This answer reached the length limit and stops here. Ask for the remaining questions separately.*";
  return {
    text,
    truncated,
    searchSuggestionsHtml: groundingUsed ? grounding?.searchEntryPoint?.renderedContent : undefined,
    provider: "google",
    model,
    usage: {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    },
    usedSearchGrounding: groundingUsed,
    searchSkipped,
  };
}

/** One Gemini call with the given model (search first when allowed, then without). With `patient` false, a busy or rate-limited reply fails at once instead of waiting and retrying. */
async function completeWith(req: CompletionRequest & { model: string }, patient = true): Promise<CompletionResult> {
  const genAI = client();
  const modelWith = (search: boolean) =>
    genAI.getGenerativeModel({
      model: req.model,
      systemInstruction: req.systemInstructions,
      tools: (search ? [{ googleSearch: {} }] : undefined) as never,
    });
  const generate = caller(req, requestBody(req));

  // Google Search is a bonus, not a requirement: a key without search quota
  // (the free tier often has none) gets "429 quota exceeded" for searched
  // calls only. Then answer without search rather than fail the request.
  let searchSkipped = false;
  let result: GenerateResult | undefined;
  if (req.allowSearchGrounding) {
    try {
      result = await generate(modelWith(true));
    } catch (err) {
      console.warn("[google] search-grounded call failed; answering without search:", err instanceof Error ? err.message : err);
      searchSkipped = true;
    }
  }
  result ??= await generatePlain(() => generate(modelWith(false)), patient);

  return toResult(req.model, result.response, searchSkipped);
}

export const googleAdapter: LlmProviderAdapter = {
  async generateCompletion(req: CompletionRequest & { model: string }): Promise<CompletionResult> {
    const other = standInFor(req.model);
    // Skip a model that was busy a moment ago and go straight to its stand-in.
    if (other && isPaused(req.model) && !isPaused(other)) {
      try {
        return { ...(await completeWith({ ...req, model: other })), standInFor: req.model };
      } catch (err) {
        console.warn(
          "[google] stand-in failed while the main model is paused; trying the main model",
          err instanceof Error ? err.message : err
        );
        req.onRestart?.();
        return completeWith(req);
      }
    }
    try {
      // With a stand-in available, don't wait out a busy reply: switch at once.
      return await completeWith(req, !other);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!other || err instanceof BlockedReplyError || !isCapacityProblem(message)) throw err;
      pauseModel(req.model, message);
      req.onRestart?.();
      console.warn(
        `[google] ${req.model} can't answer now (${DAILY_LIMIT.test(message) ? "daily allowance used up" : "busy"}); using ${other}`
      );
      try {
        return { ...(await completeWith({ ...req, model: other })), standInFor: req.model };
      } catch (second) {
        // Report the first model's problem: it names the setting the admin chose.
        console.error("[google] stand-in model failed too", second);
        throw err;
      }
    }
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
