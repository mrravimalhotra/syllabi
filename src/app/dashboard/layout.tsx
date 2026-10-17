import Link from "next/link";
import { getCurrentStudent } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const student = await getCurrentStudent();

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Syllabi</p>
            <p className="truncate text-xs text-slate-500">{student?.full_name ?? student?.email}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
              Generate
            </Link>
            <Link href="/dashboard/library" className="text-sm text-slate-500 hover:text-slate-900">
              My books
            </Link>
            <Link href="/dashboard/documents" className="text-sm text-slate-500 hover:text-slate-900">
              My Documents
            </Link>
            <Link href="/dashboard/account" className="text-sm text-slate-500 hover:text-slate-900">
              Account
            </Link>
            {student?.role === "admin" && (
              <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
                Admin
              </Link>
            )}
            <form action={signOut}>
              <button className="text-sm text-slate-500 hover:text-slate-900">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
