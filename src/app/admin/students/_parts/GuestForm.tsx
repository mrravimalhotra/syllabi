"use client";

import { useState } from "react";
import { Field, button, card, cx, input } from "@/components/ui";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import type { Student } from "@/types/database";

export type Account = Student & { monthly_usage: number };

interface Props {
  /** The admin is about to make a guest: clear the messages above. */
  onStart: () => void;
  onError: (message: string) => void;
  /** The guest was made; add it to the list. */
  onMade: (account: Account) => void;
}

/** "Add a guest": a temporary login made with a user ID and a chosen password, or with an email and a made-up one. */
export function GuestForm({ onStart, onError, onMade }: Props) {
  const [guest, setGuest] = useState({ byId: true, loginId: "", password: "", email: "", name: "", days: "14", allowance: "20000" });
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<{ who: string; password: string | null; until: string } | null>(null);

  async function makeGuest(e: React.FormEvent) {
    e.preventDefault();
    onStart();
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
      onMade({ ...data.account, monthly_usage: 0 });
      setMade({ who: data.account.login_id ?? data.account.email, password: data.password, until: data.account.guest_until });
      setGuest((g) => ({ ...g, loginId: "", password: "", email: "", name: "" }));
    } catch (err) {
      onError(
        err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't make the guest account. Try again."
      );
    } finally {
      setMaking(false);
    }
  }

  return (
    <form onSubmit={makeGuest} className={cx(card, "space-y-3 p-4 sm:p-5")}>
      <div>
        <h2 className="text-base font-semibold text-slate-900">Add a guest</h2>
        <p className="text-sm text-slate-500">
          A temporary login for a reviewer, tester or visitor. It works while sign-ups are closed, has its own small monthly allowance, and
          stops working by itself.
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
              <input
                id="guest-id"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={3}
                maxLength={30}
                value={guest.loginId}
                onChange={(e) => setGuest({ ...guest, loginId: e.target.value })}
                className={input}
              />
            </Field>
            <Field label="Password (at least 6 characters)" htmlFor="guest-password">
              <input
                id="guest-password"
                required
                autoComplete="off"
                minLength={6}
                maxLength={72}
                value={guest.password}
                onChange={(e) => setGuest({ ...guest, password: e.target.value })}
                className={input}
              />
            </Field>
          </>
        ) : (
          <Field label="Guest's email" htmlFor="guest-email">
            <input
              id="guest-email"
              type="email"
              required
              value={guest.email}
              onChange={(e) => setGuest({ ...guest, email: e.target.value })}
              className={input}
            />
          </Field>
        )}
        <Field label="Name (optional)" htmlFor="guest-name">
          <input
            id="guest-name"
            value={guest.name}
            maxLength={120}
            onChange={(e) => setGuest({ ...guest, name: e.target.value })}
            className={input}
          />
        </Field>
        <Field label="Works for (days)" htmlFor="guest-days">
          <input
            id="guest-days"
            type="number"
            min={1}
            max={3650}
            required
            value={guest.days}
            onChange={(e) => setGuest({ ...guest, days: e.target.value })}
            className={input}
          />
        </Field>
        <Field label="Monthly allowance (tokens)" htmlFor="guest-allowance">
          <input
            id="guest-allowance"
            type="number"
            min={1000}
            max={1000000}
            step={1000}
            required
            value={guest.allowance}
            onChange={(e) => setGuest({ ...guest, allowance: e.target.value })}
            className={input}
          />
        </Field>
      </div>
      <button type="submit" disabled={making} className={button.primary}>
        {making ? "Making the guest login..." : "Make guest login"}
      </button>
      {made && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">
            {made.password
              ? "Guest login ready. Copy it now: the password is shown only once."
              : "Guest login ready. The guest signs in with this user ID and the password you chose."}
          </p>
          <p className="mt-1">
            {made.password ? "Email" : "User ID"}: <span className="font-mono">{made.who}</span>
          </p>
          {made.password && (
            <p>
              Password: <span className="font-mono">{made.password}</span>
            </p>
          )}
          <p className="text-xs">
            Stops working on {new Date(made.until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
          </p>
          <button
            type="button"
            className={cx(button.small, "mt-2")}
            onClick={() =>
              void navigator.clipboard?.writeText(
                `${made.password ? "Email" : "User ID"}: ${made.who}${made.password ? `\nPassword: ${made.password}` : ""}`
              )
            }
          >
            {made.password ? "Copy email and password" : "Copy user ID"}
          </button>
        </div>
      )}
    </form>
  );
}
