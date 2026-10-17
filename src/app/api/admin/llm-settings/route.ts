import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateLlmSettingsCache } from "@/lib/llm/config";
import type { Provider, TaskType } from "@/types/database";
import { userMessage } from "@/lib/errors";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("llm_settings").select("*").order("task_type");
  if (error) return NextResponse.json({ error: userMessage(error, "admin/llm-settings") }, { status: 500 });
  return NextResponse.json({ settings: data });
}

const TASK_TYPES = new Set<TaskType>([
  "ocr_extraction",
  "embedding",
  "solution",
  "notes",
  "sample_paper",
  "ad_hoc",
  "coverage_check",
]);
const PROVIDERS = new Set<Provider>(["google", "anthropic", "openai"]);

interface PatchBody {
  taskType: TaskType;
  provider: Provider;
  model: string;
}

export async function PATCH(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!body || !TASK_TYPES.has(body.taskType) || !PROVIDERS.has(body.provider) || !/^[\w.:\-/]{1,100}$/.test(model)) {
    return NextResponse.json({ error: "Choose a task, a provider and a valid model name" }, { status: 400 });
  }
  // Embeddings must stay on Google: the search index is built from Google's 768-dimension vectors.
  if (body.taskType === "embedding" && body.provider !== "google") {
    return NextResponse.json({ error: "Embeddings must use Google (the search index depends on it)" }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from("llm_settings")
    .update({ provider: body.provider, model, updated_by: admin.id, updated_at: new Date().toISOString() })
    .eq("task_type", body.taskType)
    .select()
    .single();

  if (error) return NextResponse.json({ error: userMessage(error, "admin/llm-settings") }, { status: 500 });

  // The routing cache would otherwise serve the old provider/model for up to
  // CACHE_TTL_MS after this change; invalidate so the switch takes effect immediately.
  invalidateLlmSettingsCache();

  return NextResponse.json({ setting: data });
}
