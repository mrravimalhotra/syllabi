"use client";

import { useState } from "react";
import { signUp } from "@/lib/actions/auth";
import { PasswordInput } from "@/components/PasswordInput";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, cx, input, label } from "@/components/ui";

const ACCOUNT_TYPES = [
  { value: "parent", title: "Parent or guardian", detail: "Helping my own child" },
  { value: "tutor", title: "Tutor or teacher", detail: "Helping my students" },
];

export function SignUpForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <form action={signUp} className="space-y-4">
      <Field label="Your full name" htmlFor="full_name" hint="Your own name, shown on printouts. You don't need to enter your child's name.">
        <input id="full_name" name="full_name" type="text" autoComplete="name" required className={input} />
      </Field>
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className={input} />
      </Field>

      <fieldset>
        <legend className={label}>I am a</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {ACCOUNT_TYPES.map((t) => (
            <label
              key={t.value}
              className={cx(
                "cursor-pointer rounded-xl border border-slate-300 p-3 transition",
                "has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:ring-1 has-[:checked]:ring-brand-500",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500"
              )}
            >
              <input type="radio" name="account_type" value={t.value} required className="sr-only" />
              <span className="block text-sm font-medium text-slate-900">{t.title}</span>
              <span className="block text-xs text-slate-500">{t.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <PasswordInput
        name="password"
        label="Password (at least 8 characters)"
        autoComplete="new-password"
        minLength={8}
        required
        value={password}
        onChange={setPassword}
      />

      <PasswordInput
        name="confirm_password"
        label="Confirm password"
        autoComplete="new-password"
        minLength={8}
        required
        value={confirmPassword}
        onChange={setConfirmPassword}
        error={mismatch ? "The two passwords don't match." : undefined}
      />

      <label className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        <input type="checkbox" name="adult_confirmed" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
        <span>
          I am 18 or older. I will use Syllabi myself to prepare study material for my child or students, and I will
          not let anyone under 18 use my account.
        </span>
      </label>

      <SubmitButton pendingLabel="Creating account..." disabled={mismatch}>
        Create account
      </SubmitButton>
    </form>
  );
}
