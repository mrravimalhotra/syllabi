import { NextResponse } from "next/server";
import { authenticateAdmin, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

/** The most recent problems the app logged (newest first), after clearing out old ones. */
export async function GET() {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;

  try {
    const db = createAdminClient();
    const { error: purgeError } = await db.rpc("purge_error_log");
    if (purgeError) console.error("[admin/errors] purge", purgeError);
    const { data, error } = await db
      .from("error_log")
      .select("id, created_at, source, context, message, path")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ errors: data });
  } catch (err) {
    return errorResponse(err, "admin/errors", "Couldn't load the error log. Try again in a moment.");
  }
}
