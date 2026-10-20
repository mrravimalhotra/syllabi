import { NextResponse } from "next/server";
import { apiError, authenticate, authenticateAdmin, errorResponse } from "@/lib/api";
import { BUG_STATUSES, reportMarkdown, type BugStatus } from "@/lib/bug-report";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";

const NOT_FOUND = "That report no longer exists. Reload the page.";

/** One report in full, with a Markdown version to hand to whoever fixes it. The person who raised it, or an admin. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, NOT_FOUND);

  try {
    const { data, error } = await createAdminClient()
      .from("bug_reports")
      .select(
        "id, number, student_id, title, description, path, app_build, status, created_at, resolution, context, students(email, full_name)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data || (data.student_id !== auth.account.id && auth.account.role !== "admin")) return apiError(404, NOT_FOUND);
    const who = (data.students as { email?: string; full_name?: string | null } | null)?.email ?? null;
    return NextResponse.json({ report: data, markdown: reportMarkdown({ ...data, who }) });
  } catch (err) {
    return errorResponse(err, "bug-reports GET one", "Couldn't load the report. Try again.");
  }
}

/** An admin sets a report's status and the note on what was done. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, NOT_FOUND);
  const body = (await request.json().catch(() => null)) as { status?: unknown; resolution?: unknown } | null;
  if (!body) return apiError(400, "Your change couldn't be read. Try again.");

  const updates: { status?: BugStatus; resolution?: string | null; resolved_at?: string | null } = {};
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !BUG_STATUSES.includes(body.status as BugStatus))
      return apiError(400, "Choose Open, Being fixed, Fixed or Won't fix.");
    updates.status = body.status as BugStatus;
    updates.resolved_at = body.status === "fixed" || body.status === "wontfix" ? new Date().toISOString() : null;
  }
  if (body.resolution !== undefined) {
    const note = typeof body.resolution === "string" ? body.resolution.trim() : "";
    if (note.length > 5000) return apiError(400, "The note is too long (over 5,000 characters).");
    updates.resolution = note || null;
  }
  if (Object.keys(updates).length === 0) return apiError(400, "There was nothing to change.");

  try {
    const { data, error } = await createAdminClient()
      .from("bug_reports")
      .update(updates)
      .eq("id", id)
      .select("id, number, status, resolution")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError(404, NOT_FOUND);
    return NextResponse.json({ report: data });
  } catch (err) {
    return errorResponse(err, "bug-reports PATCH", "Couldn't save the change. Try again.");
  }
}
