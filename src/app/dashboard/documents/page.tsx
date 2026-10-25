"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { keep, peek } from "@/lib/client-cache";
import { SparklesIcon } from "@/components/icons";
import { DocumentFilters } from "@/app/dashboard/documents/_parts/DocumentFilters";
import { DocumentRow, type Row } from "@/app/dashboard/documents/_parts/DocumentRow";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import { Alert, EmptyState, PageHeader, Skeleton, button, card, cx } from "@/components/ui";

export default function MyDocumentsPage() {
  const [documents, setDocuments] = useState<Row[]>(() => peek<Row[]>("documents") ?? []);
  const [loading, setLoading] = useState(() => peek("documents") === undefined);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("all");

  useEffect(() => {
    fetch("/api/documents")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? failedRequestMessage(r.status, "load your documents"));
        keep("documents", data.documents ?? []);
        setDocuments(data.documents ?? []);
      })
      .catch((err) => setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't load your documents. Reload the page to try again."))
      .finally(() => setLoading(false));
  }, []);

  // Only offer the filters for kinds of answer the person actually has.
  const types = useMemo(() => [...new Set(documents.map((d) => d.task_type))], [documents]);
  // A kind whose last answer was deleted is no longer a filter; show everything rather than an empty list with no way out.
  const activeType = type !== "all" && !(types as string[]).includes(type) ? "all" : type;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => (activeType === "all" || d.task_type === activeType) && (!q || d.title.toLowerCase().includes(q)));
  }, [documents, query, activeType]);

  async function remove(doc: Row) {
    if (!window.confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    setError(null);
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" }).catch(() => null);
    if (!res) {
      setError(OFFLINE_MESSAGE);
      return;
    }
    if (!res.ok) {
      setError("Couldn't delete that answer. Please try again.");
      return;
    }
    setDocuments((prev) => keep("documents", prev.filter((d) => d.id !== doc.id)));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Documents"
        description="Everything you generate (answers, notes, sample papers, study packs and worked examples) is saved here. Open one to read, print or download it."
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
          title="Nothing saved yet"
          description="Solve a worksheet, make notes or a sample paper on the Ask Syllabi page, and it is saved here automatically."
          action={
            <Link href="/dashboard" className={button.primary}>
              Go to Ask Syllabi
            </Link>
          }
        />
      ) : (
        <>
          <DocumentFilters query={query} onQuery={setQuery} types={types} type={activeType} onType={setType} />

          <ul className={cx(card, "divide-y divide-slate-100 overflow-hidden")}>
            {visible.map((d) => (
              <DocumentRow key={d.id} doc={d} onDelete={() => remove(d)} />
            ))}
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
