import { NextResponse } from "next/server";
import { apiError, authenticateAdmin, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateLlmSettingsCache } from "@/lib/llm/config";
import { PROVIDERS, TASK_TYPES, type Provider, type TaskType } from "@/types/database";

export async function GET() {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin.from("llm_settings").select("*").order("task_type");
  if (error) return errorResponse(error, "admin/llm-settings GET", "Couldn't load the AI settings. Reload the page to try again.");
  return NextResponse.json({ settings: data });
}

interface PatchBody {
  taskType: TaskType;
  provider: Provider;
  model: string;
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;
  const admin = auth.account;

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!body || !TASK_TYPES.includes(body.taskType) || !PROVIDERS.includes(body.provider) || !/^[\w.:\-/]{1,100}$/.test(model)) {
    return apiError(400, "Choose a task, a provider and a model name (letters, numbers and . : - _ / only, up to 100 characters).");
  }
  // Embeddings must stay on Google: the search index is built from Google's 768-dimension vectors.
  if (body.taskType === "embedding" && body.provider !== "google") {
    return apiError(400, "Book search must stay on Google, because your books' search index is built from Google's embeddings.");
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from("llm_settings")
    .update({ provider: body.provider, model, updated_by: admin.id, updated_at: new Date().toISOString() })
    .eq("task_type", body.taskType)
    .select()
    .maybeSingle();

  if (error) return errorResponse(error, "admin/llm-settings PATCH", "Couldn't save the AI setting. Try again in a moment.");
  if (!data) return apiError(404, "That task isn't in the settings table. Nothing was changed.");

  // The routing cache would otherwise serve the old provider/model for up to
  // CACHE_TTL_MS after this change; invalidate so the switch takes effect immediately.
  invalidateLlmSettingsCache();

  return NextResponse.json({ setting: data });
}
