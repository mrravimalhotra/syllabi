"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnswerView, type Answer } from "@/components/AnswerView";
import { EditableName } from "@/components/EditableName";
import { TASK_LABELS, formatDate } from "@/lib/format";

type SavedAnswer = Answer & { id: string; taskType: string; createdAt: string; text: string | null };

/** One saved answer: read, print, download, rename or delete it. */
export default function AnswerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [answer, setAnswer] = useState<SavedAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(r.status === 404 ? "This answer doesn't exist or was deleted." : data.error);
        setAnswer(data.answer);
      })
      .catch((err) => setError(err instanceof Error && err.message ? err.message : "Couldn't load this answer."));
  }, [id]);

  async function rename(title: string) {
    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Rename failed");
    setAnswer((prev) => (prev ? { ...prev, title: data.title } : prev));
  }

  async function remove() {
    if (!answer || !window.confirm(`Delete "${answer.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/documents");
    else setError("Couldn't delete this answer. Please try again.");
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/documents" className="text-sm text-slate-500 hover:text-slate-900 print:hidden">
        ← My Documents
      </Link>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!answer && !error && <p className="text-sm text-slate-500">Loading...</p>}
      {answer && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 print:hidden">
            <span>
              {TASK_LABELS[answer.taskType] ?? answer.taskType} · {formatDate(answer.createdAt)}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-slate-400">Rename:</span>
              <EditableName value={answer.title} onSave={rename} className="max-w-[14rem] truncate text-slate-600" />
              <button type="button" onClick={remove} className="min-h-11 font-medium text-red-600 hover:underline sm:min-h-0">
                Delete
              </button>
            </span>
          </div>
          {answer.text === null ? (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              This older answer was saved as a PDF only.{" "}
              <a href={answer.pdfUrl ?? "#"} target="_blank" rel="noreferrer" className="underline">
                Open the PDF
              </a>
              .
            </p>
          ) : (
            <AnswerView answer={{ ...answer, text: answer.text }} />
          )}
        </>
      )}
    </div>
  );
}
