import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { MAX_REPORTS_PER_DAY, parseBugReport } from "@/lib/bug-report";
import { createAdminClient } from "@/lib/supabase/admin";

/** Raises a problem report (ticket) with what the screen captured. */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;

  const parsed = parseBugReport(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(400, parsed.message);
  const { title, description, path, build, context } = parsed.value;

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error: countError } = await admin
      .from("bug_reports")
      .select("id", { count: "exact", head: true })
      .eq("student_id", auth.account.id)
      .gte("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_REPORTS_PER_DAY) {
      return apiError(429, `You have raised ${MAX_REPORTS_PER_DAY} reports today, which is the most for one day. Try again tomorrow.`);
    }

    const { data, error } = await admin
      .from("bug_reports")
      .insert({ student_id: auth.account.id, title, description, path, app_build: build, context })
      .select("id, number")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data.id, number: data.number });
  } catch (err) {
    return errorResponse(err, "bug-reports POST", "Couldn't send the report. Check your connection and try again.");
  }
}

/** The caller's own recent reports; an admin asking with ?all=1 gets everyone's, with who raised them. */
export async function GET(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const wantsAll = new URL(request.url).searchParams.get("all") === "1";
  if (wantsAll && auth.account.role !== "admin") return apiError(403, "Only an admin can see everyone's reports.");

  try {
    const admin = createAdminClient();
    let query = admin
      .from("bug_reports")
      .select("id, number, title, status, created_at, path, resolution, students(email, full_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!wantsAll) query = query.eq("student_id", auth.account.id).limit(30);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ reports: data });
  } catch (err) {
    return errorResponse(err, "bug-reports GET", "Couldn't load the reports. Reload the page to try again.");
  }
}
