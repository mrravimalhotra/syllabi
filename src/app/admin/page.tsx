import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, card, cx } from "@/components/ui";

export default async function AdminOverviewPage() {
  const admin = createAdminClient();
  const [{ count: studentCount }, { count: activeCount }, { count: documentCount }, { count: pendingCount }] =
    await Promise.all([
      admin.from("students").select("*", { count: "exact", head: true }),
      admin.from("students").select("*", { count: "exact", head: true }).eq("active", true),
      admin.from("documents").select("*", { count: "exact", head: true }).eq("status", "ready"),
      admin.from("students").select("*", { count: "exact", head: true }).eq("active", false),
    ]);

  const cards = [
    { label: "Active accounts", value: activeCount ?? 0 },
    { label: "Pending approval", value: pendingCount ?? 0, highlight: (pendingCount ?? 0) > 0 },
    { label: "Total accounts", value: studentCount ?? 0 },
    { label: "Books (all accounts)", value: documentCount ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Accounts and books across Syllabi." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {cards.map((c) => (
          <div key={c.label} className={cx("rounded-2xl border p-5 shadow-xs", c.highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
            <p className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{c.value}</p>
            <p className="mt-1 text-sm text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/students" className={cx(card, "group p-5 transition hover:border-brand-300")}>
          <p className="font-medium text-slate-900">Accounts</p>
          <p className="mt-1 text-sm text-slate-500">Grant or revoke access, set roles and monthly limits.</p>
        </Link>
        <Link href="/admin/health" className={cx(card, "group p-5 transition hover:border-brand-300")}>
          <p className="font-medium text-slate-900">Health check</p>
          <p className="mt-1 text-sm text-slate-500">Test the database, Gemini and file storage after a deploy.</p>
        </Link>
        <Link href="/admin/llm-settings" className={cx(card, "group p-5 transition hover:border-brand-300")}>
          <p className="font-medium text-slate-900">AI models</p>
          <p className="mt-1 text-sm text-slate-500">Choose which provider and model handles each task.</p>
        </Link>
      </div>
    </div>
  );
}
