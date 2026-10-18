"use client";

import { useState } from "react";
import { button, cx, input } from "@/components/ui";
import { normaliseResponse } from "@/lib/study-pack/auto-key";
import type { PackQuestion } from "@/lib/study-pack/types";

/**
 * The child's own answer to an objective question: tap an option, True or
 * False, or type the missing word. Marked by code against the key.
 */
export function ObjectiveResponse({ q, locked, onRespond }: { q: PackQuestion; locked: boolean; onRespond: (correct: boolean) => void }) {
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
          : "border-slate-200 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50",
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
