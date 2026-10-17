import { signOut } from "@/lib/actions/auth";
import { signupsOpen } from "@/lib/access";

export default function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Awaiting approval</h1>
        <p className="text-sm text-slate-500">
          {signupsOpen()
            ? "Your account has been created but is not yet active. An admin needs to grant you access — check back soon."
            : "Syllabi is in private testing. Access will open to parents and tutors soon."}
        </p>
        <form action={signOut}>
          <button className="text-sm font-medium text-slate-900 underline">Sign out</button>
        </form>
      </div>
    </div>
  );
}
