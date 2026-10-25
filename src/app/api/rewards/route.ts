import { NextResponse } from "next/server";
import { authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRewardsSync } from "@/lib/rewards";

/**
 * Adds a device's new stars and days played to the account's star chart and returns the
 * chart, so every device shows the same one. A device whose chart belonged to another
 * account adds nothing (it takes this account's chart instead).
 */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;

  const sync = parseRewardsSync(await request.json().catch(() => null));
  const own = sync.owner === null || sync.owner === student.id;
  const { data, error } = await createAdminClient().rpc("add_rewards", {
    p_student_id: student.id,
    p_stars: own ? sync.stars : 0,
    p_days: own ? sync.days : [],
  });
  if (error) return errorResponse(error, "rewards POST", "Couldn't save the stars. They are kept on this device and saved next time.");
  const row = (Array.isArray(data) ? data[0] : data) as { stars: number; days: string[] } | undefined;
  return NextResponse.json({ owner: student.id, stars: row?.stars ?? 0, days: row?.days ?? [] });
}
