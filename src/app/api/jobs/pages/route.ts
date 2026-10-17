import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { jobToken, readQueuedPages } from "@/lib/ingestion/jobs";

// Answers at once; reading carries on after the reply for up to this long.
export const maxDuration = 300;

/**
 * Starts a background run that reads queued book pages. Called by the
 * database's timer every minute while pages are waiting, and by a run that
 * is about to reach its time limit. Not for people: it needs the runner's
 * token, which only the database and the server know.
 */
export async function POST(request: Request) {
  const given = request.headers.get("x-job-token") ?? "";
  const token = await jobToken();
  const ok = Boolean(token) && given.length === token!.length && timingSafeEqual(Buffer.from(given), Buffer.from(token!));
  if (!ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const origin = new URL(request.url).origin;
  after(() => readQueuedPages(origin));
  return NextResponse.json({ started: true }, { status: 202 });
}
