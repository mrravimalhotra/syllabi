import { createAdminClient } from "@/lib/supabase/admin";
import type { LlmSetting, Provider, TaskType } from "@/types/database";

// Google's "-latest" aliases track whichever current model they point to, so
// this doesn't go stale the way a dated model name does. Everything defaults
// to Flash tier: Pro-tier models require a billing-enabled Google Cloud
// project (zero free-tier quota), so Pro is opt-in per task type via
// /admin/llm-settings once billing is enabled, not the out-of-the-box default.
const FALLBACK: Record<TaskType, { provider: Provider; model: string }> = {
  ocr_extraction: { provider: "google", model: "gemini-flash-lite-latest" },
  embedding: { provider: "google", model: "gemini-embedding-001" },
  solution: { provider: "google", model: "gemini-flash-latest" },
  notes: { provider: "google", model: "gemini-flash-latest" },
  sample_paper: { provider: "google", model: "gemini-flash-latest" },
  ad_hoc: { provider: "google", model: "gemini-flash-latest" },
  study_pack: { provider: "google", model: "gemini-flash-latest" },
  paper_check: { provider: "google", model: "gemini-flash-latest" },
};

let cache: { at: number; rows: Map<TaskType, LlmSetting> } | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Reads provider + model routing for a task type from the admin-editable
 * `llm_settings` table, so switching providers is a DB write, not a redeploy.
 * Cached briefly per server instance to avoid a DB round trip per LLM call.
 */
export async function getLlmSetting(taskType: TaskType): Promise<{ provider: Provider; model: string }> {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_TTL_MS) {
    const admin = createAdminClient();
    const { data } = await admin.from("llm_settings").select("*");
    const rows = new Map<TaskType, LlmSetting>((data ?? []).map((r) => [r.task_type as TaskType, r as LlmSetting]));
    cache = { at: now, rows };
  }

  const row = cache.rows.get(taskType);
  if (row) return { provider: row.provider, model: row.model };
  return FALLBACK[taskType];
}

export function invalidateLlmSettingsCache() {
  cache = null;
}
