import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { AdminTabs } from "@/components/AdminTabs";
import { ChevronLeftIcon, LogoutIcon } from "@/components/icons";
import { Badge, Logo, button } from "@/components/ui";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
            <Logo className="h-7 w-7" /> Syllabi
          </Link>
          <Badge tone="brand">Admin</Badge>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <span className="hidden max-w-48 truncate px-2 text-sm text-slate-500 lg:inline">{admin.email}</span>
            <Link href="/dashboard" className={button.ghost}>
              <ChevronLeftIcon className="h-4 w-4" /> App
            </Link>
            <form action={signOut}>
              <button className={button.icon} aria-label="Sign out" title="Sign out">
                <LogoutIcon className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
        <AdminTabs />
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
