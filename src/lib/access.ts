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
