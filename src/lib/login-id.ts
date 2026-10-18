// A short user ID (such as "guest") that can be typed on the sign-in page in
// place of an email. IDs are lowercase letters, digits, dots, dashes and
// underscores, 3 to 30 long, and never contain "@".

export const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normaliseLoginId(value: string): string {
  return value.trim().toLowerCase();
}

/** True when what was typed is a user ID rather than an email address. */
export function looksLikeLoginId(value: string): boolean {
  return !value.includes("@");
}

/**
 * The login address given to an ID-only account. It is never mailed (the
 * domain belongs to the app and receives no mail), it only has to be unique.
 */
export function internalEmail(loginId: string): string {
  return `${loginId}@guest.syllabi-study.vercel.app`;
}
