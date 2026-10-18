"use client";

import { cx } from "@/components/ui";
import type { StudyPack } from "@/lib/study-pack/types";

export type Tab = "walkthrough" | "textbook" | "practice" | "glossary";
export interface TabInfo {
  id: Tab;
  label: string;
  count?: number;
}

/** The sections this pack has: only those with something in them. */
export function tabsFor(pack: StudyPack): TabInfo[] {
  const tabs: TabInfo[] = [];
  if (pack.walkthrough.length)
    tabs.push({ id: "walkthrough", label: pack.kind === "story" ? "Story" : "Key ideas", count: pack.walkthrough.length });
  if (pack.textbookQuestions.length) {
    tabs.push({
      id: "textbook",
      label: pack.textbookQuestionsWritten ? "Questions" : "Textbook Q&A",
      count: pack.textbookQuestions.length,
    });
  }
  if (pack.practiceQuestions.length) tabs.push({ id: "practice", label: "Practice test", count: pack.practiceQuestions.length });
  if (pack.glossary.length) tabs.push({ id: "glossary", label: "Glossary", count: pack.glossary.length });
  return tabs;
}

/** The section buttons along the top of the pack. */
export function PackTabs({ tabs, tab, onChoose }: { tabs: TabInfo[]; tab: Tab; onChoose: (tab: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Study pack sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 print:hidden">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onChoose(t.id)}
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
  );
}
