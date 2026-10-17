import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { tidyMath } from "@/lib/tidy-math";

// Styled mappings for the Markdown the prompts ask for. Tables and code blocks
// scroll sideways on narrow screens instead of stretching the page.
const COMPONENTS: Components = {
  h1: ({ children }) => <h2 className="mt-6 mb-3 text-lg font-semibold tracking-tight text-slate-900 first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-6 mb-2 text-base font-semibold text-slate-900 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 mb-1.5 font-semibold text-slate-900">{children}</h4>,
  p: ({ children }) => <p className="mb-3">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1.5 marker:text-slate-400">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1.5 marker:text-slate-500">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  hr: () => <hr className="my-5 border-slate-200" />,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-brand-200 bg-brand-50/50 py-1 pl-4 text-slate-700">{children}</blockquote>
  ),
  // Links open in a new tab so the answer isn't lost.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline underline-offset-2">
      {children}
    </a>
  ),
  // Inline `code` gets a light chip; inside a code block the <pre> styles it.
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] [pre_&]:bg-transparent [pre_&]:p-0">
      {children}
    </code>
  ),
  // Code blocks (e.g. HTML or Python examples) keep their layout and scroll
  // sideways on their own instead of widening the page.
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 [overflow-wrap:normal]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full border-collapse text-left text-sm [overflow-wrap:normal] [&_tr:last-child_td]:border-b-0">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-900">{children}</th>,
  td: ({ children }) => <td className="border-b border-slate-100 px-3 py-2 align-top">{children}</td>,
};

/** Renders an AI answer's Markdown, with stray LaTeX math converted to readable Unicode. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-7 text-slate-700 [overflow-wrap:anywhere] print:text-[11pt] print:leading-normal">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {tidyMath(text)}
      </ReactMarkdown>
    </div>
  );
}
