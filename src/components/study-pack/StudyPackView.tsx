"use client";

import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import { useMemo, useState } from "react";
import { Markdown } from "@/components/Markdown";
import {
  AlertIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  LightbulbIcon,
  SearchIcon,
  SparklesIcon,
  SpeakerIcon,
  StopIcon,
  UndoIcon,
} from "@/components/icons";
import { PrintButton } from "@/components/PrintButton";
import { PdfButton } from "@/components/PdfButton";
import { Badge, Spinner, button, card, cx, input } from "@/components/ui";
import { useSpeech, type Speech } from "@/components/study-pack/useSpeech";
import { normaliseResponse } from "@/lib/study-pack/auto-key";
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
      ? [{ id: "textbook" as Tab, label: pack.textbookQuestionsWritten ? "Questions" : "Textbook Q&A", count: pack.textbookQuestions.length }]
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

function ListenButton({ id, text, speech, label = "Listen" }: { id: string; text: string; speech: Speech; label?: string }) {
  if (!speech.supported || !text) return null;
  const speaking = speech.speakingId === id;
  return (
    <button
      type="button"
      onClick={() => speech.speak(id, text)}
      className={cx(button.small, speaking && "border-brand-500 text-brand-700")}
      aria-pressed={speaking}
    >
      {speaking ? <StopIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
      {speaking ? "Stop" : label}
    </button>
  );
}

function Walkthrough({ pack, speech }: { pack: StudyPack; speech: Speech }) {
  const [index, setIndex] = useState(0);
  const part = pack.walkthrough[index];
  const go = (i: number) => {
    speech.stop();
    setIndex(i);
  };

  return (
    <div className="space-y-3">
      <ol className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Parts">
        {pack.walkthrough.map((p, i) => (
          <li key={i} className="shrink-0">
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === index ? "step" : undefined}
              className={cx(
                "flex max-w-52 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition",
                i === index ? "border-brand-500 bg-brand-50 text-brand-900" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              <span
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  i === index ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                )}
              >
                {i + 1}
              </span>
              <span className="truncate">{p.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className={cx(card, "space-y-5 p-5 sm:p-6")} aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-brand-700">
              Part {index + 1} of {pack.walkthrough.length}
            </p>
            <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">{part.title}</h3>
          </div>
          <ListenButton id={`part-${index}`} text={part.narration} speech={speech} label="Read aloud" />
        </div>

        <p className="text-[15px] leading-7 text-slate-700">{part.summary}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-brand-50/60 p-4">
            <p className="text-xs font-semibold tracking-wide text-brand-800 uppercase">Why it matters</p>
            <p className="mt-1.5 text-sm leading-6 text-slate-700">{part.whyItMatters}</p>
          </div>
          {part.feelings && (
            <div className="rounded-xl bg-amber-50/70 p-4">
              <p className="text-xs font-semibold tracking-wide text-amber-800 uppercase">Feelings</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-700">{part.feelings}</p>
            </div>
          )}
        </div>

        {part.vocabulary.length > 0 && (
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Words from the book</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              {part.vocabulary.map((v) => (
                <div key={v.word} className="rounded-xl border border-slate-200 p-3">
                  <dt className="text-sm font-semibold text-slate-900">{v.word}</dt>
                  <dd className="mt-0.5 text-sm text-slate-600">{v.meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <details className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-900">Read-aloud script</summary>
          <p className="mt-2 leading-6">{part.narration}</p>
        </details>

        <div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className={button.secondary}>
            <ChevronLeftIcon className="h-4 w-4" /> Previous
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index === pack.walkthrough.length - 1}
            className={button.primary}
          >
            Next <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}

function QuestionMeta({ q }: { q: PackQuestion }) {
  const tone = q.difficulty === "easy" ? "success" : q.difficulty === "hard" ? "danger" : q.difficulty ? "warning" : "neutral";
  return (
    <div className="flex flex-wrap gap-1.5">
      {q.difficulty && <Badge tone={tone}>{q.difficulty[0].toUpperCase() + q.difficulty.slice(1)}</Badge>}
      {q.type && <Badge>{q.type}</Badge>}
      {q.marks ? <Badge>{q.marks} mark{q.marks > 1 ? "s" : ""}</Badge> : null}
    </div>
  );
}

function Evidence({ q }: { q: PackQuestion }) {
  if (!q.evidence) return null;
  return (
    <figure className="rounded-xl border-l-4 border-brand-300 bg-brand-50/50 px-4 py-3">
      <blockquote className="text-sm leading-6 text-slate-700 italic">&ldquo;{q.evidence}&rdquo;</blockquote>
      <figcaption className="mt-1.5 text-xs">
        {q.evidenceFound === true && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckIcon className="h-3.5 w-3.5" /> Found in the book
          </span>
        )}
        {q.evidenceFound === false && (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <AlertIcon className="h-3.5 w-3.5" /> Not found word for word: check it against the book
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** The answer, its read-aloud walkthrough, and the refine box. */
function AnswerBlock({
  q,
  section,
  index,
  answerId,
  speech,
  onChange,
}: {
  q: PackQuestion;
  section: PackSection;
  index: number;
  answerId: string | null;
  speech: Speech;
  onChange: (section: PackSection, index: number, question: PackQuestion) => void;
}) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Earlier versions of this answer in this visit, for Undo.
  const [history, setHistory] = useState<string[]>([]);

  async function send(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    if (!answerId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${answerId}/pack`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, index, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "change this answer"));
      onChange(section, index, data.question);
      return true;
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't change this answer. Try again in a moment.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function refine(text: string) {
    const previous = q.answer;
    if (await send("POST", { request: text })) {
      setHistory((h) => [...h, previous]);
      setRequest("");
    }
  }

  async function undo() {
    const previous = history[history.length - 1];
    if (previous && (await send("PATCH", { answer: previous }))) setHistory((h) => h.slice(0, -1));
  }

  return (
    <div className="space-y-3">
      <Evidence q={q} />
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
        <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">Model answer</p>
        <div className="mt-1">
          <Markdown text={q.answer} />
        </div>
      </div>
      {q.skill && <p className="text-xs text-slate-500">Skill tested: {q.skill}</p>}
      <div className="flex flex-wrap gap-2">
        <ListenButton id={`${section}-${index}`} text={q.narration} speech={speech} label="Explain it aloud" />
        {history.length > 0 && (
          <button type="button" onClick={undo} disabled={busy} className={button.small}>
            <UndoIcon className="h-4 w-4" /> Undo
          </button>
        )}
        {q.originalAnswer && history.length === 0 && (
          <button type="button" onClick={() => send("PATCH", { answer: q.originalAnswer })} disabled={busy} className={button.small}>
            <UndoIcon className="h-4 w-4" /> Restore original
          </button>
        )}
      </div>

      {answerId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (request.trim()) refine(request.trim());
          }}
          className="space-y-2 rounded-xl bg-slate-50 p-3"
        >
          <label htmlFor={`refine-${section}-${index}`} className="text-xs font-medium text-slate-600">
            Change this answer
          </label>
          <div className="flex flex-wrap gap-1.5">
            {["Make it simpler", "Make it shorter", "Add more detail", "Make it a 5-mark answer"].map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => refine(s)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-brand-200 hover:text-brand-700 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              id={`refine-${section}-${index}`}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Or type what to change, for example “use an example from daily life”"
              maxLength={500}
              disabled={busy}
              className={cx(input, "min-w-0 flex-1")}
            />
            <button type="submit" disabled={busy || !request.trim()} className={button.primary}>
              {busy ? <Spinner /> : <SparklesIcon className="h-4 w-4" />}
              <span className="hidden sm:inline">{busy ? "Changing..." : "Change"}</span>
              <span className="sr-only sm:hidden">Change this answer</span>
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}

function QuestionText({ q, label, hideOptions }: { q: PackQuestion; label: string; hideOptions?: boolean }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[15px] leading-6 font-medium text-slate-900">
        <span className="mr-1.5 text-brand-700">{label}</span>
        {q.question}
      </p>
      {q.options.length > 0 && !hideOptions && (
        <ul className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
          {q.options.map((o) => (
            <li key={o} className="rounded-lg bg-slate-50 px-3 py-1.5">
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
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
            {open.has(i) && (
              <AnswerBlock q={q} section={section} index={i} answerId={answerId} speech={speech} onChange={onChange} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One question at a time; the child answers, then marks themselves. */
function PracticeTest({
  questions,
  answerId,
  speech,
  onChange,
}: {
  questions: PackQuestion[];
  answerId: string | null;
  speech: Speech;
  onChange: (section: PackSection, index: number, question: PackQuestion) => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // For objective questions marked by code: whether the child's choice was right.
  const [autoResult, setAutoResult] = useState<boolean | null>(null);
  const [marks, setMarks] = useState<(boolean | null)[]>(() => questions.map(() => null));
  const finished = index >= questions.length;
  const score = marks.filter(Boolean).length;
  const q = questions[index];

  function mark(correct: boolean) {
    setMarks((m) => m.map((v, i) => (i === index ? correct : v)));
    speech.stop();
    setRevealed(false);
    setShowHint(false);
    setAutoResult(null);
    setIndex((i) => i + 1);
  }

  /** The child answered an objective question: marked at once by comparing with the key. */
  function respond(correct: boolean) {
    setAutoResult(correct);
    setRevealed(true);
  }

  function restart(onlyMissed: boolean) {
    if (onlyMissed) {
      const first = marks.findIndex((m) => m === false);
      setIndex(first === -1 ? 0 : first);
    } else {
      setMarks(questions.map(() => null));
      setIndex(0);
    }
    setRevealed(false);
    setShowHint(false);
    setAutoResult(null);
  }

  if (finished) {
    const missed = questions.map((qq, i) => ({ qq, i })).filter(({ i }) => marks[i] === false);
    return (
      <section className={cx(card, "space-y-5 p-6 text-center")}>
        <p className="text-sm font-medium text-slate-500">Practice test finished</p>
        <p className="text-5xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {score}
          <span className="text-2xl text-slate-400">/{questions.length}</span>
        </p>
        <p className="text-sm text-slate-600">
          {score === questions.length
            ? "Every question right. Brilliant work!"
            : score >= questions.length * 0.7
              ? "Great effort. Go over the ones marked Not yet."
              : "Good start. Read the chapter parts again, then try the ones marked Not yet."}
        </p>
        {missed.length > 0 && (
          <ul className="space-y-1.5 text-left">
            {missed.map(({ qq, i }) => (
              <li key={i} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                P{i + 1}. {qq.question}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {missed.length > 0 && (
            <button type="button" onClick={() => restart(true)} className={button.primary}>
              Try again the ones marked Not yet
            </button>
          )}
          <button type="button" onClick={() => restart(false)} className={button.secondary}>
            Start again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={cx(card, "space-y-4 p-5 sm:p-6")}>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span className="tabular-nums">Score so far: {score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <QuestionText q={q} label={`P${index + 1}.`} hideOptions={q.autoKey?.kind === "option"} />
      <QuestionMeta q={q} />
      {q.autoKey && (
        <ObjectiveResponse key={index} q={q} locked={revealed} onRespond={respond} />
      )}
      {showHint && q.hint && (
        <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <LightbulbIcon className="mt-0.5 h-4 w-4 shrink-0" /> {q.hint}
        </p>
      )}
      {!revealed ? (
        <div className="flex flex-wrap gap-2">
          {q.hint && !showHint && (
            <button type="button" onClick={() => setShowHint(true)} className={button.secondary}>
              <LightbulbIcon className="h-4 w-4" /> Hint
            </button>
          )}
          <button type="button" onClick={() => setRevealed(true)} className={q.autoKey ? button.secondary : button.primary}>
            Show the answer
          </button>
        </div>
      ) : (
        <>
          {autoResult !== null && (
            <p
              role="status"
              className={cx(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                autoResult ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
              )}
            >
              {autoResult ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
              {autoResult ? "Correct!" : "Not quite. See the answer below."}
            </p>
          )}
          <AnswerBlock q={q} section="practiceQuestions" index={index} answerId={answerId} speech={speech} onChange={onChange} />
          {autoResult !== null ? (
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button type="button" onClick={() => mark(autoResult)} className={button.primary}>
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-600">Did they get it?</span>
            <button type="button" onClick={() => mark(true)} className={button.success}>
              <CheckIcon className="h-4 w-4" /> Got it
            </button>
            <button type="button" onClick={() => mark(false)} className={button.secondary}>
              Not yet
            </button>
          </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The child's own answer to an objective question: tap an option, True or
 * False, or type the missing word. Marked by code against the key.
 */
function ObjectiveResponse({
  q,
  locked,
  onRespond,
}: {
  q: PackQuestion;
  locked: boolean;
  onRespond: (correct: boolean) => void;
}) {
  const [chosen, setChosen] = useState<number | boolean | null>(null);
  const [typed, setTyped] = useState("");
  const key = q.autoKey!;

  const choiceClass = (selected: boolean, right: boolean) =>
    cx(
      "rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:cursor-default",
      locked && right
        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
        : locked && selected
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50"
    );

  if (key.kind === "option") {
    return (
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Choose an answer">
        {q.options.map((option, i) => (
          <button
            key={option}
            type="button"
            disabled={locked}
            onClick={() => {
              setChosen(i);
              onRespond(i === key.index);
            }}
            className={choiceClass(chosen === i, i === key.index)}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  if (key.kind === "truefalse") {
    return (
      <div className="flex gap-2" role="group" aria-label="True or false">
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            disabled={locked}
            onClick={() => {
              setChosen(value);
              onRespond(value === key.value);
            }}
            className={cx(choiceClass(chosen === value, value === key.value), "flex-1 text-center font-medium")}
          >
            {value ? "True" : "False"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (typed.trim()) onRespond(key.answers.includes(normaliseResponse(typed)));
      }}
    >
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={locked}
        placeholder="Type the missing word"
        aria-label="Your answer"
        className={cx(input, "min-w-0 flex-1")}
      />
      <button type="submit" disabled={locked || !typed.trim()} className={button.primary}>
        Check
      </button>
    </form>
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
