import { createServerClient } from "@supabase/ssr";
import { signupsOpen } from "@/lib/access";
import { NextResponse, type NextRequest } from "next/server";

// The manifest is fetched without a session, so it must stay public. The
// password pages must work for anyone holding a reset link (their own
// actions check the session).
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth/callback",
  "/pending",
  "/forgot-password",
  "/reset-password",
  // Background page reading: called by the database's timer, checks its own token.
  "/api/jobs",
  "/manifest.webmanifest",
];

/** API callers get a JSON error they can show, not an HTML redirect. */
function apiError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isApi = pathname.startsWith("/api/");

  if (!user && !isPublic) {
    if (isApi) return apiError(401, "Your session has ended. Please sign in again.");
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    const { data: student } = await supabase
      .from("students")
      .select("role, active")
      .eq("id", user.id)
      .single();

    // Revoked/unapproved accounts are blocked here, before any protected route
    // runs. During private testing only admins get in, even if approved.
    if (!student || !student.active || (!signupsOpen() && student.role !== "admin")) {
      if (isApi) return apiError(403, "Your account doesn't have access right now.");
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      return NextResponse.redirect(url);
    }

    if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin/")) && student.role !== "admin") {
      if (isApi) return apiError(403, "Admins only.");
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
