import { Badge, PageHeader, card, cx } from "@/components/ui";
import { allPrompts, ruleGroups, type RuleKind } from "@/lib/rules/catalogue";

const KINDS: Record<RuleKind, { label: string; tone: "brand" | "success" | "warning" | "neutral" | "danger" }> = {
  ai: { label: "AI instruction", tone: "brand" },
  code: { label: "Checked by code", tone: "success" },
  screen: { label: "On screen", tone: "danger" },
  limit: { label: "Limit", tone: "warning" },
  assumption: { label: "Assumption", tone: "neutral" },
};

/** Every rule and assumption behind what is asked of the AI and what is done with its answer, plus the exact instructions sent. */
export default function RulesPage() {
  const groups = ruleGroups();
  const prompts = allPrompts();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules and assumptions"
        description="What Syllabi tells the AI, what it checks itself, and what it assumes. Numbers are read from the code, so this page cannot drift from how the app behaves."
      />

      <nav aria-label="Rule groups" className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50">
            {g.title}
          </a>
        ))}
        <a href="#prompts" className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50">
          Exact instructions
        </a>
      </nav>

      {groups.map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className={cx(card, "scroll-mt-4 space-y-3 p-4 sm:p-5")}>
          <div>
            <h2 id={`${g.id}-title`} className="text-lg font-semibold text-slate-900">
              {g.title}
            </h2>
            <p className="text-sm text-slate-600">{g.intro}</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {g.rules.map((r) => (
              <li key={r.text} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                <span className="shrink-0 sm:w-36">
                  <Badge tone={KINDS[r.kind].tone}>{KINDS[r.kind].label}</Badge>
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{r.text}</p>
                  <p className="break-all text-xs text-slate-400">{r.where}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section id="prompts" aria-labelledby="prompts-title" className={cx(card, "scroll-mt-4 space-y-3 p-4 sm:p-5")}>
        <div>
          <h2 id="prompts-title" className="text-lg font-semibold text-slate-900">
            Exact instructions sent to the AI
          </h2>
          <p className="text-sm text-slate-600">The full text, as the AI receives it. Open one to read it.</p>
        </div>
        {prompts.map((p) => (
          <details key={p.key} className="rounded-lg border border-slate-200">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800">
              {p.title} <span className="font-normal text-slate-500">· {p.usedFor}</span>
            </summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-slate-200 p-3 text-xs text-slate-700">{p.text}</pre>
          </details>
        ))}
      </section>
    </div>
  );
}
