import { createServerClient } from "@supabase/ssr";
import { signupsOpen } from "@/lib/access";
import { cachedStudent, identify, rememberStudent } from "@/lib/supabase/identity";
import type { Student } from "@/types/database";
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
  // Browser tests (npm run test:e2e) run the pages without a real sign-in. The
  // switch only works in development mode, never in a production build.
  if (process.env.UI_PREVIEW === "1" && process.env.NODE_ENV !== "production") return NextResponse.next({ request });

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

  // getClaims checks the sign-in token on this server (no round trip to the
  // sign-in service when the project uses signing keys), and refreshes it when it
  // is about to expire. Whether the account may still use Syllabi is checked
  // against its database row below and in each API route.
  const userId = await identify(supabase);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isApi = pathname.startsWith("/api/");

  if (!userId && !isPublic) {
    if (isApi) return apiError(401, "Your session has ended. Please sign in again.");
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // API routes check the account row themselves (authenticate in lib/api.ts),
  // so only pages need the lookup here: it saves a database round trip per request.
  if (userId && !isPublic && !isApi) {
    let student: Pick<Student, "role" | "active"> | null = cachedStudent(userId);
    let studentError: { code?: string } | null = null;
    if (!student) {
      const result = await supabase.from("students").select("*").eq("id", userId).single();
      studentError = result.error;
      if (result.data) {
        student = result.data as Student;
        rememberStudent(result.data as Student);
      }
    }

    // A database failure is not the same as "no access": say it's temporary,
    // instead of sending approved people to the "awaiting approval" page.
    if (studentError && studentError.code !== "PGRST116") {
      console.error("[middleware] couldn't read the account row", studentError);
      return new NextResponse(
        "Syllabi can't reach its database right now. Wait a minute, then reload this page. Your books and answers are safe.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "30" } }
      );
    }

    // Revoked/unapproved accounts are blocked here, before any protected route
    // runs. During private testing only admins get in, even if approved.
    if (!student || !student.active || (!signupsOpen() && student.role !== "admin")) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/admin") && student.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  if (userId && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
