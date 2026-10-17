// Messages on the sign-in, sign-up and password pages are chosen by a short key
// in the URL (?error=invalid), never taken from the URL as text, so a crafted
// link can't make Syllabi display words it didn't write.

const PRIVATE_TESTING = "Syllabi is in private testing. Sign-ups will open soon.";

export const LOGIN_MESSAGES: Record<string, string> = {
  created: "Your account was created. It must be approved before you can sign in. Try signing in again later.",
  "reset-sent":
    "If an account exists for that email, a link to reset your password is on its way. Check your inbox and spam folder; it can take a few minutes. Still nothing after 10 minutes? Request another link.",
};

export const LOGIN_ERRORS: Record<string, string> = {
  // One message for a wrong password and an unknown email, so the page never
  // reveals which emails have accounts.
  invalid: "Wrong email or password. Check them and try again, or use “Forgot password?” below.",
  "link-expired": "That link has expired or was already used. Request a new one from “Forgot password?”.",
  unknown: "We couldn't sign you in just now. Wait a moment and try again.",
};

export const SIGNUP_ERRORS: Record<string, string> = {
  private: PRIVATE_TESTING,
  mismatch: "The two passwords don't match. Type the same password in both boxes.",
  "account-type": "Choose whether you are a parent or a tutor.",
  adult: "Tick the box to confirm you are 18 or older. Syllabi is for adults only.",
  weak: "Use a password of at least 8 characters.",
  exists: "An account with this email already exists. Go to Sign in, or use “Forgot password?” if you don't remember the password.",
  "too-long": "That email or password is too long. Use an email under 255 characters and a password of 8 to 72 characters.",
  unknown: "We couldn't create your account just now. Wait a few minutes and try again.",
};

export const RESET_ERRORS: Record<string, string> = {
  mismatch: "The two passwords don't match. Type the same password in both boxes.",
  weak: "Use a password of at least 8 characters.",
  "too-long": "Use a password of 8 to 72 characters.",
  "no-session": "That reset link has expired or was already used. Request a new one from “Forgot password?”.",
  unknown: "We couldn't change your password just now. Wait a moment and try again.",
};

/** Looks up a message by key; unknown keys show nothing. */
export function pick(messages: Record<string, string>, key: string | undefined): string | null {
  return key && Object.hasOwn(messages, key) ? messages[key] : null;
}

/** Only same-site paths are allowed as "where to go next", never another website. */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : fallback;
}
