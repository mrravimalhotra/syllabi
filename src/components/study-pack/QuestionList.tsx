"use client";

import { useState } from "react";
import { LightbulbIcon } from "@/components/icons";
import { AnswerBlock, QuestionMeta, QuestionText } from "@/components/study-pack/PackParts";
import type { Speech } from "@/components/study-pack/useSpeech";
import { button, card, cx } from "@/components/ui";
import type { PackQuestion, PackSection } from "@/lib/study-pack/types";

/** The textbook questions: each with its hint and a Show answer button, and one button to show or hide them all. */
export function QuestionList({
  section,
  questions,
  answerId,
  speech,
  onChange,
  note,
}: {
  section: PackSection;
  questions: PackQuestion[];
  answerId: string | null;
  speech: Speech;
  onChange: (section: PackSection, index: number, question: PackQuestion) => void;
  note?: string;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [hints, setHints] = useState<Set<number>>(new Set());
  const toggle = (set: Set<number>, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  };
  const allOpen = open.size === questions.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {note ? <p className="text-xs text-slate-500">{note}</p> : <span />}
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(questions.map((_, i) => i)))}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {allOpen ? "Hide all answers" : "Show all answers"}
        </button>
      </div>
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={i} className={cx(card, "space-y-3 p-4 sm:p-5")}>
            <QuestionText q={q} label={q.number || `Q${i + 1}.`} />
            <QuestionMeta q={q} />
            {hints.has(i) && q.hint && (
              <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <LightbulbIcon className="mt-0.5 h-4 w-4 shrink-0" /> {q.hint}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {q.hint && !hints.has(i) && !open.has(i) && (
                <button type="button" onClick={() => setHints((h) => toggle(h, i))} className={button.small}>
                  <LightbulbIcon className="h-4 w-4" /> Hint
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen((o) => toggle(o, i))}
                aria-expanded={open.has(i)}
                className={open.has(i) ? button.small : button.smallPrimary}
              >
                {open.has(i) ? "Hide answer" : "Show answer"}
              </button>
            </div>
            {open.has(i) && <AnswerBlock q={q} section={section} index={i} answerId={answerId} speech={speech} onChange={onChange} />}
          </li>
        ))}
      </ol>
    </div>
  );
}
