"use client";

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
}

/** One account: who they are, whether they can sign in, their role, their monthly allowance and used so far, and the button to grant or remove access. */
export function AccountRow({ account: a, busy, onRole, onQuota, onAccess }: Props) {
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
        {a.guest_until && (
          <p className="mt-1 text-xs text-slate-500">
            Guest, signs in until {new Date(a.guest_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </p>
        )}
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
