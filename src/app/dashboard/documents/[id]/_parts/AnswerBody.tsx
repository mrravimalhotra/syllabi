"use client";

import { AnswerView, type Answer } from "@/components/AnswerView";
import { TrashIcon } from "@/components/icons";
import { PdfButton } from "@/components/PdfButton";
import { StudyPackView } from "@/components/study-pack/StudyPackView";
import { WorkedExampleView } from "@/components/worked/WorkedExampleView";
import { Alert, button } from "@/components/ui";
import { formatDate, taskLabel } from "@/lib/format";
import type { StudyPack } from "@/lib/study-pack/types";
import { solve } from "@/lib/worked/detect";
import type { WorkedProblem } from "@/lib/worked/types";

export type SavedAnswer = Answer & {
  id: string;
  taskType: string;
  createdAt: string;
  text: string | null;
  pack: StudyPack | null;
  worked: WorkedProblem | null;
};

/** The saved answer as it should be shown: a worked example, a study pack, an old PDF-only answer, or a written answer. */
export function AnswerBody({ answer, onDelete }: { answer: SavedAnswer; onDelete: () => void }) {
  return (
    <>
      {answer.worked && solve(answer.worked) ? (
        <WorkedExampleView
          example={solve(answer.worked)!}
          pdfUrl={answer.pdfUrl}
          actions={
            <button type="button" onClick={onDelete} className={button.smallDanger} aria-label="Delete this worked example">
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
            <button type="button" onClick={onDelete} className={button.smallDanger} aria-label="Delete this study pack">
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
            <button type="button" onClick={onDelete} className={button.smallDanger} aria-label="Delete this answer">
              <TrashIcon className="h-4 w-4" /> Delete
            </button>
          }
        />
      )}
    </>
  );
}
