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
  if (!body?.taskType || !body.provider || !body.model?.trim()) {
    return NextResponse.json({ error: "taskType, provider, and model are required" }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from("llm_settings")
    .update({ provider: body.provider, model: body.model.trim(), updated_by: admin.id })
    .eq("task_type", body.taskType)
    .select()
    .single();

  if (error) return NextResponse.json({ error: userMessage(error, "admin/llm-settings") }, { status: 500 });

  // The routing cache would otherwise serve the old provider/model for up to
  // CACHE_TTL_MS after this change; invalidate so the switch takes effect immediately.
  invalidateLlmSettingsCache();

  return NextResponse.json({ setting: data });
}
