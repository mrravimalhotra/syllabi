// Who is making this request, with the slow parts remembered for a moment.
// Every page and API call needs to know the signed-in person and their
// account row; doing both from scratch each time made moving between screens
// slow. Both are kept per server instance for a short time:
//   - the person: until the sign-in token expires (it was verified once);
//   - the account row: 10 seconds, so turning an account off still takes
//     effect almost at once. Changes made by this server forget it straight away.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Student } from "@/types/database";

const ACCOUNT_ROW_TTL_MS = 10_000;
const MAX_ENTRIES = 500;

const verified = new Map<string, { userId: string; until: number }>();
const rows = new Map<string, { student: Student; until: number }>();

function remember<T>(map: Map<string, T>, key: string, value: T) {
  if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value!);
  map.set(key, value);
}

/** The signed-in person's id, or null if signed out. Verifies the token once, then trusts it until it expires. */
export async function identify(supabase: SupabaseClient): Promise<string | null> {
  // Reading the session only looks at the cookie (it refreshes an expired token, which is what we want).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;

  const hit = verified.get(token);
  if (hit && hit.until > Date.now()) return hit.userId;

  const { data } = await supabase.auth.getClaims(token);
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) return null;
  const expires = typeof data?.claims?.exp === "number" ? data.claims.exp * 1000 : Date.now() + 60_000;
  remember(verified, token, { userId, until: Math.min(expires, Date.now() + 5 * 60_000) });
  return userId;
}

/** The cached account row, if fresh. */
export function cachedStudent(userId: string): Student | null {
  const hit = rows.get(userId);
  return hit && hit.until > Date.now() ? hit.student : null;
}

export function rememberStudent(student: Student) {
  remember(rows, student.id, { student, until: Date.now() + ACCOUNT_ROW_TTL_MS });
}

/** Call after changing an account, so the next request reads the new values. */
export function forgetStudent(userId: string) {
  rows.delete(userId);
}
