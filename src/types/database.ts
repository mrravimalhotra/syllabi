import type { StudyPack } from "@/lib/study-pack/types";
import type { WorkedProblem } from "@/lib/worked/types";

/** One check Syllabi's own code made on an answer (no AI involved). */
export interface AnswerCheck {
  kind: "calculation" | "marks" | "coverage" | "options" | "answer-key";
  ok: boolean;
  /** Plain-language result, e.g. "Marks add up to 80" or "12 × 15 = 180". */
  message: string;
}

/** Every kind of AI job the app does; each can be given its own service and model in Admin. */
export const TASK_TYPES = ["ocr_extraction", "embedding", "solution", "notes", "sample_paper", "ad_hoc", "study_pack"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export type GenerationTaskType = "solution" | "notes" | "sample_paper" | "ad_hoc" | "study_pack";

/** The kinds of material a book page can be. */
export const SOURCE_TYPES = ["textbook", "exercise", "past_paper", "notes"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** The AI services Syllabi can use. A new one is also added to the database check in a migration (see 19_nvidia_provider). */
export const PROVIDERS = ["google", "anthropic", "openai", "groq", "openrouter", "mistral", "nvidia"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface Student {
  id: string;
  full_name: string | null;
  email: string;
  /** "student" = a regular (non-admin) adult account — a parent or tutor. */
  role: "student" | "admin";
  account_type: "parent" | "tutor" | null;
  /** The child's class and school board, from the Account page (used in prompts). */
  class_level: string | null;
  board: string | null;
  /** Default answer language (en, hi, mr, fr); null follows the book and question. */
  answer_language: "en" | "hi" | "mr" | "fr" | null;
  adult_confirmed_at: string | null;
  active: boolean;
  /** Guest accounts only: when the login stops working. null for everyone else. */
  guest_until: string | null;
  token_quota: number;
  created_at: string;
  updated_at: string;
}

export interface LlmSetting {
  task_type: TaskType;
  provider: Provider;
  model: string;
  updated_at: string;
  updated_by: string | null;
}

export interface DocumentRow {
  id: string;
  title: string;
  /** The account that uploaded this book; only they can search it. */
  owner_id: string | null;
  /** Free-text labels the owner gives the book, e.g. "Science" and "Class 8". */
  subject: string | null;
  grade: string | null;
  rights_confirmed_at: string | null;
  source_type: SourceType;
  status: "processing" | "ready" | "failed";
  created_at: string;
}

export interface MatchedChunk {
  id: string;
  document_id: string;
  content: string;
  section_label: string | null;
  page_number: number | null;
  source_type: string;
  image_path: string | null;
  similarity: number;
}

/** A source passage an answer used, as saved with the answer. */
export interface SavedSource {
  id: string;
  document_id: string;
  section_label: string | null;
  page_number: number | null;
  source_type: string;
  image_path: string | null;
  similarity: number;
}

export interface GeneratedDocumentRow {
  id: string;
  student_id: string;
  task_type: GenerationTaskType;
  title: string;
  /** Older answers were stored as PDFs; newer ones keep their text and make the PDF on demand. */
  storage_path: string | null;
  content: string | null;
  sources: SavedSource[];
  used_search_grounding: boolean;
  search_suggestions_html: string | null;
  /** Study packs only: the structured pack (content holds its Markdown, for PDF and copy). */
  pack: StudyPack | null;
  /** Fingerprint for reusing this answer when the same question comes again. */
  cache_key: string | null;
  /** What Syllabi's own code checked about this answer. */
  checks: AnswerCheck[];
  /** Worked examples only: the problem; its steps are recomputed when opened. */
  worked: WorkedProblem | null;
  created_at: string;
}
