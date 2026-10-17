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
}

export interface CompletionResult {
  text: string;
  provider: Provider;
  model: string;
  usage: NormalizedUsage;
  /** True if the model actually invoked search grounding for this response. */
  usedSearchGrounding?: boolean;
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
