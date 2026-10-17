import { requestPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your account email and we&apos;ll send you a link to choose a new password.
          </p>
        </div>
        <form action={requestPasswordReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Send reset link
          </button>
        </form>
        <p className="text-center text-sm text-slate-500">
          <a href="/login" className="font-medium text-slate-900 underline">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
