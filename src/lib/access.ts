/**
 * Private-testing switch. Until OPEN_SIGNUPS is "true", Syllabi is limited to
 * one tester: only ADMIN_EMAIL may sign up, and only admin accounts can use
 * the app. Setting OPEN_SIGNUPS=true in Vercel (and redeploying) opens it to
 * parents and tutors, with no code change.
 */
export function signupsOpen(): boolean {
  return process.env.OPEN_SIGNUPS === "true";
}

function adminEmail(): string | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return email || null;
}

/** Whether this email may create an account right now. */
export function canSignUp(email: string): boolean {
  if (signupsOpen()) return true;
  const allowed = adminEmail();
  return allowed !== null && email.trim().toLowerCase() === allowed;
}

/** A guest login (made by an admin) that hasn't expired yet. */
function isActiveGuest(student: { guest_until?: string | null }): boolean {
  return Boolean(student.guest_until) && Date.parse(student.guest_until!) > Date.now();
}

/**
 * Whether an account may use the app right now: approved, and either sign-ups
 * are open, or it is an admin, or it is a guest whose time hasn't run out. A
 * guest whose time has run out is refused even when sign-ups are open.
 */
export function canUseApp(student: { active: boolean; role: string; guest_until?: string | null }): boolean {
  if (!student.active) return false;
  if (student.guest_until && !isActiveGuest(student)) return false;
  return signupsOpen() || student.role === "admin" || isActiveGuest(student);
}
