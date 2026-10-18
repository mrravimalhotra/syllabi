import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { cachedStudent, identify, rememberStudent } from "@/lib/supabase/identity";
import { UserError } from "@/lib/errors";
import type { Student } from "@/types/database";

/** The database couldn't be reached to check who this is: not the same as being signed out. */
export class DatabaseUnavailableError extends UserError {
  constructor() {
    super("Syllabi can't reach its database right now. Wait a minute and try again. Your books and answers are safe.");
  }
}

/** A signed-in account without admin rights tried to use an admin page or action. */
export class NotAdminError extends UserError {
  constructor() {
    super("Only admins can do this.");
  }
}

const PREVIEW_ADMIN = {
  id: "00000000-0000-4000-8000-0000000000aa",
  full_name: "Preview Admin",
  email: "admin@example.com",
  role: "admin",
  account_type: null,
  class_level: null,
  board: null,
  answer_language: null,
  adult_confirmed_at: null,
  active: true,
  token_quota: 200000,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as Student;

// PostgREST's "no rows" code: the person has no account row (not an outage).
const NO_ROWS = "PGRST116";

/**
 * Returns the logged-in account's profile row, or null if signed out or
 * without a profile. Server-only. Cached per request, so a layout and its page
 * share one lookup. A database failure is retried once, then thrown as
 * DatabaseUnavailableError, so an outage is never mistaken for "signed out".
 */
export const getCurrentStudent = cache(async (): Promise<Student | null> => {
  // Browser tests (npm run test:e2e) run pages without a real sign-in; development mode only.
  if (process.env.UI_PREVIEW === "1" && process.env.NODE_ENV !== "production") return PREVIEW_ADMIN;
  const supabase = await createClient();
  const userId = await identify(supabase);
  if (!userId) return null;
  const known = cachedStudent(userId);
  if (known) return known;

  for (let attempt = 1; ; attempt++) {
    const { data, error } = await supabase.from("students").select("*").eq("id", userId).single();
    if (!error) {
      rememberStudent(data as Student);
      return data as Student;
    }
    if (error.code === NO_ROWS) return null;
    if (attempt >= 2) {
      console.error("[auth] couldn't read the account row", error);
      throw new DatabaseUnavailableError();
    }
  }
});

/** The signed-in, active admin, or an error saying why not (signed out is null from getCurrentStudent, so it is reported as not admin). */
export async function requireAdmin(): Promise<Student> {
  const student = await getCurrentStudent();
  if (!student || student.role !== "admin" || !student.active) throw new NotAdminError();
  return student;
}
