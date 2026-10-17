import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";
import type { GeneratedDocumentRow, Student } from "@/types/database";

/** A saved answer, if it exists and belongs to this user (admins can open any). */
export async function findAnswer(id: string, user: Student): Promise<GeneratedDocumentRow | null> {
  if (!isUuid(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("generated_documents").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  if (data.student_id !== user.id && user.role !== "admin") return null;
  return data as GeneratedDocumentRow;
}
