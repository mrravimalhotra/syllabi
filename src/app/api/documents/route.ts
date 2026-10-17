import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { userMessage } from "@/lib/errors";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student || !student.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("generated_documents")
    .select("id, title, task_type, created_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: userMessage(error, "documents GET") }, { status: 500 });
  return NextResponse.json({ documents: data });
}
