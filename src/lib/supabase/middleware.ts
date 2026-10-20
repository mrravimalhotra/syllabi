import { createServerClient } from "@supabase/ssr";
import { canUseApp } from "@/lib/access";
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
  // The installed app shows this when there is no connection, and asks which version is live (both without a session).
  "/offline.html",
  "/api/version",
];

/** API callers get a JSON error they can show, not an HTML redirect. */
function apiError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** A redirect to another address on this site. */
function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

/** The signed-in person's account row: the remembered copy, or read from the database. */
async function accountRow(supabase: ReturnType<typeof createServerClient>, userId: string) {
  const cached = cachedStudent(userId);
  if (cached) return { student: cached as Pick<Student, "role" | "active" | "guest_until">, error: null };
  const result = await supabase.from("students").select("*").eq("id", userId).single();
  if (result.data) rememberStudent(result.data as Student);
  return { student: (result.data as Student | null) ?? null, error: result.error as { code?: string } | null };
}

/**
 * Whether a signed-in person may open this page: null to let them in, or the
 * response to send instead (a temporary-outage notice, the waiting page, or
 * the dashboard for someone who isn't an admin).
 */
async function pageGate(request: NextRequest, supabase: ReturnType<typeof createServerClient>, userId: string): Promise<NextResponse | null> {
  const { student, error } = await accountRow(supabase, userId);

  // A database failure is not the same as "no access": say it's temporary,
  // instead of sending approved people to the "awaiting approval" page.
  if (error && error.code !== "PGRST116") {
    console.error("[middleware] couldn't read the account row", error);
    return new NextResponse("Syllabi can't reach its database right now. Wait a minute, then reload this page. Your books and answers are safe.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "30" },
    });
  }

  // Revoked/unapproved accounts are blocked here, before any protected route
  // runs. During private testing only admins get in, even if approved.
  if (!student || !canUseApp(student)) return redirectTo(request, "/pending");
  if (request.nextUrl.pathname.startsWith("/admin") && student.role !== "admin") return redirectTo(request, "/dashboard");
  return null;
}

export async function updateSession(request: NextRequest) {
  // Browser tests (npm run test:e2e) run the pages without a real sign-in. The
  // switch only works in development mode, never in a production build.
  if (process.env.UI_PREVIEW === "1" && process.env.NODE_ENV !== "production") return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

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
    const blocked = await pageGate(request, supabase, userId);
    if (blocked) return blocked;
  }

  if (userId && (pathname === "/login" || pathname === "/signup")) return redirectTo(request, "/dashboard");
  return supabaseResponse;
}
