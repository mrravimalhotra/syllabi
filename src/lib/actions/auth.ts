"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext } from "@/lib/auth-messages";
import { looksLikeLoginId, normaliseLoginId } from "@/lib/login-id";
import { MAX_EMAIL_LENGTH, MIN_PASSWORD_LENGTH, passwordTooLong, signUpProblem, signUpRefusal } from "@/lib/signup-check";

function normaliseEmail(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase();
}

export async function signIn(formData: FormData) {
  const typed = normaliseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  let email = typed;
  if (looksLikeLoginId(typed)) {
    // A user ID (like "guest") stands in for the account's email. An unknown ID gets the same message as a wrong password.
    const { data } = await createAdminClient().from("students").select("email").eq("login_id", normaliseLoginId(typed)).maybeSingle();
    if (!data?.email) redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
    email = data.email;
  }

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

  const problem = signUpProblem({ email, password, confirmPassword, accountType, adultConfirmed });
  if (problem) redirect(`/signup?error=${problem}`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    console.error("[signUp]", error.message);
    redirect(`/signup?error=${signUpRefusal(error.message)}`);
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
  const { error } = await supabase.auth.signOut();
  if (error) console.error("[signOut]", error.message);
  redirect("/login");
}

/** Sends a password-reset link. Always shows the same message, so it never reveals whether an email has an account. */
export async function requestPasswordReset(formData: FormData) {
  const email = normaliseEmail(formData.get("email"));
  if (email && email.length <= MAX_EMAIL_LENGTH) {
    // A fixed address (NEXT_PUBLIC_SITE_URL) is safest; otherwise the address this request came to.
    const h = await headers();
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
      `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
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
  if (passwordTooLong(password)) redirect("/reset-password?error=too-long");

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
