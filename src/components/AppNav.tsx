"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner, PendingIcon } from "@/components/LinkPending";
import { useSyncExternalStore } from "react";
import { signOut } from "@/lib/actions/auth";
import { forgetAll } from "@/lib/client-cache";
import { BookIcon, DocumentIcon, LogoutIcon, ShieldIcon, SparklesIcon, TargetIcon, UserIcon, WifiOffIcon } from "@/components/icons";
import { Logo, button, cx } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Generate", icon: SparklesIcon, exact: true },
  { href: "/dashboard/practice", label: "Practice", icon: TargetIcon },
  { href: "/dashboard/library", label: "My books", icon: BookIcon },
  { href: "/dashboard/documents", label: "My Documents", short: "Documents", icon: DocumentIcon },
  { href: "/dashboard/account", label: "Account", icon: UserIcon },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** A banner while the device is offline, so a failed request isn't a mystery. */
function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-xs font-medium text-amber-900">
      <WifiOffIcon className="h-4 w-4" /> You&apos;re offline. Answers and uploads need a connection.
    </div>
  );
}

/**
 * The app's navigation: a top bar on every screen, plus a bottom tab bar on
 * phones, where it's easiest to reach with a thumb.
 */
export function AppNav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md print:hidden">
        <OfflineBanner />
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:h-16 sm:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
            <Logo className="h-7 w-7" /> Syllabi
          </Link>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  {item.label}
                  <LinkSpinner />
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1">
            {isAdmin && (
              <Link href="/admin" className={button.ghost} title="Admin" aria-label="Admin">
                <ShieldIcon className="h-4.5 w-4.5" />
                <span className="hidden sm:inline">Admin</span>
                <LinkSpinner />
              </Link>
            )}
            <span className="hidden max-w-48 truncate px-2 text-sm text-slate-500 lg:inline" title={name}>
              {name}
            </span>
            <form action={signOut} onSubmit={forgetAll}>
              <button className={button.icon} aria-label="Sign out" title="Sign out">
                <LogoutIcon className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden print:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-medium transition-colors",
                    active ? "text-brand-700" : "text-slate-500"
                  )}
                >
                  <span className={cx("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-brand-50")}>
                    <PendingIcon icon={Icon} className="h-5 w-5" />
                  </span>
                  {item.short ?? item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
