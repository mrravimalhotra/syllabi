import { NextResponse } from "next/server";
import { forgetStudent } from "@/lib/supabase/identity";
import { apiError, authenticateAdmin, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";

// Upper bound for a monthly token quota (keeps the value a sane integer).
const MAX_QUOTA = 1_000_000_000;

export async function GET() {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;

  const admin = createAdminClient();
  const { data: students, error } = await admin
    .from("students")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return errorResponse(error, "admin/students GET", "Couldn't load the accounts. Reload the page to try again.");

  // Everyone's current-month usage in one query.
  const { data: usage, error: usageError } = await admin.rpc("monthly_usage_all");
  if (usageError) return errorResponse(usageError, "admin/students usage", "Couldn't load this month's usage. Reload the page to try again.");
  const usageByStudent = new Map<string, number>(
    ((usage ?? []) as { student_id: string; used: number }[]).map((u) => [u.student_id, u.used])
  );

  return NextResponse.json({
    students: (students ?? []).map((s) => ({ ...s, monthly_usage: usageByStudent.get(s.id) ?? 0 })),
  });
}

interface PatchBody {
  id: string;
  active?: boolean;
  role?: "student" | "admin";
  token_quota?: number;
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body || !isUuid(body.id)) return apiError(400, "Choose an account to change.");

  // Only these fields are editable here; anything else in the body is ignored.
  const updates: Omit<PatchBody, "id"> = {};
  if (typeof body.active === "boolean") updates.active = body.active;
  if (body.role !== undefined) {
    if (body.role !== "student" && body.role !== "admin") return apiError(400, "The role must be \"student\" or \"admin\".");
    updates.role = body.role;
  }
  if (body.token_quota !== undefined) {
    if (!Number.isInteger(body.token_quota) || body.token_quota < 0 || body.token_quota > MAX_QUOTA) {
      return apiError(400, `The monthly allowance must be a whole number from 0 to ${MAX_QUOTA.toLocaleString("en-IN")}.`);
    }
    updates.token_quota = body.token_quota;
  }
  if (Object.keys(updates).length === 0) return apiError(400, "There was nothing to change.");
  const { id } = body;
  // An admin switching themselves off or down could lock everyone out of this page.
  if (id === auth.account.id && (updates.active === false || updates.role === "student")) {
    return apiError(400, "You can't turn off or demote your own account. Ask another admin to do it.");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("students").update(updates).eq("id", id).select().maybeSingle();

  forgetStudent(id);
  if (error) return errorResponse(error, "admin/students PATCH", "Couldn't save the change. Try again in a moment.");
  if (!data) return apiError(404, "That account no longer exists. Reload the page.");
  return NextResponse.json({ student: data });
}
