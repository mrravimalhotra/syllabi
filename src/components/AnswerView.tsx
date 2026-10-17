"use client";

import { Markdown } from "@/components/Markdown";

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
}

/**
 * One answer with its sources, Print and PDF buttons: used right after
 * generating and when reopening a saved answer. Only the answer prints.
 */
export function AnswerView({ answer, actions }: { answer: Answer; actions?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="w-full text-base font-semibold text-slate-900 sm:w-auto sm:min-w-0 sm:flex-1">{answer.title}</h2>
        <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
          {actions}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0"
          >
            Print
          </button>
          {answer.pdfUrl && (
            <a
              href={answer.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white sm:min-h-0"
            >
              Download PDF
            </a>
          )}
        </div>
      </div>
      {answer.usedSearchGrounding && (
        <p className="text-xs text-slate-500">
          Your books didn&apos;t fully cover this, so it was supplemented with a Google Search.
        </p>
      )}
      <p className="text-xs text-slate-500">AI-generated. Check it before using it with your child or student.</p>
      <Markdown text={answer.text} />
      {answer.searchSuggestionsHtml && <SearchSuggestions html={answer.searchSuggestionsHtml} />}
      {answer.sources.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-500">Sources from your books</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
            {answer.sources.map((s, i) => (
              <li key={s.id}>
                [{i + 1}] {s.section_label ?? s.source_type}
                {s.page_number ? `, p.${s.page_number}` : ""}
              </li>
            ))}
          </ul>
          <SourceImages sources={answer.sources} />
        </div>
      )}
    </div>
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
          <img src={url} alt="Referenced page" className="h-24 w-auto rounded-md border border-slate-200" />
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
    <div className="print:hidden">
      <iframe
        title="Google Search suggestions"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={`<base target="_blank">${html}`}
        className="h-20 w-full border-0"
      />
    </div>
  );
}
