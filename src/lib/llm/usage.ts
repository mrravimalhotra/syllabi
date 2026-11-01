import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalizedUsage } from "@/lib/llm/types";
import type { Provider, TaskType } from "@/types/database";

type UsageRow = {
  studentId: string;
  taskType: TaskType;
  provider: Provider;
  model: string;
  usage: NormalizedUsage;
};

async function saveUsage(params: UsageRow) {
  const admin = createAdminClient();
  const { error } = await admin.from("token_usage").insert({
    student_id: params.studentId,
    task_type: params.taskType,
    provider: params.provider,
    model: params.model,
    input_tokens: params.usage.inputTokens,
    output_tokens: params.usage.outputTokens,
    total_tokens: params.usage.totalTokens,
  });
  // The answer is already made; a missing usage row only affects the monthly count, so log it and carry on.
  if (error) console.error("[usage] couldn't record token use", error);
}

/**
 * Records one LLM call's normalized token usage against a student, for quota enforcement. Saved after the
 * reply is sent (`after`), so an answer never waits on it; outside a request it is saved at once.
 */
export async function recordTokenUsage(params: UsageRow) {
  try {
    after(() => saveUsage(params));
  } catch {
    await saveUsage(params);
  }
}
