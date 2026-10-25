import { isUuid } from "@/lib/validate";

// Upper bound for a monthly token quota (keeps the value a sane integer).
const MAX_QUOTA = 1_000_000_000;
// The most days a guest login can be extended by at once.
const MAX_EXTEND_DAYS = 365;

export interface AccountUpdate {
  id: string;
  updates: { active?: boolean; role?: "student" | "admin"; token_quota?: number };
  /** Days to add to a guest login's end date (counted from today when it has already ended). */
  extendDays?: number;
}

/** A guest's new end date: `days` after the later of now and the current end. */
export function extendedGuestUntil(current: string, days: number, now = Date.now()): string {
  return new Date(Math.max(now, Date.parse(current)) + days * 86_400_000).toISOString();
}

/** Checks an admin's change to an account (switch off, role, monthly allowance, more days for a guest). Anything else in the body is ignored. */
export function parseAccountUpdate(body: unknown): { ok: true; value: AccountUpdate } | { ok: false; message: string } {
  const b = body as { id?: unknown; active?: unknown; role?: unknown; token_quota?: unknown; extend_days?: unknown } | null;
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
  let extendDays: number | undefined;
  if (b.extend_days !== undefined) {
    const days = b.extend_days;
    if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > MAX_EXTEND_DAYS) {
      return { ok: false, message: `Choose how many more days the guest can sign in: a whole number from 1 to ${MAX_EXTEND_DAYS}.` };
    }
    extendDays = days;
  }
  if (Object.keys(updates).length === 0 && extendDays === undefined) return { ok: false, message: "There was nothing to change." };
  return { ok: true, value: { id: b.id, updates, ...(extendDays ? { extendDays } : {}) } };
}
