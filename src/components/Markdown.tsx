"use client";

import { lazy, Suspense } from "react";

// The Markdown renderer (react-markdown and remark-gfm) is a large download, and most screens show tiles before
// any answer, so it is fetched the first time an answer is shown (or earlier, through preloadMarkdown).
const load = () => import("@/components/MarkdownView");
const MarkdownView = lazy(() => load().then((m) => ({ default: m.MarkdownView })));

/** Starts fetching the renderer before an answer arrives, so the answer appears formatted. */
export function preloadMarkdown() {
  void load().catch(() => {});
}

/** Renders an AI answer's Markdown; until the renderer has loaded, the answer shows as plain text. */
export function Markdown({ text }: { text: string }) {
  return (
    <Suspense
      fallback={
        <div className="whitespace-pre-line text-[15px] leading-7 text-slate-700 [overflow-wrap:anywhere] print:text-[11pt] print:leading-normal">
          {text}
        </div>
      }
    >
      <MarkdownView text={text} />
    </Suspense>
  );
}
