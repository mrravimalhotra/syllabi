"use client";

import { TABS } from "@/app/dashboard/_ask/constants";
import { cx } from "@/components/ui";
import type { GenerationTaskType } from "@/types/database";

/**
 * The kinds of thing to make (answer, notes, sample paper, study pack, paper check...), as a radio group:
 * one swipeable row of pills on a phone (its right edge fades, to show there are more), so the question box stays in view; a compact grid on a tablet;
 * one row on a wide screen. Under it, one line on what comes back and what to give.
 */
export function TabPicker({ tab, onChoose }: { tab: GenerationTaskType; onChoose: (next: GenerationTaskType) => void }) {
  const current = TABS.find((t) => t.value === tab)!;
  return (
    <div className="space-y-2 print:hidden">
      <div
        role="radiogroup"
        aria-label="What to make"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_80%,transparent)] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 sm:[mask-image:none] lg:grid-cols-6"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChoose(t.value)}
              className={cx(
                "flex shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 py-2 text-left transition sm:rounded-xl sm:px-3",
                selected
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <span
                className={cx(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8",
                  selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                )}
              >
                <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </span>
              <span className="min-w-0">
                <span className={cx("block text-sm font-semibold whitespace-nowrap", selected ? "text-brand-900" : "text-slate-900")}>
                  {t.label}
                </span>
                <span className="hidden truncate text-xs text-slate-500 sm:block">{t.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-slate-600" aria-live="polite">
        <span className="font-medium text-slate-800">You&apos;ll get</span> {current.gets}.{" "}
        <span className="font-medium text-slate-800">Give</span> {current.gives}.
      </p>
    </div>
  );
}
