"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, PageHeader, PageSkeleton, button, card, cx, input } from "@/components/ui";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import type { Student } from "@/types/database";

type Account = Student & { monthly_usage: number };

const MAX_QUOTA = 100_000_000;

/** Parents and tutors: who may use Syllabi, their role and their monthly AI allowance. */
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/students")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "load the accounts"));
        setAccounts(data.students);
      })
      .catch((err) => setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't load the accounts. Reload the page."))
      .finally(() => setLoading(false));
  }, []);

  /** Saves a change to one account; `done` says what happened, for the message under the heading. */
  async function change(account: Account, updates: Partial<Student>, done: string) {
    setError(null);
    setNotice(null);
    setBusy(account.id);
    try {
      const res = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, ...updates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? failedRequestMessage(res.status, `update ${account.email}`));
        return false;
      }
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, ...data.student } : a)));
      setNotice(`${account.full_name ?? account.email}: ${done}`);
      return true;
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : "Couldn't save that change. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function setAccess(account: Account) {
    if (account.active) {
      const ok = window.confirm(
        `Remove access for ${account.full_name ?? account.email}? They can no longer use Syllabi. Their books and answers are kept, and you can restore access later.`
      );
      if (!ok) return;
    }
    void change(account, { active: !account.active }, account.active ? "access removed." : "access granted.");
  }

  function setQuota(account: Account, text: string) {
    const value = Number(text);
    if (text.trim() === "" || !Number.isInteger(value) || value < 0 || value > MAX_QUOTA) {
      setError(`The monthly limit must be a whole number from 0 to ${MAX_QUOTA.toLocaleString("en-IN")}. Nothing was changed.`);
      setAccounts((prev) => [...prev]); // put the old number back in the box
      return;
    }
    if (value !== account.token_quota) void change(account, { token_quota: value }, `monthly limit set to ${value.toLocaleString("en-IN")} tokens.`);
  }

  if (loading) return <PageSkeleton rows={2} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts"
        description="Parents and tutors who use Syllabi. Each one has private books, a role, and a monthly allowance of AI tokens (a token is about four letters of text read or written)."
      />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className={cx(card, "overflow-x-auto")}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Accounts with their access, role and monthly allowance</caption>
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Parent or tutor</th>
              <th scope="col" className="px-4 py-2 font-medium">Access</th>
              <th scope="col" className="px-4 py-2 font-medium">Role</th>
              <th scope="col" className="px-4 py-2 font-medium">Used this month / monthly limit (tokens)</th>
              <th scope="col" className="px-4 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
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
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Role of ${name}`}
                      value={a.role}
                      disabled={busy === a.id}
                      onChange={(e) => change(a, { role: e.target.value as Student["role"] }, e.target.value === "admin" ? "is now an admin." : "is now a parent or tutor.")}
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
                      disabled={busy === a.id}
                      onBlur={(e) => setQuota(a, e.target.value)}
                      className={cx(input, "mt-1 w-32 py-1.5 text-xs")}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setAccess(a)} disabled={busy === a.id} className={a.active ? button.smallDanger : button.smallPrimary}>
                      {a.active ? "Remove access" : "Grant access"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No accounts yet. People appear here after they sign up.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
