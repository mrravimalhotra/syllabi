import { signIn } from "@/lib/actions/auth";
import { PasswordInput } from "@/components/PasswordInput";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sign in to Syllabi</h1>
          <p className="mt-1 text-sm text-slate-500">Access your study material and generated content.</p>
        </div>

        {message && (
          <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">{message}</p>
        )}
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
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
          <PasswordInput name="password" label="Password" autoComplete="current-password" required />
          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-sm text-slate-500">
          No account?{" "}
          <a href="/signup" className="font-medium text-slate-900 underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
