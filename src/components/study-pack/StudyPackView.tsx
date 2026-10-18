"use client";

import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Glossary } from "@/components/study-pack/Glossary";
import { PackHeader } from "@/components/study-pack/PackHeader";
import { PackTabs, tabsFor, type Tab } from "@/components/study-pack/PackTabs";
import { PracticeTest } from "@/components/study-pack/PracticeTest";
import { QuestionList } from "@/components/study-pack/QuestionList";
import { Walkthrough } from "@/components/study-pack/Walkthrough";
import { useSpeech } from "@/components/study-pack/useSpeech";
import { packToMarkdown } from "@/lib/study-pack/markdown";
import type { PackQuestion, PackSection, StudyPack } from "@/lib/study-pack/types";

/**
 * A chapter study pack: walkthrough with read-aloud, textbook questions with
 * hints, checked quotes and refinable answers, a self-marked practice test and
 * a glossary. Printing prints everything, expanded.
 */
export function StudyPackView({
  pack: initialPack,
  answerId,
  pdfUrl,
  actions,
  meta,
}: {
  pack: StudyPack;
  /** The saved answer's id; refining needs it. */
  answerId: string | null;
  pdfUrl: string | null;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  const [pack, setPack] = useState(initialPack);
  const [tab, setTab] = useState<Tab>(pack.walkthrough.length ? "walkthrough" : "textbook");
  const [copied, setCopied] = useState(false);
  const speech = useSpeech(pack.language ?? "en");

  function updateQuestion(section: PackSection, index: number, question: PackQuestion) {
    setPack((prev) => ({ ...prev, [section]: prev[section].map((q, i) => (i === index ? question : q)) }));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; nothing to do.
    }
  }

  // Copy and Print use the pack as it is now, refined answers included.
  const markdown = packToMarkdown(pack);

  return (
    <article className="animate-fade-in space-y-4">
      <PackHeader pack={pack} pdfUrl={pdfUrl} meta={meta} actions={actions} copied={copied} onCopy={copy} speech={speech} />

      <PackTabs
        tabs={tabsFor(pack)}
        tab={tab}
        onChoose={(next) => {
          speech.stop();
          setTab(next);
        }}
      />

      <div className="print:hidden" role="tabpanel">
        {tab === "walkthrough" && <Walkthrough pack={pack} speech={speech} />}
        {tab === "textbook" && (
          <QuestionList
            section="textbookQuestions"
            questions={pack.textbookQuestions}
            answerId={answerId}
            speech={speech}
            onChange={updateQuestion}
            note={
              pack.textbookQuestionsWritten
                ? "The chapter had no exercise questions, so these comprehension questions were written for it."
                : undefined
            }
          />
        )}
        {tab === "practice" && (
          <PracticeTest questions={pack.practiceQuestions} answerId={answerId} speech={speech} onChange={updateQuestion} />
        )}
        {tab === "glossary" && <Glossary pack={pack} />}
      </div>

      {/* Printing gives the whole pack, expanded, with any refined answers. */}
      <div className="hidden print:block">
        <h1 className="mb-1 text-xl font-semibold">{pack.title}</h1>
        <Markdown text={markdown} />
      </div>
    </article>
  );
}
