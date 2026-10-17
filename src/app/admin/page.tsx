import { createAdminClient } from "@/lib/supabase/admin";

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
    { label: "Pending approval", value: pendingCount ?? 0 },
    { label: "Total accounts", value: studentCount ?? 0 },
    { label: "Books (all accounts)", value: documentCount ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Overview</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-2xl font-semibold text-slate-900">{c.value}</p>
            <p className="mt-1 text-sm text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        Use the nav above to grant student access, manage the school/grade/subject taxonomy,
        upload source material into the RAG knowledge base, and configure which LLM provider
        serves each task type.
      </p>
    </div>
  );
}
