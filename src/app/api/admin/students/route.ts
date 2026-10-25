import { NextResponse } from "next/server";
import { forgetStudent } from "@/lib/supabase/identity";
import { apiError, authenticateAdmin, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { extendedGuestUntil, parseAccountUpdate } from "@/lib/account-update";

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

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;

  const parsed = parseAccountUpdate(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(400, parsed.message);
  const { id, extendDays } = parsed.value;
  const updates: Record<string, unknown> = { ...parsed.value.updates };
  // An admin switching themselves off or down could lock everyone out of this page.
  if (id === auth.account.id && (updates.active === false || updates.role === "student")) {
    return apiError(400, "You can't turn off or demote your own account. Ask another admin to do it.");
  }
  const admin = createAdminClient();
  if (extendDays) {
    // Only a guest login has an end date; more days count from today when it has already ended.
    const { data: current, error: readError } = await admin.from("students").select("guest_until").eq("id", id).maybeSingle();
    if (readError) return errorResponse(readError, "admin/students PATCH read", "Couldn't save the change. Try again in a moment.");
    if (!current) return apiError(404, "That account no longer exists. Reload the page.");
    if (!current.guest_until) return apiError(400, "Only a guest login has an end date to extend.");
    updates.guest_until = extendedGuestUntil(current.guest_until, extendDays);
  }
  const { data, error } = await admin.from("students").update(updates).eq("id", id).select().maybeSingle();

  forgetStudent(id);
  if (error) return errorResponse(error, "admin/students PATCH", "Couldn't save the change. Try again in a moment.");
  if (!data) return apiError(404, "That account no longer exists. Reload the page.");
  return NextResponse.json({ student: data });
}
