import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The schools/grades/subjects the caller may generate for: everything for an
 * admin; for a parent or tutor, their assigned school with all its grades and
 * only their assigned subjects.
 */
export async function GET() {
  const student = await getCurrentStudent();
  if (!student || !student.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  if (student.role === "admin") {
    const [{ data: schools }, { data: grades }, { data: subjects }] = await Promise.all([
      admin.from("schools").select("*").order("name"),
      admin.from("grades").select("*").order("name"),
      admin.from("subjects").select("*").order("name"),
    ]);
    return NextResponse.json({ schools: schools ?? [], grades: grades ?? [], subjects: subjects ?? [] });
  }

  if (!student.school_id) {
    return NextResponse.json({ schools: [], grades: [], subjects: [] });
  }

  const [{ data: schools }, { data: grades }, { data: subjects }] = await Promise.all([
    admin.from("schools").select("*").eq("id", student.school_id),
    admin.from("grades").select("*").eq("school_id", student.school_id).order("name"),
    admin.from("subjects").select("*").in("id", student.subject_ids).order("name"),
  ]);
  return NextResponse.json({ schools: schools ?? [], grades: grades ?? [], subjects: subjects ?? [] });
}
