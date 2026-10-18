// One way for every API route to check who is calling and to turn failures
// into JSON the app can show: { error: "a sentence for the person", ...extra }.
// Status codes mean the same thing everywhere:
//   400 the request is wrong      401 signed out        403 not allowed
//   404 not found                 422 understood but can't be done (e.g. the AI declined)
//   429 allowance or rate limit   503 a service we depend on is busy or down
//   500 our own bug or failure

import { NextResponse } from "next/server";
import { DatabaseUnavailableError, NotAdminError, getCurrentStudent, requireAdmin } from "@/lib/auth";
import { canUseApp } from "@/lib/access";
import { BlockedReplyError, DAILY_LIMIT, errorText, userMessage } from "@/lib/errors";
import { QuotaExceededError } from "@/lib/quota";
import { logError } from "@/lib/error-log";
import type { Student } from "@/types/database";

export function apiError(status: number, message: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

const SIGNED_OUT_MESSAGE = "Your session has ended. Please sign in again.";
const NO_ACCESS_MESSAGE = "Your account doesn't have access right now. Contact the person who runs Syllabi for you.";

/** The HTTP status that fits an error, for messages already chosen by userMessage. */
function statusFor(err: unknown): number {
  if (err instanceof QuotaExceededError) return 429;
  if (err instanceof DatabaseUnavailableError) return 503;
  if (err instanceof NotAdminError) return 403;
  if (err instanceof BlockedReplyError) return 422;
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (DAILY_LIMIT.test(text)) return 429;
  if (/\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|overloaded|UNAVAILABLE/i.test(text)) return 503;
  return 500;
}

/**
 * The JSON response for a failure: a sentence the person can act on (via
 * userMessage, which logs the detail for us), and the fitting status.
 */
export function errorResponse(err: unknown, context: string, fallback?: string, more: Record<string, unknown> = {}): NextResponse {
  const status = statusFor(err);
  // Our own failures (not the person's mistakes or the AI's limits) go in the admin's error log.
  if (status === 500 || (status === 503 && !(err instanceof DatabaseUnavailableError) && !/\b(429|503)\b|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(errorText(err)))) {
    void logError({ source: "server", context, error: err });
  }
  const extra = { ...(err instanceof QuotaExceededError ? { quota: err.status } : {}), ...more };
  return apiError(status, userMessage(err, context, fallback), extra);
}

/** The signed-in, approved account, or the response to send instead. */
export async function authenticate(): Promise<{ account: Student } | { response: NextResponse }> {
  try {
    const account = await getCurrentStudent();
    if (!account) return { response: apiError(401, SIGNED_OUT_MESSAGE) };
    // During private testing only admins may use the app (the same rule the page guard applies).
    if (!canUseApp(account)) return { response: apiError(403, NO_ACCESS_MESSAGE) };
    return { account };
  } catch (err) {
    return { response: errorResponse(err, "authenticate") };
  }
}

/** The signed-in admin, or the response to send instead. */
export async function authenticateAdmin(): Promise<{ account: Student } | { response: NextResponse }> {
  const auth = await authenticate();
  if ("response" in auth) return auth;
  try {
    return { account: await requireAdmin() };
  } catch (err) {
    return { response: errorResponse(err, "authenticateAdmin") };
  }
}
