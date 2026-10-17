"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnswerView, type Answer } from "@/components/AnswerView";
import { EditableName } from "@/components/EditableName";
import { StudyPackView } from "@/components/study-pack/StudyPackView";
import { WorkedExampleView } from "@/components/worked/WorkedExampleView";
import { solve } from "@/lib/worked/detect";
import type { WorkedProblem } from "@/lib/worked/types";
import type { StudyPack } from "@/lib/study-pack/types";
import { ChevronLeftIcon, DocumentIcon, TrashIcon } from "@/components/icons";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import { PdfButton } from "@/components/PdfButton";
import { Alert, EmptyState, Skeleton, button, card, cx } from "@/components/ui";
import { formatDate, taskLabel } from "@/lib/format";

type SavedAnswer = Answer & {
  id: string;
  taskType: string;
  createdAt: string;
  text: string | null;
  pack: StudyPack | null;
  worked: WorkedProblem | null;
};

/** One saved answer: read, print, download, rename or delete it. */
export default function AnswerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [answer, setAnswer] = useState<SavedAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.status === 404) {
          setMissing(true);
          return;
        }
        if (!r.ok) throw new Error(data.error ?? failedRequestMessage(r.status, "open this document"));
        setAnswer(data.answer);
      })
      .catch((err) =>
        setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error && err.message ? err.message : "Couldn't open this document. Reload the page to try again.")
      );
  }, [id]);

  async function rename(title: string) {
    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "rename this document"));
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
      <Link
        href="/dashboard/documents"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 print:hidden"
      >
        <ChevronLeftIcon className="h-4 w-4" /> My Documents
      </Link>

      {error && <Alert tone="error">{error}</Alert>}

      {missing && (
        <EmptyState
          icon={<DocumentIcon className="h-6 w-6" />}
          title="Answer not found"
          description="It doesn't exist or was deleted."
          action={
            <Link href="/dashboard/documents" className={button.secondary}>
              Back to My Documents
            </Link>
          }
        />
      )}

      {!answer && !error && !missing && (
        <div className={cx(card, "space-y-3 p-6")} role="status" aria-label="Loading">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}

      {answer && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 print:hidden">
            <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">Name</span>
            <EditableName value={answer.title} onSave={rename} className="min-w-0 max-w-full font-medium text-slate-800" />
          </div>
          {answer.worked && solve(answer.worked) ? (
            <WorkedExampleView
              example={solve(answer.worked)!}
              pdfUrl={answer.pdfUrl}
              actions={
                <button type="button" onClick={remove} className={button.smallDanger} aria-label="Delete this worked example">
                  <TrashIcon className="h-4 w-4" /> Delete
                </button>
              }
            />
          ) : answer.pack ? (
            <StudyPackView
              pack={answer.pack}
              answerId={answer.id}
              pdfUrl={answer.pdfUrl}
              meta={formatDate(answer.createdAt)}
              actions={
                <button type="button" onClick={remove} className={button.smallDanger} aria-label="Delete this study pack">
                  <TrashIcon className="h-4 w-4" /> Delete
                </button>
              }
            />
          ) : answer.text === null ? (
            <Alert tone="info">
              This older answer was saved as a PDF only.{" "}
              {answer.pdfUrl && (
                <PdfButton url={answer.pdfUrl} name={answer.title} className="font-medium underline">
                  Open the PDF
                </PdfButton>
              )}
              .
            </Alert>
          ) : (
            <AnswerView
              answer={{ ...answer, text: answer.text }}
              meta={`${taskLabel(answer.taskType)} · ${formatDate(answer.createdAt)}`}
              actions={
                <button
                  type="button"
                  onClick={remove}
                  className={button.smallDanger}
                  aria-label="Delete this answer"
                >
                  <TrashIcon className="h-4 w-4" /> Delete
                </button>
              }
            />
          )}
          {answer.text === null && (
            <button type="button" onClick={remove} className={button.dangerGhost}>
              <TrashIcon className="h-4 w-4" /> Delete this answer
            </button>
          )}
        </>
      )}
    </div>
  );
}
