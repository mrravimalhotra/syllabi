import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { userMessage } from "@/lib/errors";
import { isUuid } from "@/lib/validate";

// Upper bound for a monthly token quota (keeps the value a sane integer).
const MAX_QUOTA = 1_000_000_000;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: students, error } = await admin
    .from("students")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: userMessage(error, "admin/students") }, { status: 500 });

  // Everyone's current-month usage in one query.
  const { data: usage } = await admin.rpc("monthly_usage_all");
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
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!isUuid(body?.id)) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Only these fields are editable here; anything else in the body is ignored.
  const updates: Omit<PatchBody, "id"> = {};
  if (typeof body.active === "boolean") updates.active = body.active;
  if (body.role === "student" || body.role === "admin") updates.role = body.role;
  if (body.token_quota !== undefined) {
    if (!Number.isInteger(body.token_quota) || body.token_quota < 0 || body.token_quota > MAX_QUOTA) {
      return NextResponse.json({ error: `Quota must be a whole number from 0 to ${MAX_QUOTA.toLocaleString()}` }, { status: 400 });
    }
    updates.token_quota = body.token_quota;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  const { id } = body;
  const admin = createAdminClient();
  const { data, error } = await admin.from("students").update(updates).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: userMessage(error, "admin/students") }, { status: 500 });
  return NextResponse.json({ student: data });
}
