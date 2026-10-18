import { randomInt } from "node:crypto";
import { LOGIN_ID, internalEmail, normaliseLoginId } from "@/lib/login-id";

const MAX_DAYS = 3650;
const MIN_PASSWORD = 6;
const MAX_PASSWORD_BYTES = 72;
const MIN_ALLOWANCE = 1_000;
const MAX_ALLOWANCE = 1_000_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A password people can read out and type: 12 letters and digits, no look-alike characters. */
function readablePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars[randomInt(chars.length)]).join("");
}

export interface GuestRequest {
  loginId: string;
  email: string;
  password: string;
  days: number;
  allowance: number;
  name: string;
}

type Parsed = { ok: true; value: GuestRequest } | { ok: false; message: string };
type Fields = Pick<GuestRequest, "loginId" | "email" | "password">;

/** Who signs in and with what: a user ID with a chosen password, or an email with a made-up one. */
function parseLogin(body: Record<string, unknown>): { fields: Fields } | { message: string } {
  const loginId = typeof body.loginId === "string" ? normaliseLoginId(body.loginId) : "";
  if (loginId) {
    if (!LOGIN_ID.test(loginId))
      return { message: "The user ID must be 3 to 30 letters, digits, dots, dashes or underscores, with no spaces or @." };
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_PASSWORD) return { message: `Choose a password of at least ${MIN_PASSWORD} characters for the guest.` };
    if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES)
      return { message: "That password is too long. Use at most 72 characters." };
    return { fields: { loginId, email: internalEmail(loginId), password } };
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254)
    return { message: "Type a valid email address for the guest, or choose a user ID and password." };
  return { fields: { loginId: "", email, password: readablePassword() } };
}

/** Checks a request to make a guest login and returns it cleaned up, or the message to show. */
export function parseGuestRequest(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, message: "The guest details couldn't be read. Try again." };
  const input = body as Record<string, unknown>;

  const login = parseLogin(input);
  if ("message" in login) return { ok: false, message: login.message };

  const days = Number(input.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return { ok: false, message: `Choose how many days the guest can sign in: a whole number from 1 to ${MAX_DAYS}.` };
  }
  const allowance = Number(input.allowance);
  if (!Number.isInteger(allowance) || allowance < MIN_ALLOWANCE || allowance > MAX_ALLOWANCE) {
    return {
      ok: false,
      message: `The guest's monthly allowance must be a whole number from ${MIN_ALLOWANCE.toLocaleString("en-IN")} to ${MAX_ALLOWANCE.toLocaleString("en-IN")} tokens.`,
    };
  }
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  return { ok: true, value: { ...login.fields, days, allowance, name } };
}

/** A plain message for the ways the login service refuses a new guest, or null for anything else (a real failure). */
export function refusedLoginMessage(reason: string, byId: boolean): string | null {
  if (/already|registered|exists/i.test(reason)) {
    return byId
      ? "A guest with this user ID already exists. Choose another ID, or change that account in the list below."
      : "An account with this email already exists. Use another email for the guest, or change that account in the list below.";
  }
  if (byId && /email/i.test(reason)) return "Supabase refused the stand-in address made for this user ID. Use the email option for this guest instead.";
  return null;
}
