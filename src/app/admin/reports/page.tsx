"use client";

import { useEffect, useState } from "react";
import { ReportDetail } from "@/app/admin/reports/_parts/ReportDetail";
import { Alert, Badge, EmptyState, PageHeader, PageSkeleton, card, cx } from "@/components/ui";
import { BugIcon } from "@/components/icons";
import { STATUS_LABELS, statusLabel, type BugStatus } from "@/lib/bug-report";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

interface Row {
  id: string;
  number: number;
  title: string;
  status: BugStatus;
  created_at: string;
  path: string;
  students: { email: string; full_name: string | null } | null;
}

const TONE: Record<BugStatus, "danger" | "warning" | "success" | "neutral"> = {
  open: "danger",
  working: "warning",
  fixed: "success",
  wontfix: "neutral",
};

/** Problem reports raised from any screen: open one to see what the person did, and copy it to be fixed. */
export default function ReportsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<BugStatus | "all">("all");

  useEffect(() => {
    fetch("/api/bug-reports?all=1")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the reports.");
        setRows(data.reports);
      })
      .catch((err) =>
        setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't load the reports."),
      );
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!rows) return <PageSkeleton rows={3} />;
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const open = rows.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Problem reports"
        description={`Tickets raised with the Report a problem button. ${open} open. Open one, press Copy ticket for Claude, and paste it into the chat to get it fixed.`}
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(["all", "open", "working", "fixed", "wontfix"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cx(
              "rounded-full border px-3 py-1 text-xs",
              filter === f ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600",
            )}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<BugIcon className="h-6 w-6" />} title="No reports" description="Nothing has been reported here yet." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <ul className={cx(card, "divide-y divide-slate-100 self-start overflow-hidden")}>
            {shown.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r.id)}
                  aria-current={selected === r.id}
                  className={cx("w-full px-4 py-3 text-left hover:bg-slate-50", selected === r.id && "bg-brand-50")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      #{r.number} {r.title}
                    </span>
                    <Badge tone={TONE[r.status]}>{statusLabel(r.status)}</Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {r.students?.email ?? "unknown"} · {r.path || "—"} ·{" "}
                    {new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div>
            {selected ? (
              <ReportDetail
                key={selected}
                id={selected}
                onChanged={(id, status) => setRows((prev) => prev && prev.map((r) => (r.id === id ? { ...r, status } : r)))}
              />
            ) : (
              <p className="text-sm text-slate-500">Choose a report to read it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
