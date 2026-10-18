import { isUuid } from "@/lib/validate";

// Upper bound for a monthly token quota (keeps the value a sane integer).
const MAX_QUOTA = 1_000_000_000;

export interface AccountUpdate {
  id: string;
  updates: { active?: boolean; role?: "student" | "admin"; token_quota?: number };
}

/** Checks an admin's change to an account (switch off, role, monthly allowance). Anything else in the body is ignored. */
export function parseAccountUpdate(body: unknown): { ok: true; value: AccountUpdate } | { ok: false; message: string } {
  const b = body as { id?: unknown; active?: unknown; role?: unknown; token_quota?: unknown } | null;
  if (!b || typeof b.id !== "string" || !isUuid(b.id)) return { ok: false, message: "Choose an account to change." };

  const updates: AccountUpdate["updates"] = {};
  if (typeof b.active === "boolean") updates.active = b.active;
  if (b.role !== undefined) {
    if (b.role !== "student" && b.role !== "admin") return { ok: false, message: 'The role must be "student" or "admin".' };
    updates.role = b.role;
  }
  if (b.token_quota !== undefined) {
    const quota = b.token_quota;
    if (typeof quota !== "number" || !Number.isInteger(quota) || quota < 0 || quota > MAX_QUOTA) {
      return { ok: false, message: `The monthly allowance must be a whole number from 0 to ${MAX_QUOTA.toLocaleString("en-IN")}.` };
    }
    updates.token_quota = quota;
  }
  return Object.keys(updates).length === 0 ? { ok: false, message: "There was nothing to change." } : { ok: true, value: { id: b.id, updates } };
}
