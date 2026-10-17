import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { userMessage } from "@/lib/errors";

export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("generated_documents")
    .select("id, title, task_type, created_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: userMessage(error, "documents GET") }, { status: 500 });
  return NextResponse.json({ documents: data });
}
