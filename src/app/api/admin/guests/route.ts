import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError, authenticateAdmin, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * Makes a guest login: an account that works while sign-ups are closed, has
 * its own small monthly allowance, and expires by itself. Two kinds:
 *  - by email: a random password is made and returned once;
 *  - by user ID ("guest"): the admin chooses a fixed password, and the guest signs
 *    in with the ID and that password (no email needed).
 * Syllabi doesn't keep the password.
 * Body: { email | loginId + password, days, allowance, name? }.
 */
export async function POST(request: Request) {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return apiError(400, "The guest details couldn't be read. Try again.");

  const loginId = typeof body.loginId === "string" ? normaliseLoginId(body.loginId) : "";
  let password: string;
  let email: string;
  if (loginId) {
    if (!LOGIN_ID.test(loginId)) return apiError(400, "The user ID must be 3 to 30 letters, digits, dots, dashes or underscores, with no spaces or @.");
    password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_PASSWORD) return apiError(400, `Choose a password of at least ${MIN_PASSWORD} characters for the guest.`);
    if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return apiError(400, "That password is too long. Use at most 72 characters.");
    email = internalEmail(loginId);
  } else {
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL.test(email) || email.length > 254) return apiError(400, "Type a valid email address for the guest, or choose a user ID and password.");
    password = readablePassword();
  }
  const days = Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return apiError(400, `Choose how many days the guest can sign in: a whole number from 1 to ${MAX_DAYS}.`);
  const allowance = Number(body.allowance);
  if (!Number.isInteger(allowance) || allowance < MIN_ALLOWANCE || allowance > MAX_ALLOWANCE) {
    return apiError(400, `The guest's monthly allowance must be a whole number from ${MIN_ALLOWANCE.toLocaleString("en-IN")} to ${MAX_ALLOWANCE.toLocaleString("en-IN")} tokens.`);
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";

  const admin = createAdminClient();
  const guestUntil = new Date(Date.now() + days * 86_400_000).toISOString();
  let userId: string | null = null;
  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) {
      if (/already|registered|exists/i.test(created.error?.message ?? "")) {
        return apiError(400, loginId ? "A guest with this user ID already exists. Choose another ID, or change that account in the list below." : "An account with this email already exists. Use another email for the guest, or change that account in the list below.");
      }
      if (loginId && /email/i.test(created.error?.message ?? "")) {
        return apiError(400, "Supabase refused the stand-in address made for this user ID. Use the email option for this guest instead.");
      }
      throw created.error ?? new Error("The login was not created");
    }
    userId = created.data.user.id;

    const { data, error } = await admin
      .from("students")
      .insert({
        id: userId,
        email,
        full_name: name || "Guest",
        role: "student",
        account_type: "parent",
        adult_confirmed_at: new Date().toISOString(),
        active: true,
        token_quota: allowance,
        guest_until: guestUntil,
        login_id: loginId || null,
      })
      .select()
      .single();
    if (error?.code === "23505" && loginId) {
      await admin.auth.admin.deleteUser(userId).catch((e) => console.error("[admin/guests] cleanup", e));
      return apiError(400, "That user ID is already taken. Choose another.");
    }
    if (error || !data) throw error ?? new Error("The account row was not created");
    return NextResponse.json({ account: data, password: loginId ? null : password });
  } catch (err) {
    // Don't leave a login without an account behind.
    if (userId) await admin.auth.admin.deleteUser(userId).catch((e) => console.error("[admin/guests] cleanup", e));
    return errorResponse(err, "admin/guests POST", "Couldn't make the guest account. Try again in a moment.");
  }
}
