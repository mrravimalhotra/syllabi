import { updatePassword } from "@/lib/actions/auth";
import { PasswordInput } from "@/components/PasswordInput";
import { RESET_ERRORS, pick } from "@/lib/auth-messages";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = pick(RESET_ERRORS, (await searchParams).error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">At least 8 characters.</p>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}{" "}
            {error === RESET_ERRORS["no-session"] && (
              <a href="/forgot-password" className="font-medium underline">
                Send a new link
              </a>
            )}
          </p>
        )}
        <form action={updatePassword} className="space-y-4">
          <PasswordInput name="password" label="New password" autoComplete="new-password" minLength={8} required />
          <PasswordInput
            name="confirm_password"
            label="Confirm new password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button
            type="submit"
            className="min-h-11 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Save new password
          </button>
        </form>
      </div>
    </div>
  );
}
