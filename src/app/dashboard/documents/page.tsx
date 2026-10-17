"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
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

  async function download(id: string) {
    setError(null);
    // Open the tab now, while we still have the tap: phones block pop-ups
    // opened after waiting for the server. Point it at the PDF once we have it.
    const tab = window.open("", "_blank");
    setDownloadingId(id);
    try {
      const res = await fetch(`/api/documents/${id}/download`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (tab) tab.location.href = data.url;
      else window.location.assign(data.url);
    } catch {
      tab?.close();
      setError("Couldn't open that document. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">My Documents</h1>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
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
                  {formatDate(d.created_at)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => download(d.id)}
                    disabled={downloadingId === d.id}
                    className="min-h-11 rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 sm:min-h-0"
                  >
                    {downloadingId === d.id ? "Opening..." : "Download"}
                  </button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && !error && (
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
