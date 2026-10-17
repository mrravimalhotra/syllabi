import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { userMessage } from "@/lib/errors";

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

  // Attach current-month usage for each student in one batch.
  const usageByStudent = new Map<string, number>();
  await Promise.all(
    (students ?? []).map(async (s) => {
      const { data } = await admin.rpc("student_monthly_usage", { p_student_id: s.id });
      usageByStudent.set(s.id, (data as number) ?? 0);
    })
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
  if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Only these fields are editable here; anything else in the body is ignored.
  const updates: Omit<PatchBody, "id"> = {};
  if (typeof body.active === "boolean") updates.active = body.active;
  if (body.role === "student" || body.role === "admin") updates.role = body.role;
  if (Number.isInteger(body.token_quota) && (body.token_quota as number) >= 0) updates.token_quota = body.token_quota;
  const { id } = body;
  const admin = createAdminClient();
  const { data, error } = await admin.from("students").update(updates).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: userMessage(error, "admin/students") }, { status: 500 });
  return NextResponse.json({ student: data });
}
