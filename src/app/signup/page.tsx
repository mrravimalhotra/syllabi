import { SignUpForm } from "@/components/SignUpForm";
import { signupsOpen } from "@/lib/access";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            For parents and tutors (18+) preparing study material for their children or students.
            An admin will need to approve your access before you can sign in.
          </p>
          {!signupsOpen() && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Private testing: sign-ups are currently limited to the Syllabi team.
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <SignUpForm />

        <p className="text-center text-sm text-slate-500">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-slate-900 underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
