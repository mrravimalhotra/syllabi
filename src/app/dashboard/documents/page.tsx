"use client";

import { useEffect, useState } from "react";
import type { GeneratedDocumentRow } from "@/types/database";

const TASK_LABELS: Record<string, string> = {
  solution: "Step-by-step solution",
  notes: "Revision notes",
  sample_paper: "Sample paper",
  ad_hoc: "Ask anything",
};

export default function MyDocumentsPage() {
  const [documents, setDocuments] = useState<GeneratedDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data) => setDocuments(data.documents ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function download(id: string) {
    setDownloadingId(id);
    const res = await fetch(`/api/documents/${id}/download`);
    const data = await res.json();
    setDownloadingId(null);
    if (res.ok) window.open(data.url, "_blank");
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">My Documents</h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{d.title}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{TASK_LABELS[d.task_type]}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(d.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => download(d.id)}
                    disabled={downloadingId === d.id}
                    className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {downloadingId === d.id ? "Opening..." : "Download"}
                  </button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No documents generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
