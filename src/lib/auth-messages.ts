// Messages on the sign-in, sign-up and password pages are chosen by a short key
// in the URL (?error=invalid), never taken from the URL as text, so a crafted
// link can't make Syllabi display words it didn't write.

export const LOGIN_MESSAGES: Record<string, string> = {
  created: "Account created. An admin must approve access before you can sign in.",
  "reset-sent": "If an account exists for that email, a link to reset your password is on its way. Check your inbox and spam folder.",
  "password-updated": "Password changed. You're signed in.",
};

export const LOGIN_ERRORS: Record<string, string> = {
  // One message for a wrong password and an unknown email, so the page never
  // reveals which emails have accounts.
  invalid: "Wrong email or password.",
  "link-expired": "That link has expired or was already used. Request a new one.",
  unknown: "Something went wrong. Please try again.",
};

export const SIGNUP_ERRORS: Record<string, string> = {
  private: "Syllabi is in private testing. Sign-ups will open soon.",
  mismatch: "Passwords do not match.",
  "account-type": "Choose whether you are a parent or a tutor.",
  adult: "You must confirm you are 18 or older to create an account.",
  weak: "Choose a stronger password: at least 8 characters.",
  exists: "An account with this email already exists. Sign in, or reset your password.",
  unknown: "Something went wrong. Please try again.",
};

export const RESET_ERRORS: Record<string, string> = {
  mismatch: "Passwords do not match.",
  weak: "Choose a stronger password: at least 8 characters.",
  "no-session": "That reset link has expired. Request a new one.",
  unknown: "Something went wrong. Please try again.",
};

/** Looks up a message by key; unknown keys show nothing. */
export function pick(messages: Record<string, string>, key: string | undefined): string | null {
  return key && Object.hasOwn(messages, key) ? messages[key] : null;
}

/** Only same-site paths are allowed as "where to go next", never another website. */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : fallback;
}
