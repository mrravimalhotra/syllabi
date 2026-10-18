// A small log of problems, kept in the database so the admin can read it in
// Admin → Health. Logging must never cause a failure of its own: every error
// here is swallowed.

import { createAdminClient } from "@/lib/supabase/admin";

const MAX_PER_MINUTE = 30;
let windowStart = 0;
let inWindow = 0;

/** Text with anything that looks like a key or token blanked out, and cut to a sensible length. */
function scrub(text: string, max: number): string {
  return text
    .replace(/AIza[\w-]{10,}/g, "[key]")
    .replace(/sb_(secret|publishable)_[\w-]+/g, "[key]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[key]")
    .replace(/gsk_[\w-]{10,}/g, "[key]")
    .slice(0, max);
}

function errorSummary(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

export async function logError(entry: { source: "server" | "browser"; context: string; error: unknown; path?: string; studentId?: string }): Promise<void> {
  try {
    // A burst of the same failure (e.g. every page of a book) must not flood the table.
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      inWindow = 0;
    }
    if (++inWindow > MAX_PER_MINUTE) return;

    await createAdminClient()
      .from("error_log")
      .insert({
        source: entry.source,
        context: scrub(entry.context, 120),
        message: scrub(errorSummary(entry.error), 600),
        path: entry.path ? scrub(entry.path, 200) : null,
        student_id: entry.studentId ?? null,
      });
  } catch {
    // Nothing more can be done; the console already has the detail.
  }
}
