"use client";

import { useState } from "react";
import type { Account } from "@/app/admin/students/_parts/GuestForm";
import { Badge, button, cx, input } from "@/components/ui";
import type { Student } from "@/types/database";

/** The biggest monthly allowance an admin can type. */
export const MAX_QUOTA = 100_000_000;

interface Props {
  account: Account;
  /** This account is being changed right now. */
  busy: boolean;
  onRole: (role: Student["role"]) => void;
  onQuota: (text: string) => void;
  onAccess: () => void;
  /** Gives a guest login more days. */
  onExtend: (days: number) => void;
}

const EXTEND_CHOICES = [7, 30, 90];
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** When a guest login ends (or ended), and how to give it more days. */
function GuestTime({ until, name, busy, onExtend }: { until: string; name: string; busy: boolean; onExtend: (days: number) => void }) {
  const [days, setDays] = useState(EXTEND_CHOICES[0]);
  // The time when the row was shown; enough to tell an ended login from a running one.
  const [shownAt] = useState(() => Date.now());
  const ended = Date.parse(until) <= shownAt;
  return (
    <div className="mt-1 space-y-1">
      <p className={cx("text-xs", ended ? "font-medium text-red-700" : "text-slate-500")}>
        {ended ? `Guest, ended on ${shortDate(until)}: can't sign in` : `Guest, signs in until ${shortDate(until)}`}
      </p>
      <div className="flex items-center gap-1">
        <select
          aria-label={`More days for ${name}`}
          value={days}
          disabled={busy}
          onChange={(e) => setDays(Number(e.target.value))}
          className={cx(input, "w-auto py-1 text-xs")}
        >
          {EXTEND_CHOICES.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={() => onExtend(days)} className={button.small}>
          {ended ? "Turn on again" : "Extend"}
        </button>
      </div>
    </div>
  );
}

/** One account: who they are, whether they can sign in, their role, their monthly allowance and used so far, and the button to grant or remove access. */
export function AccountRow({ account: a, busy, onRole, onQuota, onAccess, onExtend }: Props) {
  const name = a.full_name ?? a.email;
  return (
    <tr key={a.id} className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{a.full_name ?? "Name not set"}</p>
        <p className="text-xs text-slate-500">{a.email}</p>
        {a.account_type && <p className="text-xs text-slate-400 capitalize">{a.account_type}</p>}
      </td>
      <td className="px-4 py-3">
        <Badge tone={a.active ? "success" : "warning"}>{a.active ? "Can sign in" : "Not approved or removed"}</Badge>
        {a.guest_until && <GuestTime until={a.guest_until} name={name} busy={busy} onExtend={onExtend} />}
      </td>
      <td className="px-4 py-3">
        <select
          aria-label={`Role of ${name}`}
          value={a.role}
          disabled={busy}
          onChange={(e) => onRole(e.target.value as Student["role"])}
          className={cx(input, "w-auto py-1.5 text-xs")}
        >
          <option value="student">Parent or tutor</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <p className="text-xs text-slate-700 tabular-nums">
          {a.monthly_usage.toLocaleString("en-IN")} of {a.token_quota.toLocaleString("en-IN")} used
        </p>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_QUOTA}
          step={1000}
          aria-label={`Monthly limit in tokens for ${name}`}
          defaultValue={a.token_quota}
          key={`${a.id}-${a.token_quota}`}
          disabled={busy}
          onBlur={(e) => onQuota(e.target.value)}
          className={cx(input, "mt-1 w-32 py-1.5 text-xs")}
        />
      </td>
      <td className="px-4 py-3">
        <button type="button" onClick={onAccess} disabled={busy} className={a.active ? button.smallDanger : button.smallPrimary}>
          {a.active ? "Remove access" : "Grant access"}
        </button>
      </td>
    </tr>
  );
}
