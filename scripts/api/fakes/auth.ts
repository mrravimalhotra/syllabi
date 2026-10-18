import { UserError } from "@/lib/errors";
import type { Student } from "@/types/database";

export class DatabaseUnavailableError extends UserError {
  constructor() {
    super("Syllabi can't reach its database right now. Wait a minute and try again. Your books and answers are safe.");
  }
}
export class NotAdminError extends UserError {
  constructor() {
    super("Only admins can do this.");
  }
}

/** Who the fake request is from; tests set this before calling a route. */
export const session: { user: Student | null; outage: boolean } = { user: null, outage: false };

export async function getCurrentStudent(): Promise<Student | null> {
  if (session.outage) throw new DatabaseUnavailableError();
  return session.user;
}
export async function requireAdmin(): Promise<Student> {
  const s = await getCurrentStudent();
  if (!s || s.role !== "admin" || !s.active) throw new NotAdminError();
  return s;
}
