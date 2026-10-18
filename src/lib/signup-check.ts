import { canSignUp } from "@/lib/access";

export const MIN_PASSWORD_LENGTH = 8;
// Longer passwords are silently cut off by the sign-in service (bcrypt stops at 72 bytes), so refuse them instead.
const MAX_PASSWORD_BYTES = 72;
export const MAX_EMAIL_LENGTH = 254;

export const passwordTooLong = (password: string) => new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES;

export interface SignUpForm {
  email: string;
  password: string;
  confirmPassword: string;
  accountType: string;
  adultConfirmed: boolean;
}

/** The first thing wrong with a sign-up form (a key for the page's message), or null when it is fine. */
export function signUpProblem(form: SignUpForm): string | null {
  if (form.email.length > MAX_EMAIL_LENGTH || passwordTooLong(form.password)) return "too-long";
  if (!canSignUp(form.email)) return "private";
  if (form.password !== form.confirmPassword) return "mismatch";
  if (form.password.length < MIN_PASSWORD_LENGTH) return "weak";
  if (form.accountType !== "parent" && form.accountType !== "tutor") return "account-type";
  // Syllabi is for adults only (parents and tutors); our AI provider's terms
  // also require that the app is not used by anyone under 18.
  if (!form.adultConfirmed) return "adult";
  return null;
}

/** The page's message key for a refusal from the sign-in service. */
export function signUpRefusal(message: string): string {
  if (/already/i.test(message)) return "exists";
  return /password/i.test(message) ? "weak" : "unknown";
}
