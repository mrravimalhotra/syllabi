// A stand-in for Supabase's cookie-based sign-in client, for testing the
// request gate (middleware): who is signed in is set by the test.
import { fakeAdmin } from "./db";

export const ssrState: { token: string | null; sub: string } = { token: null, sub: "" };

export function createServerClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: ssrState.token ? { access_token: ssrState.token } : null } }),
      getClaims: async () => ({ data: { claims: { sub: ssrState.sub, exp: Math.floor(Date.now() / 1000) + 600 } } }),
    },
    from: (table: string) => fakeAdmin.from(table),
  };
}
