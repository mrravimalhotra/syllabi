import { NextResponse } from "next/server";
import { apiError, authenticate } from "@/lib/api";
import { logError } from "@/lib/error-log";

/** A screen crashed in the caller's browser: save a short note for the admin. */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return apiError(400, "The error report couldn't be read.");
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

  await logError({
    source: "browser",
    context: text(body.where, 100) || "screen crash",
    error: text(body.message, 600) || "No message",
    path: text(body.path, 200),
    studentId: auth.account.id,
  });
  return NextResponse.json({ ok: true });
}
