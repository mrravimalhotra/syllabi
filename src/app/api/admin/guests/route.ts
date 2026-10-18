import { NextResponse } from "next/server";
import { apiError, authenticateAdmin, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGuestRequest, refusedLoginMessage, type GuestRequest } from "@/lib/guest-request";

type Admin = ReturnType<typeof createAdminClient>;

/** Removes a login whose account row could not be made, so none is left behind. */
const removeLogin = (admin: Admin, userId: string) => admin.auth.admin.deleteUser(userId).catch((e) => console.error("[admin/guests] cleanup", e));

/** Makes the login and its account row. Returns the row, or a response when the person should be told why not. */
async function createGuest(admin: Admin, guest: GuestRequest, state: { userId: string | null }) {
  const { loginId, email, password, days, allowance, name } = guest;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    const refused = refusedLoginMessage(created.error?.message ?? "", Boolean(loginId));
    if (refused) return apiError(400, refused);
    throw created.error ?? new Error("The login was not created");
  }
  state.userId = created.data.user.id;

  const { data, error } = await admin
    .from("students")
    .insert({
      id: state.userId,
      email,
      full_name: name || "Guest",
      role: "student",
      account_type: "parent",
      adult_confirmed_at: new Date().toISOString(),
      active: true,
      token_quota: allowance,
      guest_until: new Date(Date.now() + days * 86_400_000).toISOString(),
      login_id: loginId || null,
    })
    .select()
    .single();
  if (error?.code === "23505" && loginId) {
    await removeLogin(admin, state.userId);
    return apiError(400, "That user ID is already taken. Choose another.");
  }
  if (error || !data) throw error ?? new Error("The account row was not created");
  return NextResponse.json({ account: data, password: loginId ? null : password });
}

/**
 * Makes a guest login: an account that works while sign-ups are closed, has
 * its own small monthly allowance, and expires by itself. Two kinds:
 *  - by email: a random password is made and returned once;
 *  - by user ID ("guest"): the admin chooses a fixed password, and the guest signs
 *    in with the ID and that password (no email needed).
 * Syllabi doesn't keep the password.
 * Body: { email | loginId + password, days, allowance, name? }.
 */
export async function POST(request: Request) {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;

  const parsed = parseGuestRequest(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(400, parsed.message);

  const admin = createAdminClient();
  const state: { userId: string | null } = { userId: null };
  try {
    return await createGuest(admin, parsed.value, state);
  } catch (err) {
    // Don't leave a login without an account behind.
    if (state.userId) await removeLogin(admin, state.userId);
    return errorResponse(err, "admin/guests POST", "Couldn't make the guest account. Try again in a moment.");
  }
}
