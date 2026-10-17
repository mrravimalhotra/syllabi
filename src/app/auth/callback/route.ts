import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-messages";

// Handles the redirect from email confirmation and password-reset links.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback]", error.message);
      return NextResponse.redirect(`${origin}/login?error=link-expired`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
