import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS. Server-only: never import this from
 * a Client Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("The database settings are missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  }
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
