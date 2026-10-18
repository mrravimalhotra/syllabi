"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import { Spinner, cx, input } from "@/components/ui";

/** A select that saves as soon as it changes, with a small "Saved" confirmation. */
export function LevelSelect({
  label,
  value,
  options,
  emptyLabel = "Not set",
  onSave,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** Label for the empty choice; null offers no empty choice. */
  emptyLabel?: string | null;
  onSave: (value: string) => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={label}
        value={value}
        disabled={state === "saving"}
        onChange={async (e) => {
          setState("saving");
          try {
            await onSave(e.target.value);
            setState("saved");
          } catch {
            setState("error");
          }
        }}
        className={cx(input, "w-auto min-w-40")}
      >
        {emptyLabel !== null && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {state === "saving" && <Spinner />}
      <span role="status" className="contents">
        {state === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckIcon className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {state === "error" && <span className="text-xs text-red-600">Couldn&apos;t save. Check your connection and choose again.</span>}
      </span>
    </div>
  );
}
