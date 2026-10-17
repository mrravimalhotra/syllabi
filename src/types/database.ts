export type TaskType =
  | "ocr_extraction"
  | "embedding"
  | "solution"
  | "notes"
  | "sample_paper"
  | "ad_hoc"
  | "coverage_check";

export type GenerationTaskType = "solution" | "notes" | "sample_paper" | "ad_hoc";

export type Provider = "google" | "anthropic" | "openai";

export interface School {
  id: string;
  name: string;
  created_at: string;
}

export interface Grade {
  id: string;
  school_id: string;
  name: string;
  created_at: string;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  created_at: string;
}

export interface Student {
  id: string;
  full_name: string | null;
  email: string;
  /** "student" = a regular (non-admin) adult account — a parent or tutor. */
  role: "student" | "admin";
  account_type: "parent" | "tutor" | null;
  adult_confirmed_at: string | null;
  school_id: string | null;
  grade_id: string | null;
  subject_ids: string[];
  active: boolean;
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
  school_id: string;
  grade_id: string;
  subject_id: string;
  source_type: "textbook" | "exercise" | "past_paper" | "notes";
  storage_path: string | null;
  status: "processing" | "ready" | "failed";
  uploaded_by: string | null;
  created_at: string;
}

export interface ChunkRow {
  id: string;
  document_id: string;
  school_id: string;
  grade_id: string;
  subject_id: string;
  source_type: string;
  page_number: number | null;
  section_label: string | null;
  content: string;
  embedding: number[] | null;
  /** Storage path of the scanned page this chunk was extracted from (diagrams/maps/figures live here, not in `content`). */
  image_path: string | null;
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

export interface TokenUsageRow {
  id: string;
  student_id: string;
  task_type: TaskType;
  provider: Provider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
}

export interface GeneratedDocumentRow {
  id: string;
  student_id: string;
  task_type: GenerationTaskType;
  title: string;
  storage_path: string;
  created_at: string;
}
