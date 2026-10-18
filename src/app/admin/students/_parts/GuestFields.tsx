"use client";

import { Field, input } from "@/components/ui";

/** What the admin fills in for a guest. */
export interface GuestValues {
  byId: boolean;
  loginId: string;
  password: string;
  email: string;
  name: string;
  days: string;
  allowance: string;
}

/** The fields of the guest form: how they sign in, who they are, how long it works and the allowance. */
export function GuestFields({ guest, onChange }: { guest: GuestValues; onChange: (patch: Partial<GuestValues>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <fieldset className="space-y-1 sm:col-span-2">
        <legend className="text-sm font-medium text-slate-700">How does the guest sign in?</legend>
        <label className="mr-4 inline-flex items-center gap-2 text-sm">
          <input type="radio" name="guest-kind" checked={guest.byId} onChange={() => onChange({ byId: true })} />
          User ID and a password you choose (no email)
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="radio" name="guest-kind" checked={!guest.byId} onChange={() => onChange({ byId: false })} />
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
              onChange={(e) => onChange({ loginId: e.target.value })}
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
              onChange={(e) => onChange({ password: e.target.value })}
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
            onChange={(e) => onChange({ email: e.target.value })}
            className={input}
          />
        </Field>
      )}
      <Field label="Name (optional)" htmlFor="guest-name">
        <input id="guest-name" value={guest.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} className={input} />
      </Field>
      <Field label="Works for (days)" htmlFor="guest-days">
        <input
          id="guest-days"
          type="number"
          min={1}
          max={3650}
          required
          value={guest.days}
          onChange={(e) => onChange({ days: e.target.value })}
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
          onChange={(e) => onChange({ allowance: e.target.value })}
          className={input}
        />
      </Field>
    </div>
  );
}
