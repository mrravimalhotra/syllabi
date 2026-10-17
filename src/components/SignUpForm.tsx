"use client";

import { useState } from "react";
import { signUp } from "@/lib/actions/auth";
import { PasswordInput } from "@/components/PasswordInput";

export function SignUpForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <form action={signUp} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="full_name">
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-slate-700">I am a</legend>
        <div className="mt-1 flex gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input type="radio" name="account_type" value="parent" required /> Parent or guardian
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="account_type" value="tutor" required /> Tutor or teacher
          </label>
        </div>
      </fieldset>

      <PasswordInput
        name="password"
        label="Password"
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
        error={mismatch ? "Passwords do not match" : undefined}
      />

      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" name="adult_confirmed" value="yes" required className="mt-1" />
        <span>
          I am 18 or older. I will use Syllabi myself to prepare study material for my child or
          students, and I will not let anyone under 18 use my account.
        </span>
      </label>

      <button
        type="submit"
        disabled={mismatch}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Sign up
      </button>
    </form>
  );
}
