import Link from "next/link";
import { getCurrentStudent } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const student = await getCurrentStudent();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Syllabi</p>
            <p className="text-xs text-slate-500">{student?.full_name ?? student?.email}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
              Generate
            </Link>
            <Link href="/dashboard/library" className="text-sm text-slate-500 hover:text-slate-900">
              My books
            </Link>
            <Link href="/dashboard/documents" className="text-sm text-slate-500 hover:text-slate-900">
              My Documents
            </Link>
            {student?.role === "admin" && (
              <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
                Admin
              </Link>
            )}
            <form action={signOut}>
              <button className="text-sm text-slate-500 hover:text-slate-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
