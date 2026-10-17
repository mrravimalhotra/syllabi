import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { tidyMath } from "@/lib/tidy-math";

// Styled mappings for the Markdown the prompts ask for. Tables and code blocks
// scroll sideways on narrow screens instead of stretching the page.
const COMPONENTS: Components = {
  h1: ({ children }) => <h2 className="mt-4 mb-2 text-base font-semibold text-slate-900">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-sm font-semibold text-slate-900">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-slate-900">{children}</h4>,
  p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-5 list-decimal space-y-1">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  hr: () => <hr className="my-3 border-slate-200" />,
  // Links open in a new tab so the answer isn't lost.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-slate-900 underline">
      {children}
    </a>
  ),
  // Inline `code` gets a light chip; inside a code block the <pre> styles it.
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1 font-mono text-[0.9em] [pre_&]:bg-transparent [pre_&]:p-0">
      {children}
    </code>
  ),
  // Code blocks (e.g. HTML or Python examples) keep their layout and scroll
  // sideways on their own instead of widening the page.
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 [overflow-wrap:normal]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm [overflow-wrap:normal]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-slate-300 bg-slate-50 px-2 py-1 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-slate-300 px-2 py-1">{children}</td>,
};

/** Renders an AI answer's Markdown, with stray LaTeX math converted to readable Unicode. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-sm text-slate-700 [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {tidyMath(text)}
      </ReactMarkdown>
    </div>
  );
}
