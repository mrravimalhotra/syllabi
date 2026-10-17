import Link from "next/link";
import { Logo, button } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center px-4 text-center">
      <Logo className="h-12 w-12" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">That page doesn&apos;t exist, or the link is out of date. Check the address, or go back to the start.</p>
      <Link href="/dashboard" className={`${button.primary} mt-6`}>
        Back to Syllabi
      </Link>
    </main>
  );
}
