"use client";

import { useState } from "react";
import { GuestFields, type GuestValues } from "@/app/admin/students/_parts/GuestFields";
import { GuestMade, type MadeGuest } from "@/app/admin/students/_parts/GuestMade";
import { button, card, cx } from "@/components/ui";
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
  const [guest, setGuest] = useState<GuestValues>({ byId: true, loginId: "", password: "", email: "", name: "", days: "14", allowance: "20000" });
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<MadeGuest | null>(null);

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
      <GuestFields guest={guest} onChange={(patch) => setGuest((g) => ({ ...g, ...patch }))} />
      <button type="submit" disabled={making} className={button.primary}>
        {making ? "Making the guest login..." : "Make guest login"}
      </button>
      {made && <GuestMade made={made} />}
    </form>
  );
}
