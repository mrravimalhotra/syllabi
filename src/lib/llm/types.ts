import type { Provider, TaskType } from "@/types/database";

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CompletionImage {
  /** Base64-encoded image bytes (no data: prefix). */
  data: string;
  mimeType: string;
  /** The image's text when already known (a digital PDF page), so it needn't be transcribed. */
  text?: string;
}

export interface CompletionRequest {
  taskType: TaskType;
  /** System-level instructions (RAG-first policy, output format, etc.) */
  systemInstructions: string;
  /** The user-facing prompt / question. */
  prompt: string;
  /** Retrieved RAG context, already formatted as text. */
  context?: string;
  images?: CompletionImage[];
  /** Only honored by providers/models that support built-in search grounding. */
  allowSearchGrounding?: boolean;
  /** Overrides the admin-configured model for this call, when set. */
  model?: string;
  temperature?: number;
  /** Longest answer allowed, in tokens. */
  maxOutputTokens?: number;
  /**
   * Ask for JSON matching this schema (OpenAPI subset, as Gemini takes it).
   * Providers without structured output get the instruction in the prompt only,
   * so callers must still parse defensively.
   */
  jsonSchema?: Record<string, unknown>;
  /**
   * Called with each piece of the answer as it is written, so a screen can show
   * it growing. Only providers that can stream use it; the final result is
   * always complete, so ignoring this is safe.
   */
  onText?: (delta: string) => void;
  /** Called when text already sent through onText is discarded (a stand-in service starts the answer again). */
  onRestart?: () => void;
}

export interface CompletionResult {
  text: string;
  provider: Provider;
  model: string;
  usage: NormalizedUsage;
  /** True if the model actually invoked search grounding for this response. */
  usedSearchGrounding?: boolean;
  /** True if a search was allowed but failed (e.g. no search quota on the key), so the answer was made without it. */
  searchSkipped?: boolean;
  /** Google's rendered Search Suggestions (HTML) for a grounded answer; its terms require showing them. */
  searchSuggestionsHtml?: string;
  /** True when the answer stopped at the output length limit. */
  truncated?: boolean;
}

export interface EmbeddingResult {
  embedding: number[];
  provider: Provider;
  model: string;
  usage: NormalizedUsage;
}

/** One provider adapter — normalizes a vendor SDK into Syllabi's shape. */
export interface LlmProviderAdapter {
  generateCompletion(req: CompletionRequest & { model: string }): Promise<CompletionResult>;
  embed(text: string, model: string): Promise<EmbeddingResult>;
}
