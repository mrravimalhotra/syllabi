"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TASK_LABELS, formatDate } from "@/lib/format";
import type { GeneratedDocumentRow } from "@/types/database";

type Row = Pick<GeneratedDocumentRow, "id" | "title" | "task_type" | "created_at">;

export default function MyDocumentsPage() {
  const [documents, setDocuments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">My Documents</h1>
        <p className="mt-1 text-sm text-slate-500">Every answer you generate is saved here. Open one to read, print or download it.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Link href={`/dashboard/documents/${d.id}`} className="block truncate text-sm font-medium text-slate-900 hover:underline">
                {d.title}
              </Link>
              <p className="text-xs text-slate-500">
                {TASK_LABELS[d.task_type] ?? d.task_type} · {formatDate(d.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/documents/${d.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white sm:min-h-0"
              >
                PDF
              </a>
              <button
                type="button"
                onClick={() => remove(d)}
                className="min-h-11 px-2 text-xs font-medium text-red-600 hover:underline sm:min-h-0"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {documents.length === 0 && !error && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">
            No answers yet. Generate one and it will be saved here.
          </li>
        )}
      </ul>
    </div>
  );
}
