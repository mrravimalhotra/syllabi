"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChatIcon, ClipboardIcon, DownloadIcon, ListCheckIcon, NotesIcon, SearchIcon, SparklesIcon, TrashIcon } from "@/components/icons";
import { Alert, EmptyState, PageHeader, Skeleton, button, card, cx, input } from "@/components/ui";
import { TASK_LABELS, formatDate } from "@/lib/format";
import type { GeneratedDocumentRow } from "@/types/database";

type Row = Pick<GeneratedDocumentRow, "id" | "title" | "task_type" | "created_at">;

const TASK_ICONS: Record<string, typeof ListCheckIcon> = {
  solution: ListCheckIcon,
  notes: NotesIcon,
  sample_paper: ClipboardIcon,
  ad_hoc: ChatIcon,
};

export default function MyDocumentsPage() {
  const [documents, setDocuments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("all");

  useEffect(() => {
    fetch("/api/documents")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setDocuments(data.documents ?? []);
      })
      .catch(() => setError("Couldn't load your documents. Check your connection and reload the page."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => (type === "all" || d.task_type === type) && (!q || d.title.toLowerCase().includes(q)));
  }, [documents, query, type]);

  // Only offer the filters for kinds of answer the person actually has.
  const types = useMemo(() => [...new Set(documents.map((d) => d.task_type))], [documents]);

  async function remove(doc: Row) {
    if (!window.confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    setError(null);
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Couldn't delete that answer. Please try again.");
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Documents"
        description="Every answer you generate is saved here. Open one to read, print or download it."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-18 rounded-2xl" />
          ))}
        </div>
      ) : documents.length === 0 && !error ? (
        <EmptyState
          icon={<SparklesIcon className="h-6 w-6" />}
          title="No answers yet"
          description="Generate a solution, notes or a sample paper and it will be saved here automatically."
          action={
            <Link href="/dashboard" className={button.primary}>
              Generate your first answer
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title"
                aria-label="Search your documents"
                className={cx(input, "pl-10")}
              />
            </div>
            {types.length > 1 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:pb-0" role="group" aria-label="Filter by kind">
                {["all", ...types].map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={type === t}
                    onClick={() => setType(t)}
                    className={cx(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      type === t
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {t === "all" ? "All" : (TASK_LABELS[t] ?? t)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className={cx(card, "divide-y divide-slate-100 overflow-hidden")}>
            {visible.map((d) => {
              const Icon = TASK_ICONS[d.task_type] ?? SparklesIcon;
              return (
                <li key={d.id} className="group relative flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/documents/${d.id}`}
                      className="block truncate text-sm font-medium text-slate-900 after:absolute after:inset-0"
                    >
                      {d.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {TASK_LABELS[d.task_type] ?? d.task_type} · {formatDate(d.created_at)}
                    </p>
                  </div>
                  {/* Above the row-wide link, so these stay clickable. */}
                  <div className="relative flex items-center gap-1">
                    <a
                      href={`/api/documents/${d.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className={button.icon}
                      aria-label={`Download "${d.title}" as PDF`}
                      title="Download PDF"
                    >
                      <DownloadIcon className="h-4.5 w-4.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(d)}
                      className={button.iconDanger}
                      aria-label={`Delete "${d.title}"`}
                      title="Delete"
                    >
                      <TrashIcon className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-slate-500">No answers match your search.</li>
            )}
          </ul>
          <p className="text-xs text-slate-400">
            {visible.length} of {documents.length} answer{documents.length === 1 ? "" : "s"}
          </p>
        </>
      )}
    </div>
  );
}
