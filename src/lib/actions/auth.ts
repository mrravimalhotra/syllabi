"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSignUp } from "@/lib/access";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(next || "/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const fullName = String(formData.get("full_name") ?? "");
  const accountType = String(formData.get("account_type") ?? "");
  const adultConfirmed = formData.get("adult_confirmed") === "yes";

  if (!canSignUp(email)) {
    redirect(`/signup?error=${encodeURIComponent("Syllabi is in private testing. Sign-ups will open soon.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/signup?error=${encodeURIComponent("Passwords do not match")}`);
  }
  if (accountType !== "parent" && accountType !== "tutor") {
    redirect(`/signup?error=${encodeURIComponent("Choose whether you are a parent or a tutor")}`);
  }
  // Syllabi is for adults only (parents and tutors); our AI provider's terms
  // also require that the app is not used by anyone under 18.
  if (!adultConfirmed) {
    redirect(`/signup?error=${encodeURIComponent("You must confirm you are 18 or older to create an account")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user) {
    // Service role is required: RLS only lets admins write account rows, and
    // this flow creates the row before a session cookie exists anyway.
    const admin = createAdminClient();
    await admin.from("students").insert({
      id: data.user.id,
      email,
      full_name: fullName || null,
      role: "student",
      account_type: accountType,
      adult_confirmed_at: new Date().toISOString(),
      active: false, // an admin must grant access before the account can use the app
    });
  }

  redirect("/login?message=Account created. An admin must approve access before you can sign in.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
