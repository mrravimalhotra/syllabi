"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/students", label: "Accounts" },
  { href: "/admin/llm-settings", label: "AI models" },
  { href: "/admin/health", label: "Health check" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-900"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
