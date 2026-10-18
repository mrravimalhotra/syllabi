"use client";

import { useMemo, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { CheckIcon, CopyIcon, DownloadIcon, LightbulbIcon, SearchIcon, SpeakerIcon } from "@/components/icons";
import { PrintButton } from "@/components/PrintButton";
import { PdfButton } from "@/components/PdfButton";
import { Badge, button, card, cx, input } from "@/components/ui";
import { useSpeech, type Speech } from "@/components/study-pack/useSpeech";
import { AnswerBlock, QuestionMeta, QuestionText } from "@/components/study-pack/PackParts";
import { PracticeTest } from "@/components/study-pack/PracticeTest";
import { Walkthrough } from "@/components/study-pack/Walkthrough";
import { packToMarkdown } from "@/lib/study-pack/markdown";
import type { PackQuestion, PackSection, StudyPack } from "@/lib/study-pack/types";

type Tab = "walkthrough" | "textbook" | "practice" | "glossary";

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

  const tabs: { id: Tab; label: string; count?: number }[] = [
    ...(pack.walkthrough.length
      ? [{ id: "walkthrough" as Tab, label: pack.kind === "story" ? "Story" : "Key ideas", count: pack.walkthrough.length }]
      : []),
    ...(pack.textbookQuestions.length
      ? [
          {
            id: "textbook" as Tab,
            label: pack.textbookQuestionsWritten ? "Questions" : "Textbook Q&A",
            count: pack.textbookQuestions.length,
          },
        ]
      : []),
    ...(pack.practiceQuestions.length ? [{ id: "practice" as Tab, label: "Practice test", count: pack.practiceQuestions.length }] : []),
    ...(pack.glossary.length ? [{ id: "glossary" as Tab, label: "Glossary", count: pack.glossary.length }] : []),
  ];

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
      <header className={cx(card, "space-y-4 p-4 sm:p-6 print:hidden")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-60 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">Study pack</Badge>
              <Badge>{pack.kind === "story" ? "Story chapter" : "Information chapter"}</Badge>
              {pack.subject && <Badge>{pack.subject}</Badge>}
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere]">{pack.title}</h2>
            <p className="text-xs text-slate-500">
              From {pack.source}
              {meta ? <> · {meta}</> : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {actions}
            <button type="button" onClick={copy} className={button.small}>
              {copied ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <CopyIcon className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <PrintButton pdfUrl={pdfUrl} name={pack.title} />
            {pdfUrl && (
              <PdfButton url={pdfUrl} name={pack.title} className={button.smallPrimary}>
                <DownloadIcon className="h-4 w-4" /> PDF
              </PdfButton>
            )}
          </div>
        </div>
        {pack.overview && <p className="text-[15px] leading-7 text-slate-700">{pack.overview}</p>}
        {(pack.themes.length > 0 || pack.characters.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {pack.themes.length > 0 && (
              <div>
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {pack.kind === "story" ? "Themes" : "Big ideas"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pack.themes.map((t) => (
                    <span key={t} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-800">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {pack.characters.length > 0 && (
              <div>
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Characters</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {pack.characters.map((c) => (
                    <li key={c.name} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700" title={c.role}>
                      <span className="font-medium text-slate-900">{c.name}</span> · {c.role}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {speech.supported && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <SpeakerIcon className="h-4 w-4" />
            Read-aloud speed
            <select
              value={speech.rate}
              onChange={(e) => speech.setRate(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs"
              aria-label="Read-aloud speed"
            >
              <option value={0.8}>Slow</option>
              <option value={0.95}>Normal</option>
              <option value={1.1}>Fast</option>
            </select>
          </div>
        )}
        {speech.notice && (
          <p role="status" className="text-xs text-amber-700">
            {speech.notice}
          </p>
        )}
      </header>

      <div role="tablist" aria-label="Study pack sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 print:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              speech.stop();
              setTab(t.id);
            }}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition",
              tab === t.id ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cx("rounded-full px-1.5 text-xs", tab === t.id ? "bg-white/20" : "bg-slate-100")}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

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

function QuestionList({
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

function Glossary({ pack }: { pack: StudyPack }) {
  const [query, setQuery] = useState("");
  const words = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pack.glossary.filter((v) => !q || v.word.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q));
  }, [pack.glossary, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a word"
          aria-label="Find a word"
          className={cx(input, "pl-10")}
        />
      </div>
      <dl className={cx(card, "divide-y divide-slate-100")}>
        {words.map((v) => (
          <div key={v.word} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4 sm:px-5">
            <dt className="text-sm font-semibold text-slate-900">{v.word}</dt>
            <dd className="text-sm text-slate-600">{v.meaning}</dd>
          </div>
        ))}
        {words.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No matching words.</p>}
      </dl>
    </div>
  );
}
