"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSignUp } from "@/lib/access";
import { safeNext } from "@/lib/auth-messages";

const MIN_PASSWORD_LENGTH = 8;

function normaliseEmail(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase();
}

export async function signIn(formData: FormData) {
  const email = normaliseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("[signIn]", error.message);
    redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = normaliseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 120);
  const accountType = String(formData.get("account_type") ?? "");
  const adultConfirmed = formData.get("adult_confirmed") === "yes";

  if (!canSignUp(email)) redirect("/signup?error=private");
  if (password !== confirmPassword) redirect("/signup?error=mismatch");
  if (password.length < MIN_PASSWORD_LENGTH) redirect("/signup?error=weak");
  if (accountType !== "parent" && accountType !== "tutor") redirect("/signup?error=account-type");
  // Syllabi is for adults only (parents and tutors); our AI provider's terms
  // also require that the app is not used by anyone under 18.
  if (!adultConfirmed) redirect("/signup?error=adult");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    console.error("[signUp]", error.message);
    const key = /already/i.test(error.message) ? "exists" : /password/i.test(error.message) ? "weak" : "unknown";
    redirect(`/signup?error=${key}`);
  }

  if (data.user) {
    // Service role is required: RLS only lets admins write account rows, and
    // this flow creates the row before a session cookie exists anyway.
    const admin = createAdminClient();
    const { error: rowError } = await admin.from("students").insert({
      id: data.user.id,
      email,
      full_name: fullName || null,
      role: "student",
      account_type: accountType,
      adult_confirmed_at: new Date().toISOString(),
      active: false, // an admin must grant access before the account can use the app
    });
    // Without its account row the person would be stuck on "pending" forever:
    // remove the half-made login so they can simply try again.
    if (rowError) {
      console.error("[signUp] account row", rowError);
      await admin.auth.admin.deleteUser(data.user.id).catch((err) => console.error("[signUp] cleanup", err));
      redirect("/signup?error=unknown");
    }
  }

  redirect("/login?message=created");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Sends a password-reset link. Always shows the same message, so it never reveals whether an email has an account. */
export async function requestPasswordReset(formData: FormData) {
  const email = normaliseEmail(formData.get("email"));
  if (email) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    if (error) console.error("[requestPasswordReset]", error.message);
  }
  redirect("/login?message=reset-sent");
}

/** Sets a new password for the person who arrived from a reset link (they have a fresh session). */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  if (password !== confirmPassword) redirect("/reset-password?error=mismatch");
  if (password.length < MIN_PASSWORD_LENGTH) redirect("/reset-password?error=weak");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/reset-password?error=no-session");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[updatePassword]", error.message);
    redirect(`/reset-password?error=${/password/i.test(error.message) ? "weak" : "unknown"}`);
  }
  redirect("/dashboard");
}
