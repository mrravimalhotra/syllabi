import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Student } from "@/types/database";

/**
 * Returns the logged-in student's profile row, or null if unauthenticated.
 * Server-only. Cached per request, so a layout and its page share one lookup.
 */
export const getCurrentStudent = cache(async (): Promise<Student | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("students").select("*").eq("id", user.id).single();
  return data as Student | null;
});

export async function requireAdmin(): Promise<Student> {
  const student = await getCurrentStudent();
  if (!student || student.role !== "admin" || !student.active) {
    throw new Error("Admin access required");
  }
  return student;
}
