"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/ui";
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

  const [guest, setGuest] = useState({ byId: true, loginId: "", password: "", email: "", name: "", days: "14", allowance: "20000" });
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<{ who: string; password: string | null; until: string } | null>(null);

  async function makeGuest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setMade(null);
    setMaking(true);
    try {
      const res = await fetch("/api/admin/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(guest.byId ? { loginId: guest.loginId, password: guest.password } : { email: guest.email }),
          name: guest.name,
          days: Number(guest.days),
          allowance: Number(guest.allowance),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "make the guest account"));
      setAccounts((prev) => [{ ...data.account, monthly_usage: 0 }, ...prev]);
      setMade({ who: data.account.login_id ?? data.account.email, password: data.password, until: data.account.guest_until });
      setGuest((g) => ({ ...g, loginId: "", password: "", email: "", name: "" }));
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't make the guest account. Try again.");
    } finally {
      setMaking(false);
    }
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

      <form onSubmit={makeGuest} className={cx(card, "space-y-3 p-4 sm:p-5")}>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Add a guest</h2>
          <p className="text-sm text-slate-500">
            A temporary login for a reviewer, tester or visitor. It works while sign-ups are closed, has its own small monthly allowance, and stops working by itself.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="space-y-1 sm:col-span-2">
            <legend className="text-sm font-medium text-slate-700">How does the guest sign in?</legend>
            <label className="mr-4 inline-flex items-center gap-2 text-sm">
              <input type="radio" name="guest-kind" checked={guest.byId} onChange={() => setGuest({ ...guest, byId: true })} />
              User ID and a password you choose (no email)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="guest-kind" checked={!guest.byId} onChange={() => setGuest({ ...guest, byId: false })} />
              Email, with a made-up password
            </label>
          </fieldset>
          {guest.byId ? (
            <>
              <Field label="User ID (for example guest)" htmlFor="guest-id">
                <input id="guest-id" required autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={3} maxLength={30} value={guest.loginId} onChange={(e) => setGuest({ ...guest, loginId: e.target.value })} className={input} />
              </Field>
              <Field label="Password (at least 6 characters)" htmlFor="guest-password">
                <input id="guest-password" required autoComplete="off" minLength={6} maxLength={72} value={guest.password} onChange={(e) => setGuest({ ...guest, password: e.target.value })} className={input} />
              </Field>
            </>
          ) : (
            <Field label="Guest's email" htmlFor="guest-email">
              <input id="guest-email" type="email" required value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} className={input} />
            </Field>
          )}
          <Field label="Name (optional)" htmlFor="guest-name">
            <input id="guest-name" value={guest.name} maxLength={120} onChange={(e) => setGuest({ ...guest, name: e.target.value })} className={input} />
          </Field>
          <Field label="Works for (days)" htmlFor="guest-days">
            <input id="guest-days" type="number" min={1} max={3650} required value={guest.days} onChange={(e) => setGuest({ ...guest, days: e.target.value })} className={input} />
          </Field>
          <Field label="Monthly allowance (tokens)" htmlFor="guest-allowance">
            <input id="guest-allowance" type="number" min={1000} max={1000000} step={1000} required value={guest.allowance} onChange={(e) => setGuest({ ...guest, allowance: e.target.value })} className={input} />
          </Field>
        </div>
        <button type="submit" disabled={making} className={button.primary}>
          {making ? "Making the guest login..." : "Make guest login"}
        </button>
        {made && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-medium">{made.password ? "Guest login ready. Copy it now: the password is shown only once." : "Guest login ready. The guest signs in with this user ID and the password you chose."}</p>
            <p className="mt-1">{made.password ? "Email" : "User ID"}: <span className="font-mono">{made.who}</span></p>
            {made.password && <p>Password: <span className="font-mono">{made.password}</span></p>}
            <p className="text-xs">Stops working on {new Date(made.until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.</p>
            <button type="button" className={cx(button.small, "mt-2")} onClick={() => void navigator.clipboard?.writeText(`${made.password ? "Email" : "User ID"}: ${made.who}${made.password ? `\nPassword: ${made.password}` : ""}`)}>
              {made.password ? "Copy email and password" : "Copy user ID"}
            </button>
          </div>
        )}
      </form>

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
                    {a.guest_until && (
                      <p className="mt-1 text-xs text-slate-500">
                        Guest, signs in until{" "}
                        {new Date(a.guest_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    )}
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
