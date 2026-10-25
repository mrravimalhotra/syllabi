"use client";

import { useEffect, useState } from "react";
import { AccountRow, MAX_QUOTA } from "@/app/admin/students/_parts/AccountRow";
import { GuestForm, type Account } from "@/app/admin/students/_parts/GuestForm";
import { Alert, PageHeader, PageSkeleton, card, cx } from "@/components/ui";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import type { Student } from "@/types/database";

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
  async function change(account: Account, updates: Partial<Student> | { extend_days: number }, done: string) {
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

      <GuestForm
        onStart={() => {
          setError(null);
          setNotice(null);
        }}
        onError={setError}
        onMade={(account) => setAccounts((prev) => [account, ...prev])}
      />

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
            {accounts.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                busy={busy === a.id}
                onRole={(role) => change(a, { role }, role === "admin" ? "is now an admin." : "is now a parent or tutor.")}
                onQuota={(text) => setQuota(a, text)}
                onAccess={() => setAccess(a)}
                onExtend={(days) => change(a, { extend_days: days }, `can sign in for ${days} more days.`)}
              />
            ))}
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
