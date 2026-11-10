import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";

/**
 * How one of the caller's answer requests is going: the stage it reached, how it ended (null while it is still being
 * made) and the saved answer's id. The screen asks this when its connection dropped, to pick the answer up again.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "That request is not known.");
  const { data, error } = await createAdminClient().from("generation_runs").select("stage, outcome, document_id, started_at").eq("id", id).eq("student_id", auth.account.id).maybeSingle();
  if (error) return errorResponse(error, "run status", "Couldn't check on your answer. Try again in a moment.");
  if (!data) return apiError(404, "That request is not known.");
  return NextResponse.json({ stage: data.stage, outcome: data.outcome, documentId: data.document_id, seconds: Math.round((Date.now() - Date.parse(data.started_at)) / 1000) });
}
