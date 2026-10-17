"use client";

import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { AlertIcon, CheckIcon, CopyIcon, DownloadIcon, PrinterIcon } from "@/components/icons";
import type { AnswerCheck } from "@/types/database";
import { button, card, cx } from "@/components/ui";
import { hasAnswerKey } from "@/lib/format";

export interface AnswerSource {
  id: string;
  section_label: string | null;
  source_type: string;
  page_number: number | null;
  imageUrl?: string;
}

export interface Answer {
  title: string;
  text: string;
  sources: AnswerSource[];
  usedSearchGrounding: boolean;
  /** Google's Search Suggestions HTML for an answer that used web search. */
  searchSuggestionsHtml: string | null;
  /** On-demand PDF of the saved answer; null if it couldn't be saved. */
  pdfUrl: string | null;
  /** What Syllabi's own code checked (calculations, marks...). */
  checks?: AnswerCheck[];
}

/**
 * One answer with its sources, Copy, Print and PDF buttons: used right after
 * generating and when reopening a saved answer. Only the answer prints.
 */
export function AnswerView({ answer, actions, meta }: { answer: Answer; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <article className={cx(card, "animate-fade-in overflow-hidden print:border-0 print:shadow-none")}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 print:border-0 print:px-0">
        <div className="min-w-0 flex-1 basis-60 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere]">{answer.title}</h2>
          {meta && <div className="text-xs text-slate-500 print:hidden">{meta}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
          {actions}
          <CopyButton text={answer.text} />
          <button type="button" onClick={() => window.print()} className={button.small}>
            <PrinterIcon className="h-4 w-4" /> Print
          </button>
          {answer.pdfUrl && hasAnswerKey(answer.text) && (
            <a href={`${answer.pdfUrl}?part=questions`} target="_blank" rel="noreferrer" className={button.small}>
              <DownloadIcon className="h-4 w-4" /> Questions only
            </a>
          )}
          {answer.pdfUrl && (
            <a href={answer.pdfUrl} target="_blank" rel="noreferrer" className={button.smallPrimary}>
              <DownloadIcon className="h-4 w-4" /> PDF
            </a>
          )}
        </div>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-6 print:px-0">
        {answer.usedSearchGrounding && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 print:hidden">
            Your books didn&apos;t fully cover this, so it was supplemented with a Google Search.
          </p>
        )}
        {answer.usedSearchGrounding && (
          <p className="hidden text-xs text-slate-500 print:block">Supplemented with a Google Search.</p>
        )}
        <Markdown text={answer.text} />
        {answer.searchSuggestionsHtml && <SearchSuggestions html={answer.searchSuggestionsHtml} />}
        {answer.checks && answer.checks.length > 0 && <Checks checks={answer.checks} />}
        <p className="text-xs text-slate-400">AI-generated. Check it before using it with your child or student.</p>
      </div>

      {answer.sources.length > 0 && (
        <footer className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-6 print:bg-white print:px-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sources from your books</p>
          <ol className="mt-2 space-y-1 text-xs text-slate-600">
            {answer.sources.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <span className="w-6 shrink-0 text-slate-400">[{i + 1}]</span>
                <span>
                  {s.section_label ?? s.source_type}
                  {s.page_number ? `, p.${s.page_number}` : ""}
                </span>
              </li>
            ))}
          </ol>
          <SourceImages sources={answer.sources} />
        </footer>
      )}
    </article>
  );
}

/** Copies the answer's text (Markdown) so it can be pasted into a message or document. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (e.g. an insecure page); nothing else to do.
    }
  }

  return (
    <button type="button" onClick={copy} className={button.small} aria-live="polite">
      {copied ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <CopyIcon className="h-4 w-4" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * What Syllabi's own code verified, without AI: each calculation recomputed,
 * marks added up and so on. Problems are listed; correct items fold away.
 */
function Checks({ checks }: { checks: AnswerCheck[] }) {
  const problems = checks.filter((c) => !c.ok);
  const calculations = checks.filter((c) => c.kind === "calculation");
  const summary =
    problems.length === 0
      ? calculations.length === checks.length
        ? `${calculations.length} calculation${calculations.length === 1 ? "" : "s"} checked by an exact calculator: all correct`
        : `${checks.length} checks passed`
      : `${problems.length} problem${problems.length === 1 ? "" : "s"} found: please check before using`;
  return (
    <details
      open={problems.length > 0}
      className={cx(
        "rounded-xl border px-3 py-2 text-xs print:hidden",
        problems.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
      )}
    >
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
        {problems.length ? <AlertIcon className="h-4 w-4 shrink-0" /> : <CheckIcon className="h-4 w-4 shrink-0" />}
        {summary}
      </summary>
      <ul className="mt-2 space-y-1">
        {[...problems, ...checks.filter((c) => c.ok)].map((c, i) => (
          <li key={i} className="flex gap-1.5">
            <span aria-hidden="true">{c.ok ? "✓" : "⚠"}</span>
            <span className="[overflow-wrap:anywhere]">{c.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SourceImages({ sources }: { sources: AnswerSource[] }) {
  const uniqueUrls = [...new Set(sources.map((s) => s.imageUrl).filter((u): u is string => Boolean(u)))];
  if (uniqueUrls.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {uniqueUrls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not worth Next/Image's remote-pattern config */}
          <img
            src={url}
            alt="Referenced page"
            loading="lazy"
            decoding="async"
            className="h-28 w-auto rounded-lg border border-slate-200 bg-white transition hover:shadow-md"
          />
        </a>
      ))}
    </div>
  );
}

/**
 * Google's Search Suggestions, shown exactly as provided with any answer that
 * used Google Search (a requirement of the Gemini API terms). Rendered in a
 * sandboxed frame so its markup and styles can't affect the page; its links
 * open in a new tab.
 */
function SearchSuggestions({ html }: { html: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 print:hidden">
      <iframe
        title="Google Search suggestions"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={`<base target="_blank">${html}`}
        className="h-20 w-full border-0"
      />
    </div>
  );
}
