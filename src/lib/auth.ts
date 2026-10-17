import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
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

// PostgREST's "no rows" code: the person has no account row (not an outage).
const NO_ROWS = "PGRST116";

/**
 * Returns the logged-in account's profile row, or null if signed out or
 * without a profile. Server-only. Cached per request, so a layout and its page
 * share one lookup. A database failure is retried once, then thrown as
 * DatabaseUnavailableError, so an outage is never mistaken for "signed out".
 */
export const getCurrentStudent = cache(async (): Promise<Student | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  for (let attempt = 1; ; attempt++) {
    const { data, error } = await supabase.from("students").select("*").eq("id", user.id).single();
    if (!error) return data as Student;
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
